import { and, eq, or } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db/client";
import { branchMemberships } from "@/db/branch-schema";
import { operationalUsers, session, user } from "@/db/auth-schema";
import {
  getStoreProfile,
  workplaceSchemaReady,
} from "@/modules/workplace/access";
import { workplaceManagementAuthorizations } from "@/db/workplace-schema";
import { requireActor } from "@/lib/auth";
import {
  privateJson,
  errorResponse,
  requestInput,
} from "@/modules/catalog/http";
import { AppError } from "@/lib/errors";
import { lockUserAdministration } from "@/modules/users/service";
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
        accountRole: operationalUsers.role,
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
      const operators = await lockUserAdministration(tx, actor);
      const target = operators.find(
        (operator) => operator.userId === input.userId,
      );
      if (!target || target.disabled)
        throw new AppError(
          "VALIDATION",
          "Elegí una cuenta operativa habilitada.",
          400,
        );
      const store = await getStoreProfile(tx, input.userId);
      if (
        store &&
        (store.branchId !== id ||
          input.role !== "staff" ||
          input.catalogManager)
      )
        throw new AppError(
          "FORBIDDEN",
          "La cuenta del local solo puede tener acceso limitado a su sucursal.",
          403,
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
      // Access restored later must never revive a prior session or management grant.
      await tx.delete(session).where(eq(session.userId, input.userId));
      if (await workplaceSchemaReady(tx))
        await tx
          .update(workplaceManagementAuthorizations)
          .set({ revokedAt: new Date() })
          .where(
            or(
              eq(workplaceManagementAuthorizations.managerUserId, input.userId),
              eq(workplaceManagementAuthorizations.storeUserId, input.userId),
            ),
          );
    });
    return privateJson({ saved: true });
  } catch (error) {
    return errorResponse(error);
  }
}
