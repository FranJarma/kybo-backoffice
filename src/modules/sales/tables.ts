import { requireOperationalContext } from "../branches/context";
import { randomUUID } from "node:crypto";
import { and, asc, count, eq, isNull } from "drizzle-orm";
import type { AppDb } from "@/db/client";
import { diningTables, sales, saleOrders } from "@/db/sales-schema";
import { type Actor, requireCatalogAccess } from "@/lib/access";
import {
  audit,
  claim,
  conflict,
  fingerprint,
  invalid,
  notFound,
  type Tx,
} from "@/modules/inventory/service";
import { cents, integer } from "@/modules/inventory/decimal";
import { parse, salesAccess, tableSchema } from "./validation";
import type { TableView } from "./types";

// Translate only known unique constraints; keep unexpected DB errors private.
export async function salesTransaction<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error) {
    let e: unknown = error;
    for (let depth = 0; depth < 4 && e && typeof e === "object"; depth++) {
      const item = e as { code?: string; constraint?: string; cause?: unknown };
      if (
        item.code === "23505" &&
        [
          "sale_external_identity",
          "sale_open_table",
          "table_active_cell",
        ].includes(item.constraint ?? "")
      )
        conflict(
          "Ese pedido externo, mesa o posición ya está registrado. Actualizá la vista.",
        );
      e = item.cause;
    }
    throw error;
  }
}
export async function lockTable(tx: Tx, id: string) {
  const [table] = await tx
    .select()
    .from(diningTables)
    .where(eq(diningTables.id, id))
    .for("update");
  if (!table) notFound();
  if (table.archivedAt) invalid("La mesa está archivada.");
  return table;
}
async function tableView(
  db: AppDb | Tx,
  branchId: string,
  id?: string,
): Promise<TableView[]> {
  const rows = await db
    .select({ table: diningTables, sale: sales })
    .from(diningTables)
    .leftJoin(
      sales,
      and(
        eq(sales.tableId, diningTables.id),
        eq(sales.origin, "table"),
        eq(sales.status, "open"),
      ),
    )
    .where(
      and(
        eq(diningTables.branchId, branchId),
        id ? eq(diningTables.id, id) : isNull(diningTables.archivedAt),
      ),
    )
    .orderBy(asc(diningTables.y), asc(diningTables.x));
  const counts = await db
    .select({ id: saleOrders.saleId, total: count() })
    .from(saleOrders)
    .innerJoin(
      sales,
      and(
        eq(sales.id, saleOrders.saleId),
        eq(sales.status, "open"),
        eq(sales.origin, "table"),
      ),
    )
    .where(eq(sales.branchId, branchId))
    .groupBy(saleOrders.saleId);
  return rows.map(({ table: t, sale: s }) => ({
    id: t.id,
    name: t.name,
    capacity: t.capacity,
    x: t.x,
    y: t.y,
    revision: t.revision,
    archived: !!t.archivedAt,
    saleId: s?.id ?? null,
    saleNumber: s?.number ?? null,
    balanceDue: s
      ? cents(integer(s.totalAmount) - integer(s.paidAmount))
      : null,
    orderCount: counts.find((c) => c.id === s?.id)?.total ?? 0,
  }));
}
export function createTableService(db: AppDb) {
  return {
    async list(actor: Actor | null) {
      salesAccess(actor);
      const ctx = await requireOperationalContext(
        db,
        actor,
        actor.branchId ?? "",
      );
      return db.transaction((tx) => tableView(tx, ctx.branchId), {
        isolationLevel: "repeatable read",
        accessMode: "read only",
      });
    },
    async save(actor: Actor | null, raw: unknown) {
      requireCatalogAccess(actor);
      const a = actor!;
      const ctx = await requireOperationalContext(db, a, a.branchId ?? "");
      if (ctx.role === "staff")
        invalid("Se requiere un encargado.", "FORBIDDEN", 403);
      const input = parse(tableSchema, raw);
      const id = input.id ?? randomUUID();
      return salesTransaction(() =>
        db.transaction(async (tx) => {
          const old = await claim(
            tx,
            a,
            "sale-table",
            input.requestId,
            fingerprint("sale-table", input),
            id,
          );
          if (old) return (await tableView(tx, ctx.branchId, old))[0];
          if (input.id) {
            const table = await lockTable(tx, input.id);
            if (table.branchId !== ctx.branchId) notFound();
            if (table.revision !== input.revision)
              conflict("La mesa cambió. Actualizá antes de guardar.");
            if (input.archived) {
              const [occupied] = await tx
                .select({ id: sales.id })
                .from(sales)
                .where(
                  and(
                    eq(sales.tableId, id),
                    eq(sales.origin, "table"),
                    eq(sales.status, "open"),
                  ),
                )
                .limit(1);
              if (occupied)
                conflict(
                  "Cobrá o anulá la cuenta abierta antes de archivar la mesa.",
                );
            }
            await tx
              .update(diningTables)
              .set({
                name: input.name,
                capacity: input.capacity,
                x: input.x,
                y: input.y,
                revision: table.revision + 1,
                archivedAt: input.archived ? new Date() : null,
              })
              .where(eq(diningTables.id, id));
          } else {
            if (input.archived || input.revision)
              invalid("La nueva mesa debe estar activa.");
            await tx.insert(diningTables).values({
              id,
              branchId: ctx.branchId,
              name: input.name,
              capacity: input.capacity,
              x: input.x,
              y: input.y,
            });
          }
          await audit(
            tx,
            a,
            "tables",
            id,
            input.id ? "update" : "create",
            input,
          );
          return (await tableView(tx, ctx.branchId, id))[0];
        }),
      );
    },
  };
}
