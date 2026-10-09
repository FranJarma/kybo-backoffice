import { z } from "zod";
import { getDb } from "@/db/client";
import { requireActor } from "@/lib/auth";
import { errorResponse } from "@/modules/catalog/http";
import { readPhoto } from "@/modules/media/service";
import { photoStorage } from "@/modules/media/storage";
export const runtime = "nodejs";
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const actor = await requireActor();
    const id = z.uuid().parse((await params).id);
    const stream = await readPhoto(await getDb(), actor, id, photoStorage());
    return new Response(stream, {
      status: stream ? 200 : 404,
      headers: {
        "Content-Type": "image/webp",
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (e) {
    return errorResponse(e);
  }
}
