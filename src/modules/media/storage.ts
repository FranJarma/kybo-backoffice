import { put, get, del } from "@vercel/blob";
import { AppError } from "@/lib/errors";
export interface PhotoStorage {
  put(key: string, data: Buffer): Promise<void>;
  get(key: string): Promise<ReadableStream<Uint8Array> | null>;
  delete(key: string): Promise<void>;
}
export function photoStorage(): PhotoStorage {
  if (!process.env.BLOB_READ_WRITE_TOKEN && !process.env.BLOB_STORE_ID)
    throw new AppError(
      "PHOTO_NOT_CONFIGURED",
      "El almacenamiento de fotos todavía no está configurado.",
      503,
    );
  return {
    async put(key, data) {
      await put(key, data, {
        access: "private",
        contentType: "image/webp",
        addRandomSuffix: false,
        allowOverwrite: false,
      });
    },
    async get(key) {
      const blob = await get(key, { access: "private" });
      return blob?.statusCode === 200 ? blob.stream : null;
    },
    async delete(key) {
      await del(key);
    },
  };
}
