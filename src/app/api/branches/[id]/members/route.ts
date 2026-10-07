import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db/client";
import { branchMemberships } from "@/db/branch-schema";
import { operationalUsers, user } from "@/db/auth-schema";
import { requireActor } from "@/lib/auth";
import {
  privateJson,
  errorResponse,
  requestInput,
} from "@/modules/catalog/http";
import { AppError } from "@/lib/errors";
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params,
      actor = await requireActor(),
      db = await getDb();
    if (actor.role !== "admin")
      throw new AppError(
        "FORBIDDEN",
        "Solo un administrador puede consultar accesos.",
        403,
      );
    const rows = await db
      .select({
        id: user.id,
        name: user.name,
        role: branchMemberships.role,
        revokedAt: branchMemberships.revokedAt,
        catalogManager: operationalUsers.catalogManager,
      })
      .from(operationalUsers)
      .innerJoin(user, eq(user.id, operationalUsers.userId))
      .leftJoin(
        branchMemberships,
        and(
          eq(branchMemberships.userId, user.id),
          eq(branchMemberships.branchId, z.uuid().parse(id)),
        ),
      )
      .where(eq(operationalUsers.disabled, false))
      .orderBy(user.name);
    return privateJson({ rows });
  } catch (error) {
    return errorResponse(error);
  }
}
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params,
      actor = await requireActor(),
      db = await getDb();
    const input = z
      .object({
        userId: z.string().min(1).max(200),
        role: z.enum(["manager", "staff"]),
        revoked: z.boolean(),
        catalogManager: z.boolean().optional(),
      })
      .strict()
      .parse(await requestInput(request));
    await db.transaction(async (tx) => {
      const [admin] = await tx
        .select()
        .from(operationalUsers)
        .where(eq(operationalUsers.userId, actor.id))
        .for("share");
      if (!admin || admin.disabled || admin.role !== "admin")
        throw new AppError(
          "FORBIDDEN",
          "Solo un administrador puede asignar accesos.",
          403,
        );
      const [target] = await tx
        .select()
        .from(operationalUsers)
        .where(eq(operationalUsers.userId, input.userId))
        .for("update");
      if (!target || target.disabled)
        throw new AppError(
          "VALIDATION",
          "Elegí una cuenta operativa habilitada.",
          400,
        );
      if (input.catalogManager !== undefined)
        await tx
          .update(operationalUsers)
          .set({ catalogManager: input.catalogManager })
          .where(eq(operationalUsers.userId, input.userId));
      await tx
        .insert(branchMemberships)
        .values({
          branchId: z.uuid().parse(id),
          userId: input.userId,
          role: input.role,
          revokedAt: input.revoked ? new Date() : null,
        })
        .onConflictDoUpdate({
          target: [branchMemberships.branchId, branchMemberships.userId],
          set: {
            role: input.role,
            revokedAt: input.revoked ? new Date() : null,
          },
        });
    });
    return privateJson({ saved: true });
  } catch (error) {
    return errorResponse(error);
  }
}
