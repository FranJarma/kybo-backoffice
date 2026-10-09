import sharp from "sharp";
import { AppError } from "@/lib/errors";
export const MAX_PHOTO_BYTES = 4 * 1024 * 1024;
export async function normalizePhoto(raw: Buffer) {
  if (!raw.length || raw.length > MAX_PHOTO_BYTES)
    throw new AppError("PHOTO_SIZE", "Elegí una foto de hasta 4 MB.", 413);
  try {
    const input = sharp(raw, { limitInputPixels: 25_000_000, animated: true });
    const meta = await input.metadata();
    if (
      !meta.format ||
      !["jpeg", "png", "webp"].includes(meta.format) ||
      (meta.pages ?? 1) !== 1
    )
      throw new Error("format");
    const { data, info } = await input
      .rotate()
      .resize({
        width: 1600,
        height: 1600,
        fit: "inside",
        withoutEnlargement: true,
      })
      .webp({ quality: 82 })
      .toBuffer({ resolveWithObject: true });
    return { data, width: info.width, height: info.height };
  } catch {
    throw new AppError(
      "PHOTO_FORMAT",
      "Usá una foto JPEG, PNG o WebP sin animación y de hasta 25 megapíxeles.",
      400,
    );
  }
}
