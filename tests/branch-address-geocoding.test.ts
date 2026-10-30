import { expect, it, vi } from "vitest";
import {
  createAddressGeocoder,
  photonAddresses,
} from "@/modules/branches/geocoding";

const feature = (city: string, lon: number, lat: number) => ({
  geometry: { type: "Point", coordinates: [lon, lat] },
  properties: {
    osm_type: "W",
    osm_id: city === "Salta" ? 202496336 : 977737420,
    street: "Alberdi",
    housenumber: "143",
    city,
    county: city === "Salta" ? "Capital" : "General Güemes",
    state: "Salta",
    country: "Argentina",
    countrycode: "AR",
  },
});
it("preserves distinct cities for the same street/number and exposes correct longitude/latitude", () => {
  const rows = photonAddresses({
    features: [
      feature("General Güemes", -65.0453764, -24.675463),
      feature("Salta", -65.411158, -24.791624),
    ],
  });
  expect(rows).toHaveLength(2);
  expect(rows[0].description).toContain("General Güemes");
  expect(rows[1]).toMatchObject({
    latitude: -24.791624,
    longitude: -65.411158,
  });
  expect(rows[1].description).toContain("Capital");
});
it("does not invent coordinates for malformed or foreign results", () => {
  const good = feature("Salta", -65.4, -24.7);
  expect(
    photonAddresses({
      features: [
        { ...good, geometry: { type: "Point", coordinates: [NaN, null] } },
        { ...good, properties: { ...good.properties, countrycode: "CL" } },
        { ...good, geometry: { type: "Point", coordinates: [-65.4, 200] } },
      ],
    }),
  ).toEqual([]);
});
it("shares and caches repeated searches instead of requesting the provider again", async () => {
  let calls = 0;
  const search = createAddressGeocoder({
    request: async () => {
      calls++;
      return { features: [feature("Salta", -65.4, -24.7)] };
    },
    now: () => 10000,
  });
  const [one, two] = await Promise.all([
    search("Alberdi 143, Salta"),
    search("Alberdi 143, Salta"),
  ]);
  await search("  Alberdi 143, Salta  ");
  expect(one).toEqual(two);
  expect(calls).toBe(1);
});
it("rejects a malformed upstream response and allows retry after a provider failure", async () => {
  let calls = 0;
  let time = 10000;
  const search = createAddressGeocoder({
    request: async () => {
      if (++calls === 1) throw new Error("offline");
      return { features: [] };
    },
    now: () => time,
  });
  await expect(search("Alberdi 143, Salta")).rejects.toThrow();
  time += 1100;
  await expect(search("Alberdi 143, Salta")).resolves.toEqual([]);
  expect(() => photonAddresses({ malformed: true })).toThrow();
});
it("limits distinct rapid searches while permitting cached lookups", async () => {
  const request = vi.fn(async () => ({ features: [] }));
  const search = createAddressGeocoder({ request, now: () => 10000 });
  await search("Alberdi 143, Salta");
  await expect(search("Otra dirección, Salta")).rejects.toMatchObject({
    status: 429,
  });
  await expect(search("Alberdi 143, Salta")).resolves.toEqual([]);
});
