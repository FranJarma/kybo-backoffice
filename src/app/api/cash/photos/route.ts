import { z } from "zod";
import { getDb } from "@/db/client";
import { configuredOrigins } from "@/lib/origins";
import { AppError } from "@/lib/errors";
import { operationalActor } from "@/modules/branches/http";
import { errorResponse, privateJson } from "@/modules/catalog/http";
import { photoStorage } from "@/modules/media/storage";
import { MAX_CASH_PHOTO_BYTES, uploadCashPhoto } from "@/modules/cash/photos";
export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
    const actor = await operationalActor(request);
    if (!configuredOrigins().includes(request.headers.get("origin") ?? ""))
      throw new AppError("FORBIDDEN", "Origen no autorizado.", 403);
    const sessionId = z
      .uuid()
      .parse(new URL(request.url).searchParams.get("sessionId"));
    if (
      !["image/jpeg", "image/png", "image/webp"].includes(
        request.headers.get("content-type")?.split(";")[0] ?? "",
      )
    )
      throw new AppError("PHOTO_FORMAT", "Usá una foto JPG, PNG o WebP.", 400);
    const reader = request.body?.getReader();
    if (!reader) throw new AppError("PHOTO_SIZE", "Elegí una foto.", 400);
    const chunks: Uint8Array[] = [];
    let length = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.length;
      if (length > MAX_CASH_PHOTO_BYTES) {
        await reader.cancel();
        throw new AppError("PHOTO_SIZE", "Elegí una foto de hasta 10 MB.", 413);
      }
      chunks.push(value);
    }
    return privateJson(
      await uploadCashPhoto(
        await getDb(),
        actor,
        sessionId,
        Buffer.concat(chunks),
        photoStorage(),
      ),
      201,
    );
  } catch (error) {
    return errorResponse(error);
  }
}
