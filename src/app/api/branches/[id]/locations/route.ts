import { z } from "zod";
import { archiveLocation } from "@/modules/branches/archive-location";
import { and, eq, isNull } from "drizzle-orm";
import { getDb } from "@/db/client";
import { locations } from "@/db/branch-schema";
import { requireActor } from "@/lib/auth";
import { requireOperationalContext } from "@/modules/branches/context";
import { locationSchema } from "@/modules/branches/validation";
import {
  privateJson,
  errorResponse,
  requestInput,
} from "@/modules/catalog/http";
import { AppError } from "@/lib/errors";
type Params = { params: Promise<{ id: string }> };
export async function GET(_request: Request, { params }: Params) {
  try {
    const { id } = await params,
      db = await getDb();
    await requireOperationalContext(db, await requireActor(), id);
    return privateJson({
      rows: await db
        .select()
        .from(locations)
        .where(and(eq(locations.branchId, id), isNull(locations.archivedAt)))
        .orderBy(locations.name),
    });
  } catch (error) {
    return errorResponse(error);
  }
}
export async function POST(request: Request, { params }: Params) {
  try {
    const { id } = await params,
      actor = await requireActor(),
      db = await getDb(),
      input = locationSchema.parse(await requestInput(request));
    const result = await db.transaction(async (tx) => {
      const ctx = await requireOperationalContext(tx, actor, id);
      if (ctx.role === "staff")
        throw new AppError("FORBIDDEN", "Se requiere un encargado.", 403);
      const [row] = await tx
        .insert(locations)
        .values({ ...input, branchId: id })
        .returning();
      return row;
    });
    return privateJson(result, 201);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(request: Request, { params }: Params) {
  try {
    const { id } = await params;
    const input = z
      .object({ locationId: z.uuid(), revision: z.number().int().positive() })
      .strict()
      .parse(await requestInput(request));
    return privateJson(
      await archiveLocation(
        await getDb(),
        await requireActor(),
        id,
        input.locationId,
        input.revision,
      ),
    );
  } catch (error) {
    return errorResponse(error);
  }
}
