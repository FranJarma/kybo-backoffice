import { and, eq, inArray, or, sql } from "drizzle-orm";
import type { AppDb } from "@/db/client";
import { branches, locations } from "@/db/branch-schema";
import { operationalUsers } from "@/db/auth-schema";
import type { Actor } from "@/lib/access";
import { AppError } from "@/lib/errors";
import { branchSchema } from "./validation";
import { locationStockBalances } from "@/db/stock-schema";
import { stockTransfers } from "@/db/transfer-schema";
import { productionOrders } from "@/db/production-order-schema";
import { preparationTasks } from "@/db/preparation-schema";
import { sales } from "@/db/sales-schema";
import { stockResolutions } from "@/db/stock-resolution-schema";
export async function createBranch(
  db: AppDb,
  actor: Actor,
  raw: unknown,
): Promise<{ id: string }> {
  const input = branchSchema.parse(raw);
  return db.transaction(async (tx) => {
    const [account] = await tx
      .select()
      .from(operationalUsers)
      .where(eq(operationalUsers.userId, actor.id))
      .for("share");
    if (!account || account.disabled || account.role !== "admin")
      throw new AppError(
        "FORBIDDEN",
        "Solo un administrador puede crear sucursales.",
        403,
      );
    const [branch] = await tx
      .insert(branches)
      .values({ code: input.code, name: input.name, timeZone: input.timeZone })
      .returning({ id: branches.id });
    await tx
      .insert(locations)
      .values(input.locations.map((l) => ({ ...l, branchId: branch.id })));
    return branch;
  });
}
export async function archiveBranch(
  db: AppDb,
  actor: Actor,
  branchId: string,
  revision: number,
) {
  return db.transaction(async (tx) => {
    const [account] = await tx
      .select()
      .from(operationalUsers)
      .where(eq(operationalUsers.userId, actor.id))
      .for("share");
    if (!account || account.disabled || account.role !== "admin")
      throw new AppError(
        "FORBIDDEN",
        "Solo un administrador puede cerrar sucursales.",
        403,
      );
    const [branch] = await tx
      .select()
      .from(branches)
      .where(eq(branches.id, branchId))
      .for("update");
    if (!branch || branch.archivedAt || branch.revision !== revision)
      throw new AppError("CONFLICT", "La sucursal cambió.", 409);
    // Branch row locking is also required by every operational context.
    const balances = await tx
      .select()
      .from(locationStockBalances)
      .where(
        and(
          eq(locationStockBalances.branchId, branchId),
          sql`(${locationStockBalances.quantity} <> 0 or ${locationStockBalances.reserved} <> 0)`,
        ),
      )
      .limit(1);
    const transit = await tx
      .select()
      .from(stockTransfers)
      .where(
        and(
          or(
            eq(stockTransfers.originBranchId, branchId),
            eq(stockTransfers.destinationBranchId, branchId),
          ),
          inArray(stockTransfers.state, ["confirmed", "in_transit"]),
        ),
      )
      .limit(1);
    const production = await tx
      .select()
      .from(productionOrders)
      .where(
        and(
          eq(productionOrders.branchId, branchId),
          eq(productionOrders.state, "confirmed"),
        ),
      )
      .limit(1);
    const preparation = await tx
      .select()
      .from(preparationTasks)
      .where(
        and(
          eq(preparationTasks.branchId, branchId),
          inArray(preparationTasks.status, ["pending", "preparing", "ready"]),
        ),
      )
      .limit(1);
    const openSales = await tx
      .select()
      .from(sales)
      .where(and(eq(sales.branchId, branchId), eq(sales.status, "open")))
      .limit(1);
    const resolutions = await tx
      .select()
      .from(stockResolutions)
      .where(
        and(
          eq(stockResolutions.branchId, branchId),
          eq(stockResolutions.state, "pending"),
        ),
      )
      .limit(1);
    if (
      [balances, transit, production, preparation, openSales, resolutions].some(
        (rows) => rows.length,
      )
    )
      throw new AppError(
        "BRANCH_NOT_EMPTY",
        "Resolvé existencias, tránsito y trabajo pendiente antes de cerrar la sucursal.",
        409,
      );
    await tx
      .update(branches)
      .set({ archivedAt: new Date(), revision: revision + 1 })
      .where(eq(branches.id, branchId));
    return { id: branchId, revision: revision + 1 };
  });
}
