import { and, asc, eq, isNull, or } from "drizzle-orm";
import type { AppDb } from "@/db/client";
import type { Tx } from "@/db/types";
import type { Actor } from "@/lib/access";
import { AppError } from "@/lib/errors";
import {
  dailyOperationTasks as tasks,
  dailyOperationDependencies as deps,
} from "@/db/daily-operation-schema";
import { locations, branchMemberships } from "@/db/branch-schema";
import { items } from "@/db/item-schema";
import { user, operationalUsers } from "@/db/auth-schema";
import { inventoryLots } from "@/db/inventory-schema";
import { lotLocationBalances } from "@/db/stock-schema";
import { replenishmentPolicies } from "@/db/replenishment-schema";
import { stockTransfers, transferAllocations } from "@/db/transfer-schema";
import { requireOperationalContext } from "../branches/context";
import { businessDate } from "../operations/business-date";
import { integer, six } from "../inventory/decimal";
import { availableQuantity } from "../inventory/availability";
import { dayFiltersSchema } from "./validation";
import { supplyAvailable } from "../supply-alerts/policies";
import type { DailySnapshot, StockRow, TaskRow } from "./types";
export async function readStock(
  tx: Tx,
  branchId: string,
  today: string,
): Promise<StockRow[]> {
  const locs = await tx
    .select({ id: locations.id, name: locations.name })
    .from(locations)
    .where(and(eq(locations.branchId, branchId), isNull(locations.archivedAt)))
    .orderBy(asc(locations.name));
  const catalog = await tx
    .select({
      id: items.id,
      name: items.name,
      unit: items.baseUnit,
      archivedAt: items.archivedAt,
    })
    .from(items)
    .where(eq(items.stockTracked, true))
    .orderBy(asc(items.name));
  const rows = await tx
    .select({ lot: inventoryLots, balance: lotLocationBalances })
    .from(lotLocationBalances)
    .innerJoin(inventoryLots, eq(inventoryLots.id, lotLocationBalances.lotId))
    .where(eq(lotLocationBalances.branchId, branchId));
  const map = new Map<
    string,
    { physical: bigint; reserved: bigint; unusable: bigint; available: bigint }
  >();
  for (const { lot, balance } of rows) {
    const key = `${lot.itemId}:${balance.locationId}`,
      v = map.get(key) ?? {
        physical: 0n,
        reserved: 0n,
        unusable: 0n,
        available: 0n,
      };
    const physical = integer(balance.quantity),
      reserved = integer(balance.reserved);
    const available = availableQuantity(
      {
        ...lot,
        locationBlocked: balance.blocked,
        quantity: physical,
        reserved,
      },
      today,
    );
    v.physical += physical;
    v.reserved += reserved;
    v.available += available;
    v.unusable += physical - reserved - available;
    map.set(key, v);
  }
  return locs.flatMap((l) =>
    catalog
      .filter(
        (i) =>
          !i.archivedAt || (map.get(`${i.id}:${l.id}`)?.physical ?? 0n) > 0n,
      )
      .map((i) => {
        const v = map.get(`${i.id}:${l.id}`);
        return {
          itemId: i.id,
          itemName: i.name,
          unit: i.unit,
          locationId: l.id,
          locationName: l.name,
          physical: six(v?.physical ?? 0n),
          reserved: six(v?.reserved ?? 0n),
          unusable: six(v?.unusable ?? 0n),
          available: six(v?.available ?? 0n),
        };
      }),
  );
}
export async function getDailyOperationSnapshot(
  db: AppDb,
  actor: Actor,
  raw: unknown,
): Promise<DailySnapshot> {
  const filters = dayFiltersSchema.parse(raw);
  return db.transaction(
    async (tx) => {
      const ctx = await requireOperationalContext(
        tx,
        actor,
        actor.branchId ?? "",
      );
      if (ctx.role === "staff" && !filters.mine)
        throw new AppError(
          "FORBIDDEN",
          "Solo podés consultar tus tareas.",
          403,
        );
      const now = new Date(),
        today = businessDate(now, ctx.timeZone);
      const locs = await tx
        .select({ id: locations.id, name: locations.name })
        .from(locations)
        .where(eq(locations.branchId, ctx.branchId));
      const people =
        ctx.role !== "staff"
          ? await tx
              .selectDistinct({ id: user.id, name: user.name })
              .from(user)
              .innerJoin(operationalUsers, eq(operationalUsers.userId, user.id))
              .leftJoin(
                branchMemberships,
                and(
                  eq(branchMemberships.userId, user.id),
                  eq(branchMemberships.branchId, ctx.branchId),
                  isNull(branchMemberships.revokedAt),
                ),
              )
              .where(
                and(
                  eq(operationalUsers.disabled, false),
                  or(
                    eq(operationalUsers.role, "admin"),
                    eq(branchMemberships.branchId, ctx.branchId),
                  ),
                ),
              )
          : [];
      const records = await tx
        .select({ task: tasks, name: user.name })
        .from(tasks)
        .leftJoin(user, eq(user.id, tasks.assignedTo))
        .where(
          and(
            eq(tasks.branchId, ctx.branchId),
            filters.mine ? eq(tasks.assignedTo, ctx.actorId) : undefined,
          ),
        );
      const dependencies = await tx
        .select()
        .from(deps)
        .where(eq(deps.branchId, ctx.branchId));
      const enabledAssignees = await tx
        .select({ id: operationalUsers.userId })
        .from(operationalUsers)
        .leftJoin(
          branchMemberships,
          and(
            eq(branchMemberships.userId, operationalUsers.userId),
            eq(branchMemberships.branchId, ctx.branchId),
            isNull(branchMemberships.revokedAt),
          ),
        )
        .where(
          and(
            eq(operationalUsers.disabled, false),
            or(
              eq(operationalUsers.role, "admin"),
              eq(branchMemberships.branchId, ctx.branchId),
            ),
          ),
        );
      const transferLines = await tx
        .select({
          documentId: stockTransfers.id,
          itemId: items.id,
          name: items.name,
          unit: items.baseUnit,
          quantity: transferAllocations.quantity,
        })
        .from(stockTransfers)
        .innerJoin(
          transferAllocations,
          eq(transferAllocations.transferId, stockTransfers.id),
        )
        .innerJoin(items, eq(items.id, transferAllocations.itemId))
        .where(
          and(
            eq(stockTransfers.originBranchId, ctx.branchId),
            eq(stockTransfers.destinationBranchId, ctx.branchId),
          ),
        );
      const taskRows: TaskRow[] = records.map(({ task: t, name }) => ({
        ...t,
        assignedToName: name,
        assigneeUnavailable:
          !!t.assignedTo &&
          !enabledAssignees.some((a) => a.id === t.assignedTo),
        materials:
          t.kind === "transfer" && t.documentId
            ? Array.from(
                transferLines
                  .filter((l) => l.documentId === t.documentId)
                  .reduce((map, l) => {
                    const old = map.get(l.itemId);
                    map.set(l.itemId, {
                      itemId: l.itemId,
                      name: l.name,
                      unit: l.unit,
                      quantity: six(
                        integer(l.quantity) +
                          integer(old?.quantity ?? "0.000000"),
                      ),
                    });
                    return map;
                  }, new Map<string, { itemId: string; name: string; unit: string; quantity: string }>())
                  .values(),
              )
            : [],
        locationName: locs.find((l) => l.id === t.locationId)?.name ?? null,
        originName: locs.find((l) => l.id === t.originLocationId)?.name ?? null,
        dueAt: t.dueAt?.toISOString() ?? null,
        createdAt: t.createdAt.toISOString(),
        updatedAt: t.updatedAt.toISOString(),
        dependencyIds: dependencies
          .filter((d) => d.taskId === t.id)
          .map((d) => d.dependsOnId),
      }));
      const filtered = taskRows
        .filter((t) =>
          filters.history
            ? ["done", "cancelled", "superseded"].includes(t.state)
            : !["done", "cancelled", "superseded"].includes(t.state),
        )
        .filter(
          (t) =>
            (!filters.locationId ||
              t.locationId === filters.locationId ||
              t.originLocationId === filters.locationId) &&
            (!filters.assignedTo ||
              (filters.assignedTo === "unassigned"
                ? !t.assignedTo
                : t.assignedTo === filters.assignedTo)) &&
            (!filters.kind || t.kind === filters.kind),
        );
      const rank = { critical: 0, high: 1, scheduled: 2 };
      const visible = filtered
        .filter((t) => !filters.urgency || t.urgency === filters.urgency)
        .sort(
          (a, b) =>
            rank[a.urgency] - rank[b.urgency] ||
            (a.dueAt ?? "9999").localeCompare(b.dueAt ?? "9999") ||
            a.createdAt.localeCompare(b.createdAt) ||
            a.id.localeCompare(b.id),
        );
      const policies = await tx
        .select({ id: replenishmentPolicies.id })
        .from(replenishmentPolicies)
        .where(
          and(
            eq(replenishmentPolicies.branchId, ctx.branchId),
            eq(replenishmentPolicies.enabled, true),
          ),
        );
      const supplyReady = ctx.role === "staff" || (await supplyAvailable(tx));
      return {
        asOf: now.toISOString(),
        businessDate: today,
        canManage: ctx.role !== "staff",
        tasks: visible.slice(filters.offset, filters.offset + 50),
        total: visible.length,
        summary: {
          critical: filtered.filter((t) => t.urgency === "critical").length,
          high: filtered.filter((t) => t.urgency === "high").length,
          scheduled: filtered.filter((t) => t.urgency === "scheduled").length,
        },
        configurationWarnings: [
          ...(policies.length
            ? []
            : [
                "Faltan mínimos de reposición. Los documentos existentes se muestran, pero todavía no se detectan todas las necesidades.",
              ]),
          ...(supplyReady
            ? []
            : [
                "Las compras anticipadas de Bolivia están pendientes de activación. Las tareas actuales siguen disponibles.",
              ]),
        ],
        stock: await readStock(tx, ctx.branchId, today),
        people,
        locations: locs,
      };
    },
    { isolationLevel: "repeatable read" },
  );
}
