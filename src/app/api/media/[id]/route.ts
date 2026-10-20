import { z } from "zod";
import { getDb } from "@/db/client";
import { requireActor } from "@/lib/auth";
import { errorResponse } from "@/modules/catalog/http";
import { readPhoto } from "@/modules/media/service";
import { photoStorage } from "@/modules/media/storage";
import { photoVariants } from "@/modules/media/photo-variants";
export const runtime = "nodejs";
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const actor = await requireActor();
    const id = z.uuid().parse((await params).id);
    const variant = z
      .enum(photoVariants)
      .parse(new URL(request.url).searchParams.get("size") ?? "original");
    const stream = await readPhoto(
      await getDb(),
      actor,
      id,
      photoStorage(),
      variant,
    );
    if (!stream)
      return new Response(null, {
        status: 404,
        headers: { "Cache-Control": "private, no-store" },
      });
    const etag = `W/"${id}-${variant}-v1"`;
    const responseHeaders = {
      "Content-Type": "image/webp",
      "Cache-Control": "private, max-age=86400, immutable",
      Vary: "Cookie",
      ETag: etag,
      "X-Content-Type-Options": "nosniff",
    };
    const unchanged = request.headers
      .get("if-none-match")
      ?.split(",")
      .some((value) => value.trim() === etag || value.trim() === "*");
    if (unchanged) {
      await stream.cancel();
      return new Response(null, { status: 304, headers: responseHeaders });
    }
    return new Response(stream, { status: 200, headers: responseHeaders });
  } catch (e) {
    return errorResponse(e);
  }
}
