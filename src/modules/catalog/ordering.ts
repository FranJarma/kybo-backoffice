import { asc, eq, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import type { AppDb } from "@/db/client";
import type { Actor } from "@/lib/access";
import { AppError } from "@/lib/errors";
import { products, productCategories, auditEvents } from "@/db/business-schema";
import { requireCatalogManagement } from "../branches/context";
import type { Tx } from "../inventory/service";

export const orderedTables = { products, categories: productCategories };
export type OrderedEntity = keyof typeof orderedTables;
export function isOrderedEntity(entity: string): entity is OrderedEntity {
  return entity === "products" || entity === "categories";
}
export async function lockCatalogOrder(tx: Tx, entity: OrderedEntity) {
  await tx.execute(
    sql`select pg_advisory_xact_lock(7269270, ${entity === "products" ? 1 : 2})`,
  );
}
export async function nextCatalogOrder(tx: Tx, entity: OrderedEntity) {
  await lockCatalogOrder(tx, entity);
  const table = orderedTables[entity];
  const [row] = await tx
    .select({ last: sql<number>`coalesce(max(${table.sortOrder}), -1)` })
    .from(table);
  if (Number(row.last) >= 2147483647)
    throw new AppError(
      "CONFLICT",
      "Reordená el catálogo antes de agregar otro registro.",
      409,
    );
  return Number(row.last) + 1;
}
export async function moveCatalogRecord(
  db: AppDb,
  actor: Actor,
  entity: string,
  id: string,
  raw: unknown,
) {
  if (!isOrderedEntity(entity))
    throw new AppError(
      "NOT_FOUND",
      "Este catálogo no admite orden manual.",
      404,
    );
  z.uuid().parse(id);
  const input = z
    .union([
      z
        .object({
          revision: z.number().int().positive(),
          direction: z.enum(["up", "down"]),
        })
        .strict(),
      z
        .object({
          revision: z.number().int().positive(),
          targetId: z.uuid(),
          targetRevision: z.number().int().positive(),
          placement: z.enum(["before", "after"]),
        })
        .strict(),
    ])
    .parse(raw);
  await requireCatalogManagement(db, actor);
  return db.transaction(async (tx) => {
    await lockCatalogOrder(tx, entity);
    const table = orderedTables[entity];
    const rows = await tx
      .select()
      .from(table)
      .where(isNull(table.archivedAt))
      .orderBy(asc(table.sortOrder), asc(table.name), asc(table.id))
      .for("update");
    const index = rows.findIndex((row) => row.id === id);
    if (index < 0 || rows[index].revision !== input.revision)
      throw new AppError(
        "CONFLICT",
        "El listado cambió. Recargalo antes de reordenar.",
        409,
      );
    const target =
      "direction" in input
        ? index + (input.direction === "up" ? -1 : 1)
        : rows.findIndex((row) => row.id === input.targetId);
    if (
      !("direction" in input) &&
      (target < 0 || rows[target].revision !== input.targetRevision)
    )
      throw new AppError(
        "CONFLICT",
        "El destino cambió. Recargá el listado antes de reordenar.",
        409,
      );
    if (target < 0 || target >= rows.length) return { moved: false };
    if (target === index) return { moved: false };
    const ordered = [...rows];
    const [moved] = ordered.splice(index, 1);
    const insertion =
      "direction" in input
        ? target
        : ordered.findIndex((row) => row.id === input.targetId) +
          (input.placement === "after" ? 1 : 0);
    ordered.splice(insertion, 0, moved);
    if (ordered.every((row, position) => row.id === rows[position].id))
      return { moved: false };
    // Normalize legacy ties as well as gaps so every move has a definite position.
    const changed = ordered.flatMap((row, position) =>
      row.sortOrder === position && row.id !== id && row.id !== rows[target].id
        ? []
        : [{ id: row.id, before: row.sortOrder, after: position }],
    );
    for (const row of changed) {
      await tx
        .update(table)
        .set({
          sortOrder: row.after,
          revision: sql`${table.revision} + 1`,
          updatedAt: new Date(),
        })
        .where(eq(table.id, row.id));
    }
    await tx.insert(auditEvents).values({
      actorId: actor.id,
      entity,
      recordId: id,
      action: "reorder",
      before: changed.map((r) => ({ id: r.id, sortOrder: r.before })),
      after: changed.map((r) => ({ id: r.id, sortOrder: r.after })),
    });
    return { moved: true };
  });
}
