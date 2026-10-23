import { and, eq, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import type { Tx } from "@/db/types";
import { supplyAlertPolicies as policies } from "@/db/supply-alert-schema";
import { items } from "@/db/item-schema";
import { auditEvents } from "@/db/business-schema";
import { AppError } from "@/lib/errors";
import type { OperationalContext } from "../operations/types";
import { decimal, integer, safeQuantity } from "../inventory/decimal";
import type { SupplyPolicy } from "./types";
export async function supplyAvailable(tx: Tx) {
  const result = await tx.execute(
    sql`select to_regclass('public.supply_alert_policies') as ready`,
  );
  return !!result.rows[0]?.ready;
}
const inputSchema = z
  .object({
    id: z.uuid().optional(),
    revision: z.number().int().positive().optional(),
    itemId: z.uuid(),
    dailyConsumption: z.string().max(80).nullable(),
    leadDays: z.number().int().min(1).max(364),
    safetyDays: z.number().int().min(0).max(364),
    targetDays: z.number().int().min(1).max(365),
    enabled: z.boolean(),
  })
  .strict();
function conflict(): never {
  throw new AppError(
    "SUPPLY_CONFLICT",
    "La regla cambió o ya existe. Actualizá antes de guardar.",
    409,
  );
}
export async function saveSupplyPolicy(
  tx: Tx,
  ctx: OperationalContext,
  operationId: string,
  raw: unknown,
): Promise<SupplyPolicy> {
  if (ctx.role === "staff")
    throw new AppError(
      "FORBIDDEN",
      "Solo el encargado puede configurar compras anticipadas.",
      403,
    );
  const input = inputSchema.parse(raw);
  if (
    Boolean(input.id) !== Boolean(input.revision) ||
    input.targetDays <= input.leadDays + input.safetyDays
  )
    throw new AppError(
      "VALIDATION",
      "El objetivo debe superar el plazo más el margen.",
      400,
    );
  const dailyConsumption = input.dailyConsumption?.trim()
    ? decimal(input.dailyConsumption, 6)!
    : null;
  if (dailyConsumption)
    safeQuantity(integer(dailyConsumption) * BigInt(input.targetDays));
  if (!(await supplyAvailable(tx)))
    throw new AppError(
      "SUPPLY_NOT_READY",
      "Compras anticipadas está pendiente de activación en la base de datos.",
      503,
    );
  const [item] = await tx
    .select()
    .from(items)
    .where(
      and(
        eq(items.id, input.itemId),
        eq(items.stockTracked, true),
        eq(items.purchasable, true),
        isNull(items.archivedAt),
      ),
    )
    .for("share");
  if (!item)
    throw new AppError(
      "VALIDATION",
      "Elegí un insumo comprable con control de stock.",
      400,
    );
  const changes = {
    itemId: item.id,
    dailyConsumption,
    leadDays: input.leadDays,
    safetyDays: input.safetyDays,
    targetDays: input.targetDays,
    enabled: input.enabled,
    updatedBy: ctx.actorId,
    updatedAt: new Date(),
  };
  let before: typeof policies.$inferSelect | null = null;
  let saved: typeof policies.$inferSelect;
  if (input.id) {
    const [previous] = await tx
      .select()
      .from(policies)
      .where(
        and(eq(policies.id, input.id), eq(policies.branchId, ctx.branchId)),
      )
      .for("update");
    if (
      !previous ||
      previous.revision !== input.revision ||
      previous.itemId !== item.id
    )
      conflict();
    before = previous;
    [saved] = await tx
      .update(policies)
      .set({ ...changes, revision: previous.revision + 1 })
      .where(eq(policies.id, previous.id))
      .returning();
  } else {
    const [created] = await tx
      .insert(policies)
      .values({ ...changes, branchId: ctx.branchId })
      .onConflictDoNothing()
      .returning();
    if (!created) conflict();
    saved = created;
  }
  await tx.insert(auditEvents).values({
    actorId: ctx.actorId,
    entity: "supply-alert-policies",
    recordId: saved.id,
    action: before ? "update" : "create",
    before,
    after: { ...saved, operationId },
  });
  return {
    id: saved.id,
    revision: saved.revision,
    itemId: item.id,
    itemName: item.name,
    baseUnit: item.baseUnit,
    dailyConsumption: saved.dailyConsumption,
    leadDays: saved.leadDays,
    safetyDays: saved.safetyDays,
    targetDays: saved.targetDays,
    enabled: saved.enabled,
  };
}
