import { createHash } from "node:crypto";
import { z } from "zod";
import { AppError } from "@/lib/errors";

export type GeocodedAddress = {
  id: string;
  name: string;
  description: string;
  address: string;
  latitude: number;
  longitude: number;
  source: "photon";
};
const candidate = z.object({
  geometry: z.object({
    type: z.literal("Point"),
    coordinates: z.tuple([
      z.number().finite().min(-180).max(180),
      z.number().finite().min(-90).max(90),
    ]),
  }),
  properties: z.object({
    countrycode: z.string(),
    name: z.string().optional(),
    street: z.string().optional(),
    housenumber: z.string().optional(),
    city: z.string().optional(),
    locality: z.string().optional(),
    county: z.string().optional(),
    state: z.string().optional(),
    country: z.string().optional(),
  }),
});
export function photonAddresses(raw: unknown): GeocodedAddress[] {
  const body = z
    .object({ features: z.array(z.unknown()).max(100) })
    .safeParse(raw);
  if (!body.success)
    throw new AppError(
      "GEOCODING_UNAVAILABLE",
      "El buscador de direcciones devolvió una respuesta inválida. Volvé a intentar.",
      502,
    );
  const seen = new Set<string>();
  return body.data.features
    .flatMap((value) => {
      const result = candidate.safeParse(value);
      if (
        !result.success ||
        result.data.properties.countrycode.toUpperCase() !== "AR"
      )
        return [];
      const { geometry, properties: p } = result.data;
      const name = p.street
        ? [p.street, p.housenumber].filter(Boolean).join(" ")
        : p.name;
      if (!name) return [];
      const description = [
        p.city ?? p.locality,
        p.county,
        p.state,
        p.country ?? "Argentina",
      ]
        .filter(Boolean)
        .join(" · ");
      const address = `${name}, ${[p.city ?? p.locality, p.state, p.country ?? "Argentina"].filter(Boolean).join(", ")}`;
      const [longitude, latitude] = geometry.coordinates;
      const id = createHash("sha256")
        .update(JSON.stringify([address, latitude, longitude]))
        .digest("hex")
        .slice(0, 20);
      if (seen.has(id)) return [];
      seen.add(id);
      return [
        {
          id,
          name,
          description,
          address,
          latitude,
          longitude,
          source: "photon" as const,
        },
      ];
    })
    .slice(0, 6);
}

async function requestPhoton(query: string): Promise<unknown> {
  const url = new URL(
    process.env.KYBO_GEOCODER_URL ?? "https://photon.komoot.io/api/",
  );
  if (url.protocol !== "https:" || url.username || url.password)
    throw new AppError(
      "GEOCODING_UNAVAILABLE",
      "El buscador de direcciones no está configurado correctamente.",
      503,
    );
  url.search = new URLSearchParams({
    q: query,
    limit: "6",
    countrycode: "AR",
  }).toString();
  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
      "User-Agent": "KyboOperations/0.6 (branch address configuration)",
    },
    signal: AbortSignal.timeout(6000),
    cache: "no-store",
    redirect: "error",
  });
  if (!response.ok) throw new Error("Provider unavailable");
  const text = await response.text();
  if (text.length > 128000) throw new Error("Provider response too large");
  return JSON.parse(text);
}

export function createAddressGeocoder({
  request = requestPhoton,
  now = Date.now,
}: {
  request?: (query: string) => Promise<unknown>;
  now?: () => number;
} = {}) {
  const cache = new Map<string, { expires: number; rows: GeocodedAddress[] }>();
  const pending = new Map<string, Promise<GeocodedAddress[]>>();
  let nextSearchAt = 0;
  return async (input: string): Promise<GeocodedAddress[]> => {
    const query = z
      .string()
      .trim()
      .min(5)
      .max(240)
      .parse(input)
      .replace(/\s+/g, " ");
    const key = query.toLocaleLowerCase();
    const stored = cache.get(key);
    if (stored && stored.expires > now()) return stored.rows;
    const inflight = pending.get(key);
    if (inflight) return inflight;
    if (now() < nextSearchAt)
      throw new AppError(
        "GEOCODING_RATE",
        "Esperá un segundo antes de volver a buscar.",
        429,
      );
    nextSearchAt = now() + 1000;
    const promise = request(query)
      .then(photonAddresses)
      .then((rows) => {
        if (cache.size >= 128) cache.delete(cache.keys().next().value!);
        cache.set(key, { rows, expires: now() + 6 * 60 * 60 * 1000 });
        return rows;
      })
      .catch(() => {
        throw new AppError(
          "GEOCODING_UNAVAILABLE",
          "No pudimos consultar el buscador de direcciones. Volvé a intentar o usá el ajuste avanzado si ya conocés el punto del local.",
          502,
        );
      })
      .finally(() => {
        pending.delete(key);
      });
    pending.set(key, promise);
    return promise;
  };
}
export const searchAddresses = createAddressGeocoder();
