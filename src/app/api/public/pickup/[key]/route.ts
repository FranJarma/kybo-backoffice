import { getDb } from "@/db/client";
import { privateJson, errorResponse } from "@/modules/catalog/http";
import { publicQueue } from "@/modules/pickup/queries";
import { z } from "zod";
export const runtime = "nodejs";
export async function GET(
  request: Request,
  { params }: { params: Promise<{ key: string }> },
) {
  try {
    const offset = z.coerce
      .number()
      .int()
      .min(0)
      .max(1_000_000)
      .parse(new URL(request.url).searchParams.get("offset") ?? 0);
    return privateJson(
      await publicQueue(await getDb(), (await params).key, offset),
    );
  } catch (error) {
    return errorResponse(error);
  }
}
