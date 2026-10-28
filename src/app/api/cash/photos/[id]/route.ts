import { z } from "zod";
import { getDb } from "@/db/client";
import { operationalActor } from "@/modules/branches/http";
import { errorResponse, privateJson } from "@/modules/catalog/http";
import { photoStorage } from "@/modules/media/storage";
import { readCashPhoto } from "@/modules/cash/photos";
export const runtime = "nodejs";
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const branchId = z
      .uuid()
      .optional()
      .parse(new URL(request.url).searchParams.get("branchId") ?? undefined);
    const headers = new Headers(request.headers);
    if (branchId) headers.set("X-Kybo-Branch-Id", branchId);
    const actor = await operationalActor(new Request(request.url, { headers })),
      id = z.uuid().parse((await params).id),
      stream = await readCashPhoto(await getDb(), actor, id, photoStorage());
    if (!stream)
      return privateJson({ error: "No se encontró el comprobante." }, 404);
    return new Response(stream, {
      headers: {
        "Content-Type": "image/webp",
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'none'",
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
