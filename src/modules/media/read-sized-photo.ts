import sharp from "sharp";
import type { PhotoStorage } from "./storage";
import type { PhotoCache } from "./photo-cache";
import { photoDimensions, type PhotoVariant } from "./photo-variants";

export async function readSizedPhoto(
  storage: PhotoStorage,
  key: string,
  variant: PhotoVariant,
  cache: PhotoCache,
) {
  const original = () =>
    cache.read(`photo-v1:${key}:original`, async () => {
      const stream = await storage.get(key);
      return stream
        ? Buffer.from(await new Response(stream).arrayBuffer())
        : null;
    });
  if (variant === "original") return original();
  return cache.read(`photo-v1:${key}:${variant}`, async () => {
    const source = await original();
    if (!source) return null;
    const size = photoDimensions[variant];
    return sharp(source, { limitInputPixels: 25_000_000 })
      .resize({
        width: size,
        height: size,
        fit: "inside",
        withoutEnlargement: true,
      })
      .webp({ quality: 80 })
      .toBuffer();
  });
}
