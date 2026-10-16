import { beforeAll, afterAll, expect, it } from "vitest";
import { randomUUID as uid } from "node:crypto";
import { eq } from "drizzle-orm";
import { createDataModelTestContext } from "./helpers/data-model-database";
import { user, operationalUsers } from "@/db/auth-schema";
import { branchMemberships } from "@/db/branch-schema";
import { items } from "@/db/item-schema";
import { productionOrders } from "@/db/production-order-schema";
import { reservationAllocations } from "@/db/reservation-schema";
import { stockMovements } from "@/db/stock-movement-schema";
import { auditEvents } from "@/db/business-schema";
import { createRecipeService } from "@/modules/recipes/service";
import { createInventoryService } from "@/modules/inventory/service";
import { executeCommand } from "@/modules/operations/command";
import {
  planProduction,
  startProduction,
  reviseProduction,
  cancelPlannedProduction,
} from "@/modules/production/planning";
import {
  finishProduction,
  cancelUnusedProduction,
} from "@/modules/production/orders";
import { listProductionOrders } from "@/modules/production/queries";
import { archiveLocation } from "@/modules/branches/archive-location";
import type { Actor } from "@/lib/access";
import type { RecipeDetail } from "@/modules/recipes/types";
let ctx: Awaited<ReturnType<typeof createDataModelTestContext>>;
const manager: Actor = { id: "planner", role: "admin" };
const employee: Actor = { id: "employee", role: "staff" };
const other: Actor = { id: "other", role: "staff" };
let recipe: RecipeDetail, tea: string, water: string;
const assignment = {
  assignedTo: employee.id,
  scheduledFor: "2026-11-20T15:00:00Z",
  notes: "Preparar antes del turno",
};
beforeAll(async () => {
  ctx = await createDataModelTestContext();
  for (const actor of [manager, employee, other]) {
    actor.branchId = ctx.mapping.initialBranch.id;
    await ctx.db.insert(user).values({
      id: actor.id,
      name: actor.id,
      email: `${actor.id}@test.local`,
    });
    await ctx.db
      .insert(operationalUsers)
      .values({ userId: actor.id, role: actor.role });
    if (actor.role === "staff")
      await ctx.db
        .insert(branchMemberships)
        .values({ userId: actor.id, branchId: actor.branchId, role: "staff" });
  }
  const [raw, w, output] = await ctx.db
    .insert(items)
    .values([
      {
        code: "PLAN-TEA",
        name: "Té",
        class: "food",
        baseUnit: "g",
        recipeUsable: true,
        purchasable: true,
      },
      {
        code: "PLAN-WATER",
        name: "Agua",
        class: "beverage",
        baseUnit: "ml",
        recipeUsable: true,
        purchasable: false,
        stockTracked: false,
        unitCost: "0",
      },
      {
        code: "PLAN-CHAI",
        name: "Chai preparado",
        class: "beverage",
        baseUnit: "ml",
        recipeUsable: true,
        purchasable: false,
      },
    ])
    .returning();
  tea = raw.id;
  water = w.id;
  recipe = await createRecipeService(ctx.db).save(manager, {
    requestId: uid(),
    kind: "preparation",
    targetId: output.id,
    yieldQuantity: "1000",
    lines: [
      { options: [{ itemId: tea, quantity: "13" }] },
      { options: [{ itemId: water, quantity: "1000" }] },
    ],
    preparation: {
      steps: ["Infusionar"],
      estimatedMinutes: 15,
      observations: "Enfriar",
    },
  });
}, 60000);
afterAll(async () => {
  await ctx?.close();
});
function orderInput() {
  return {
    recipeVersionId: recipe.versionId,
    locationId: ctx.mapping.initialLocation.id,
    plannedQuantity: "1000.000000",
    selections: recipe.lines.map((l) => ({
      lineId: l.id,
      optionId: l.options[0].id,
    })),
  };
}
async function plan(who = manager) {
  const payload = { order: orderInput(), assignment };
  return (
    await executeCommand(
      ctx.db,
      who,
      who.branchId!,
      { requestId: uid() },
      "production-plan",
      payload,
      (tx, context, op) =>
        planProduction(tx, context, op, payload.order, payload.assignment),
    )
  ).result;
}
it("planifica sin stock; protege asignación, inicio y repetición; descuenta solo al finalizar", async () => {
  const order = await plan();
  await expect(
    archiveLocation(
      ctx.db,
      manager,
      manager.branchId!,
      ctx.mapping.initialLocation.id,
      1,
    ),
  ).rejects.toThrow();
  expect(
    (
      await listProductionOrders(
        ctx.db,
        { ...manager, branchId: uid() },
        "active",
        0,
        false,
      )
    ).rows,
  ).toHaveLength(0);
  expect(await ctx.db.select().from(reservationAllocations)).toHaveLength(0);
  expect(await ctx.db.select().from(stockMovements)).toHaveLength(0);
  expect(
    (await listProductionOrders(ctx.db, other, "active", 0, false)).rows,
  ).toHaveLength(0);
  const visible = (
    await listProductionOrders(ctx.db, employee, "active", 0, false)
  ).rows;
  expect(visible[0].preparation?.steps).toEqual(["Infusionar"]);
  expect(visible[0].components).toHaveLength(2);
  expect(JSON.stringify(visible)).not.toContain("unitCost");
  const startPayload = { id: order.id, start: { expectedRevision: 1 } };
  const start = (who: Actor, requestId = uid()) =>
    executeCommand(
      ctx.db,
      who,
      who.branchId!,
      { requestId },
      "production-start",
      startPayload,
      (tx, context, op) =>
        startProduction(tx, context, op, order.id, startPayload.start),
    );
  await expect(start(other)).rejects.toThrow("asignadas");
  await expect(start(employee)).rejects.toThrow();
  expect((await ctx.db.select().from(productionOrders))[0].state).toBe(
    "planned",
  );
  await createInventoryService(ctx.db).adjust(manager, {
    requestId: uid(),
    kind: "opening",
    itemId: tea,
    locationId: ctx.mapping.initialLocation.id,
    quantity: "100",
    unitCost: "2",
    receivedOn: "2026-10-01",
    expiresOn: null,
    reason: "Stock inicial",
  });
  const requestId = uid();
  expect((await start(employee, requestId)).replayed).toBe(false);
  expect((await start(employee, requestId)).replayed).toBe(true);
  expect(await ctx.db.select().from(stockMovements)).toHaveLength(1);
  const forbiddenCompletion = {
    expectedRevision: 2,
    actualQuantity: "950.000000",
    expiresOn: null,
    lotCode: "CHAI-TEST",
    reason: "50 ml evaporados",
    consumption: [
      { itemId: tea, quantity: "13.000000" },
      { itemId: water, quantity: "1000.000000" },
    ],
  };
  await expect(
    executeCommand(
      ctx.db,
      employee,
      employee.branchId!,
      { requestId: uid() },
      "production-finish",
      { id: order.id, completion: forbiddenCompletion },
      (tx, context, op) =>
        finishProduction(tx, context, op, order.id, forbiddenCompletion),
    ),
  ).rejects.toThrow();
  expect(
    (
      await ctx.db
        .select()
        .from(productionOrders)
        .where(eq(productionOrders.id, order.id))
    )[0].state,
  ).toBe("confirmed");
  const completion = { expectedRevision: 2 };
  const finishId = uid();
  const finish = () =>
    executeCommand(
      ctx.db,
      employee,
      employee.branchId!,
      { requestId: finishId },
      "production-finish",
      { id: order.id, completion },
      (tx, context, op) =>
        finishProduction(tx, context, op, order.id, completion),
    );
  const result = await finish();
  expect(result.result.totalCost).toBe("26.000000");
  expect((await finish()).replayed).toBe(true);
  const [saved] = await ctx.db
    .select()
    .from(productionOrders)
    .where(eq(productionOrders.id, order.id));
  expect(saved).toMatchObject({
    state: "completed",
    createdBy: manager.id,
    startedBy: employee.id,
    completedBy: employee.id,
    actualQuantity: "1000.000000",
  });
  expect(
    (
      await ctx.db
        .select()
        .from(auditEvents)
        .where(eq(auditEvents.recordId, order.id))
    ).map((e) => e.action),
  ).toEqual(["plan", "start", "finish"]);
  expect(
    (
      await listProductionOrders(ctx.db, employee, "history", 0, false)
    ).rows[0].events.at(-1)?.consumption,
  ).toHaveLength(2);
  const history = await listProductionOrders(
    ctx.db,
    employee,
    "history",
    0,
    false,
  );
  expect(history.rows[0].lots).toHaveLength(2);
  expect(
    history.rows[0].lots.find((l) => !l.quantity.startsWith("-"))?.quantity,
  ).toBe("1000.000000");
  const finishEvent = (
    await ctx.db
      .select()
      .from(auditEvents)
      .where(eq(auditEvents.recordId, order.id))
  ).find((e) => e.action === "finish");
  expect(finishEvent?.after).toMatchObject({
    quantitySource: "planned",
    consumption: [
      { itemId: tea, quantity: "13.000000" },
      { itemId: water, quantity: "1000.000000" },
    ],
  });
  await ctx.db
    .update(branchMemberships)
    .set({ revokedAt: new Date() })
    .where(eq(branchMemberships.userId, employee.id));
  await expect(finish()).rejects.toThrow();
  await ctx.db
    .update(branchMemberships)
    .set({ revokedAt: null })
    .where(eq(branchMemberships.userId, employee.id));
});
it("reprograma y reasigna con revisión, escala ingredientes y permite anular sin movimientos", async () => {
  const order = await plan();
  recipe = await createRecipeService(ctx.db).save(manager, {
    requestId: uid(),
    id: recipe.id,
    revision: recipe.revision,
    kind: "preparation",
    targetId: recipe.targetId,
    yieldQuantity: "1000",
    lines: [
      { options: [{ itemId: tea, quantity: "20" }] },
      { options: [{ itemId: water, quantity: "1000" }] },
    ],
  });
  const planning = {
    ...assignment,
    assignedTo: other.id,
    expectedRevision: 1,
    plannedQuantity: "2000.000000",
    reason: "Cambio de turno",
  };
  await executeCommand(
    ctx.db,
    manager,
    manager.branchId!,
    { requestId: uid() },
    "production-revise",
    { id: order.id, planning },
    (tx, context, op) => reviseProduction(tx, context, op, order.id, planning),
  );
  const rows = (await listProductionOrders(ctx.db, other, "active", 0, false))
    .rows;
  expect(rows[0].components.find((c) => c.itemId === tea)?.reserved).toBe(
    "26.000000",
  );
  await expect(
    executeCommand(
      ctx.db,
      manager,
      manager.branchId!,
      { requestId: uid() },
      "production-revise",
      { id: order.id, planning },
      (tx, context, op) =>
        reviseProduction(tx, context, op, order.id, planning),
    ),
  ).rejects.toThrow("cambió");
  await executeCommand(
    ctx.db,
    manager,
    manager.branchId!,
    { requestId: uid() },
    "production-cancel-plan",
    { id: order.id },
    (tx, context, op) =>
      cancelPlannedProduction(tx, context, op, order.id, {
        expectedRevision: 2,
        reason: "No hace falta",
      }),
  );
  expect(
    (
      await ctx.db
        .select()
        .from(productionOrders)
        .where(eq(productionOrders.id, order.id))
    )[0].state,
  ).toBe("cancelled");
});
it("revoca ejecución y replay al reasignar una tarea en curso", async () => {
  const order = await plan();
  const requestId = uid();
  const start = () =>
    executeCommand(
      ctx.db,
      employee,
      employee.branchId!,
      { requestId },
      "production-start",
      { id: order.id },
      (tx, context, op) =>
        startProduction(tx, context, op, order.id, { expectedRevision: 1 }),
    );
  await start();
  const planning = {
    ...assignment,
    assignedTo: other.id,
    expectedRevision: 2,
    plannedQuantity: "1000.000000",
    reason: "Cambio de responsable",
  };
  await executeCommand(
    ctx.db,
    manager,
    manager.branchId!,
    { requestId: uid() },
    "production-revise",
    { id: order.id, planning },
    (tx, context, op) => reviseProduction(tx, context, op, order.id, planning),
  );
  await expect(start()).rejects.toThrow("asignadas");
  expect(
    (await listProductionOrders(ctx.db, employee, "active", 0, false)).rows,
  ).toHaveLength(0);
  await expect(
    executeCommand(
      ctx.db,
      manager,
      manager.branchId!,
      { requestId: uid() },
      "production-revise",
      { id: order.id },
      (tx, context, op) =>
        reviseProduction(tx, context, op, order.id, {
          ...planning,
          expectedRevision: 3,
          plannedQuantity: "2000.000000",
        }),
    ),
  ).rejects.toThrow("antes de comenzar");
  await executeCommand(
    ctx.db,
    manager,
    manager.branchId!,
    { requestId: uid() },
    "production-cancel",
    { id: order.id },
    (tx, context, op) =>
      cancelUnusedProduction(tx, context, op, order.id, {
        expectedRevision: 3,
        unusedConfirmed: true,
        reason: "No se usaron materiales",
      }),
  );
});
it("rechaza planificar como empleado o asignar cuentas deshabilitadas", async () => {
  await expect(plan(employee)).rejects.toThrow("permiso");
  await ctx.db
    .update(operationalUsers)
    .set({ disabled: true })
    .where(eq(operationalUsers.userId, employee.id));
  await expect(plan()).rejects.toThrow("habilitada");
});
