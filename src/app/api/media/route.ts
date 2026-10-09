import { getDb } from "@/db/client";
import { requireActor } from "@/lib/auth";
import { configuredOrigins } from "@/lib/origins";
import { AppError } from "@/lib/errors";
import { requireCatalogManagement } from "@/modules/branches/context";
import { errorResponse, privateJson } from "@/modules/catalog/http";
import { MAX_PHOTO_BYTES } from "@/modules/media/image";
import { photoStorage } from "@/modules/media/storage";
import { uploadPhoto } from "@/modules/media/service";
export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
    const actor = await requireActor(),
      db = await getDb();
    await requireCatalogManagement(db, actor);
    if (!configuredOrigins().includes(request.headers.get("origin") ?? ""))
      throw new AppError("FORBIDDEN", "Origen no autorizado.", 403);
    const storage = photoStorage();
    const reader = request.body?.getReader();
    if (!reader) throw new AppError("VALIDATION", "Elegí una foto.", 400);
    const parts: Uint8Array[] = [];
    let bytes = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.length;
      if (bytes > MAX_PHOTO_BYTES) {
        await reader.cancel();
        throw new AppError("PHOTO_SIZE", "Elegí una foto de hasta 4 MB.", 413);
      }
      parts.push(value);
    }
    return privateJson(
      await uploadPhoto(db, actor, Buffer.concat(parts), storage),
      201,
    );
  } catch (e) {
    return errorResponse(e);
  }
}
