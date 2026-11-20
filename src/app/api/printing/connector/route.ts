import { getDb } from "@/db/client";
import { AppError } from "@/lib/errors";
import { errorResponse, privateJson } from "@/modules/catalog/http";
import { runConnectorCommand } from "@/modules/printing/connector";
export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
    const url = new URL(request.url);
    if (
      url.protocol !== "https:" &&
      !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
    )
      throw new AppError("FORBIDDEN", "El conector requiere HTTPS.", 403);
    if (!request.headers.get("content-type")?.includes("application/json"))
      throw new AppError("VALIDATION", "Se requiere JSON.", 400);
    const reader = request.body?.getReader();
    if (!reader) throw new AppError("VALIDATION", "Faltan los datos.", 400);
    const chunks: Uint8Array[] = [];
    let size = 0;
    for (;;) {
      const part = await reader.read();
      if (part.done) break;
      size += part.value.length;
      if (size > 12000) {
        await reader.cancel();
        throw new AppError(
          "VALIDATION",
          "La solicitud es demasiado grande.",
          413,
        );
      }
      chunks.push(part.value);
    }
    let body: unknown;
    try {
      body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    } catch {
      throw new AppError("VALIDATION", "Se requiere JSON válido.", 400);
    }
    const token =
      request.headers.get("authorization")?.replace(/^Bearer /, "") ?? "";
    const response = privateJson(
      await runConnectorCommand(await getDb(), token, body),
    );
    response.headers.set("Content-Type", "application/json; charset=utf-8");
    return response;
  } catch (error) {
    const response = errorResponse(error);
    response.headers.set("Content-Type", "application/json; charset=utf-8");
    return response;
  }
}
