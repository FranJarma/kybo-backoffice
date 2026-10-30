import { z } from "zod";
import { getDb } from "@/db/client";
import { requireActor } from "@/lib/auth";
import {
  privateJson,
  requestInput,
  errorResponse,
} from "@/modules/catalog/http";
import {
  requireAdministrator,
  requireOperationalContext,
} from "@/modules/branches/context";
import { searchAddresses } from "@/modules/branches/geocoding";
export const runtime = "nodejs";
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { query } = z
      .object({ query: z.string().trim().min(5).max(240) })
      .strict()
      .parse(await requestInput(request, 2000));
    const db = await getDb(),
      actor = await requireActor();
    await requireAdministrator(db, actor);
    await requireOperationalContext(db, actor, (await params).id);
    return privateJson({ rows: await searchAddresses(query) });
  } catch (error) {
    return errorResponse(error);
  }
}
