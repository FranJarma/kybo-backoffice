import { beforeAll, afterAll, expect, it } from "vitest";
import { randomUUID as uid } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { createDataModelTestContext } from "./helpers/data-model-database";
import { user, operationalUsers } from "@/db/auth-schema";
import { branchMemberships } from "@/db/branch-schema";
import { items } from "@/db/item-schema";
import { productionOrders } from "@/db/production-order-schema";
import { stockMovements } from "@/db/stock-movement-schema";
import { inventoryValuations, lotLocationBalances } from "@/db/stock-schema";
import { auditEvents } from "@/db/business-schema";
import { createRecipeService } from "@/modules/recipes/service";
import { createInventoryService } from "@/modules/inventory/service";
import { executeCommand } from "@/modules/operations/command";
import {
  confirmProduction,
  finishProduction,
} from "@/modules/production/orders";
import { reviewProductionResult } from "@/modules/production/review-result";
import { listProductionOrders } from "@/modules/production/queries";
import { movementsByBranch } from "@/modules/inventory/scoped-queries";
import type { Actor } from "@/lib/access";
let ctx: Awaited<ReturnType<typeof createDataModelTestContext>>;
const manager: Actor = { id: "review-manager", role: "admin" };
const staff: Actor = { id: "review-staff", role: "staff" };
const q = (n: number) => n.toFixed(6);
beforeAll(async () => {
  ctx = await createDataModelTestContext();
  for (const actor of [manager, staff]) {
    actor.branchId = ctx.mapping.initialBranch.id;
    await ctx.db.insert(user).values({
      id: actor.id,
      name: actor.id,
      email: `${actor.id}@test.local`,
    });
    await ctx.db
      .insert(operationalUsers)
      .values({ userId: actor.id, role: actor.role });
  }
  await ctx.db
    .insert(branchMemberships)
    .values({ userId: staff.id, branchId: staff.branchId!, role: "staff" });
}, 60000);
afterAll(async () => {
  await ctx?.close();
});
async function fixture(cost: string | null = "2") {
  const [raw, water, output] = await ctx.db
    .insert(items)
    .values([
      {
        code: uid().toUpperCase(),
        name: "Té",
        class: "food",
        baseUnit: "g",
        purchasable: true,
        recipeUsable: true,
      },
      {
        code: uid().toUpperCase(),
        name: "Agua",
        class: "beverage",
        baseUnit: "ml",
        purchasable: false,
        recipeUsable: true,
        stockTracked: false,
        unitCost: "0",
      },
      {
        code: uid().toUpperCase(),
        name: "Preparado",
        class: "beverage",
        baseUnit: "ml",
        purchasable: false,
        recipeUsable: true,
      },
    ])
    .returning();
  const inventory = createInventoryService(ctx.db);
  await inventory.adjust(manager, {
    requestId: uid(),
    kind: "opening",
    itemId: raw.id,
    locationId: ctx.mapping.initialLocation.id,
    quantity: "100",
    unitCost: cost,
    receivedOn: "2026-10-01",
    expiresOn: null,
    reason: "Inicial",
  });
  const recipe = await createRecipeService(ctx.db).save(manager, {
    requestId: uid(),
    kind: "preparation",
    targetId: output.id,
    yieldQuantity: "100",
    lines: [
      { options: [{ itemId: raw.id, quantity: "10" }] },
      { options: [{ itemId: water.id, quantity: "100" }] },
    ],
  });
  const order = (
    await executeCommand(
      ctx.db,
      manager,
      manager.branchId!,
      { requestId: uid() },
      "production-confirm",
      {},
      (tx, context, op) =>
        confirmProduction(tx, context, op, {
          recipeVersionId: recipe.versionId,
          plannedQuantity: q(100),
          locationId: ctx.mapping.initialLocation.id,
          selections: recipe.lines.map((l) => ({
            lineId: l.id,
            optionId: l.options[0].id,
          })),
        }),
    )
  ).result;
  const finish = (
    await executeCommand(
      ctx.db,
      manager,
      manager.branchId!,
      { requestId: uid() },
      "production-finish",
      { id: order.id },
      (tx, context, op) =>
        finishProduction(tx, context, op, order.id, {
          expectedRevision: 1,
          actualQuantity: q(100),
          expiresOn: null,
          lotCode: uid(),
          reason: "Original",
          consumption: [
            { itemId: raw.id, quantity: q(10) },
            { itemId: water.id, quantity: q(100) },
          ],
        }),
    )
  ).result;
  return {
    id: order.id,
    lotId: finish.lotId!,
    raw: raw.id,
    water: water.id,
    output: output.id,
  };
}
type Fixture = Awaited<ReturnType<typeof fixture>>;
function payload(f: Fixture, actual = 90, used = 12, revision = 2) {
  return {
    expectedRevision: revision,
    actualQuantity: q(actual),
    consumption: [
      { itemId: f.raw, quantity: q(used) },
      { itemId: f.water, quantity: q(110) },
    ],
    reason: "Conteo del encargado",
  };
}
function review(
  f: Fixture,
  data = payload(f),
  requestId = uid(),
  actor = manager,
) {
  return executeCommand(
    ctx.db,
    actor,
    actor.branchId!,
    { requestId },
    "production-review",
    { id: f.id, review: data },
    (tx, context, op) => reviewProductionResult(tx, context, op, f.id, data),
  );
}
async function valuation(itemId: string) {
  return (
    await ctx.db
      .select()
      .from(inventoryValuations)
      .where(
        and(
          eq(inventoryValuations.itemId, itemId),
          eq(inventoryValuations.branchId, manager.branchId!),
        ),
      )
  )[0];
}
it("ajusta solo diferencias, conserva otros lotes y costo, admite correcciones sucesivas e idempotencia", async () => {
  const f = await fixture();
  await createInventoryService(ctx.db).adjust(manager, {
    requestId: uid(),
    kind: "opening",
    itemId: f.output,
    locationId: ctx.mapping.initialLocation.id,
    quantity: "10",
    unitCost: "1",
    receivedOn: "2026-10-01",
    expiresOn: null,
    reason: "Otro lote",
  });
  const requestId = uid();
  const first = await review(f, payload(f), requestId);
  expect(first.result.totalCost).toBe(q(24));
  expect(await valuation(f.raw)).toMatchObject({
    quantity: q(88),
    value: q(176),
  });
  expect(await valuation(f.output)).toMatchObject({
    quantity: q(100),
    value: q(34),
  });
  const moves = await ctx.db
    .select()
    .from(stockMovements)
    .where(eq(stockMovements.operationId, first.operationId));
  expect(moves.map((m) => [m.itemId, m.quantity])).toEqual([
    [f.raw, q(-2)],
    [f.output, q(-10)],
    [f.output, q(0)],
  ]);
  expect((await review(f, payload(f), requestId)).replayed).toBe(true);
  expect(
    await ctx.db
      .select()
      .from(stockMovements)
      .where(eq(stockMovements.operationId, first.operationId)),
  ).toHaveLength(3);
  await expect(review(f, payload(f))).rejects.toThrow("cambió");
  const next = await review(f, payload(f, 80, 9, 3));
  expect(next.result.totalCost).toBe(q(18));
  expect(await valuation(f.raw)).toMatchObject({
    quantity: q(91),
    value: q(182),
  });
  expect(await valuation(f.output)).toMatchObject({
    quantity: q(90),
    value: q(28),
  });
  expect(
    (
      await listProductionOrders(ctx.db, manager, "history", 0, false)
    ).rows.find((r) => r.id === f.id)?.result,
  ).toMatchObject({
    actualQuantity: q(80),
    totalCost: q(18),
    quantitySource: "reviewed",
  });
  const events = await ctx.db
    .select()
    .from(auditEvents)
    .where(eq(auditEvents.recordId, f.id));
  expect(events.filter((e) => e.action === "finish")).toHaveLength(1);
  expect(events.filter((e) => e.action === "review-result")).toHaveLength(2);
  expect(
    events.find((e) => e.action === "review-result")?.before,
  ).toMatchObject({ actualQuantity: q(100) });
  const waterStock = await ctx.db
    .select()
    .from(stockMovements)
    .where(eq(stockMovements.itemId, f.water));
  expect(waterStock).toHaveLength(0);
});
it("permite más rendimiento y pérdida total manteniendo el costo de materiales", async () => {
  const f = await fixture();
  await review(f, payload(f, 120, 10));
  expect(await valuation(f.output)).toMatchObject({
    quantity: q(120),
    value: q(20),
  });
  await review(f, payload(f, 0, 10, 3));
  expect(await valuation(f.output)).toMatchObject({
    quantity: q(0),
    value: q(0),
  });
  expect(
    (
      await ctx.db
        .select()
        .from(productionOrders)
        .where(eq(productionOrders.id, f.id))
    )[0],
  ).toMatchObject({ state: "cancelled", actualQuantity: null });
  await review(f, payload(f, 95, 10, 4));
  expect(await valuation(f.output)).toMatchObject({
    quantity: q(95),
    value: q(20),
  });
});
it("revierte toda la transacción si falta stock adicional", async () => {
  const f = await fixture();
  await expect(review(f, payload(f, 90, 200))).rejects.toThrow();
  expect(await valuation(f.output)).toMatchObject({
    quantity: q(100),
    value: q(20),
  });
  expect(await valuation(f.raw)).toMatchObject({
    quantity: q(90),
    value: q(180),
  });
  expect(
    (
      await ctx.db
        .select()
        .from(productionOrders)
        .where(eq(productionOrders.id, f.id))
    )[0].revision,
  ).toBe(2);
});
it("protege permisos, sucursal y conjunto de ingredientes", async () => {
  const f = await fixture();
  await expect(review(f, payload(f), uid(), staff)).rejects.toThrow("permiso");
  await expect(
    review(f, payload(f), uid(), { ...manager, branchId: uid() }),
  ).rejects.toThrow();
  await expect(review(f, { ...payload(f), consumption: [] })).rejects.toThrow();
  await expect(
    review(f, {
      ...payload(f),
      consumption: [
        { itemId: f.raw, quantity: q(9) },
        { itemId: f.raw, quantity: q(9) },
      ],
    }),
  ).rejects.toThrow("repetir");
  await expect(review(f, { ...payload(f), reason: " " })).rejects.toThrow();
});
it("bloquea correcciones cuando el lote tuvo uso posterior o reservas", async () => {
  const f = await fixture();
  await ctx.db
    .update(lotLocationBalances)
    .set({ reserved: q(1) })
    .where(eq(lotLocationBalances.lotId, f.lotId));
  await expect(review(f)).rejects.toThrow("reservado");
  await ctx.db
    .update(lotLocationBalances)
    .set({ reserved: q(0) })
    .where(eq(lotLocationBalances.lotId, f.lotId));
  const [balance] = await ctx.db
    .select()
    .from(lotLocationBalances)
    .where(eq(lotLocationBalances.lotId, f.lotId));
  await createInventoryService(ctx.db).adjust(manager, {
    requestId: uid(),
    kind: "waste",
    lotId: f.lotId,
    locationId: ctx.mapping.initialLocation.id,
    revision: balance.revision,
    quantity: "1",
    reason: "Derrame posterior",
  });
  await expect(review(f)).rejects.toThrow("movimientos posteriores");
});
it("no convierte costos desconocidos en cero", async () => {
  const f = await fixture(null);
  const result = await review(f);
  expect(result.result.totalCost).toBeNull();
  expect((await valuation(f.output)).value).toBeNull();
});
it("corrige el costo sin modificar la cantidad producida y permite consultar el historial de inventario", async () => {
  const f = await fixture();
  const change = await review(f, payload(f, 100, 12));
  expect(await valuation(f.output)).toMatchObject({
    quantity: q(100),
    value: q(24),
  });
  const movements = await ctx.db
    .select()
    .from(stockMovements)
    .where(eq(stockMovements.operationId, change.operationId));
  expect(movements.filter((m) => m.itemId === f.output)).toMatchObject([
    { quantity: q(0), value: q(4), action: "production_review" },
  ]);
  const history = await movementsByBranch(
    ctx.db,
    {
      actorId: manager.id,
      role: "admin",
      branchId: manager.branchId!,
      timeZone: "UTC",
    },
    f.output,
    0,
  );
  expect(
    history.rows.find((r) => r.kind === "production_review"),
  ).toMatchObject({ delta: q(0), unitCost: null, valueDelta: q(4) });
});
it("rechaza revisiones si el promedio del preparado ya se utilizó en otro lote", async () => {
  const f = await fixture();
  await createInventoryService(ctx.db).adjust(manager, {
    requestId: uid(),
    kind: "opening",
    itemId: f.output,
    locationId: ctx.mapping.initialLocation.id,
    quantity: "10",
    unitCost: "1",
    receivedOn: "2026-10-01",
    expiresOn: null,
    reason: "Otro lote",
  });
  const balances = await ctx.db.select().from(lotLocationBalances);
  const moves = await ctx.db
    .select()
    .from(stockMovements)
    .where(eq(stockMovements.itemId, f.output));
  const otherLot = moves.find((m) => m.action === "opening")!.lotId;
  const balance = balances.find((b) => b.lotId === otherLot)!;
  await createInventoryService(ctx.db).adjust(manager, {
    requestId: uid(),
    kind: "waste",
    lotId: otherLot,
    locationId: ctx.mapping.initialLocation.id,
    revision: balance.revision,
    quantity: "1",
    reason: "Derrame",
  });
  await expect(review(f)).rejects.toThrow("movimientos posteriores");
});
