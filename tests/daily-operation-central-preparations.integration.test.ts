import { afterAll, beforeAll, expect, it } from "vitest";
import { randomUUID as uid } from "node:crypto";
import { eq } from "drizzle-orm";
import { createDataModelTestContext } from "./helpers/data-model-database";
import { user, operationalUsers } from "@/db/auth-schema";
import { locations, branchMemberships } from "@/db/branch-schema";
import { items } from "@/db/item-schema";
import { replenishmentPolicies } from "@/db/replenishment-schema";
import { dailyOperationTasks as tasks } from "@/db/daily-operation-schema";
import { productionOrders } from "@/db/production-order-schema";
import { stockMovements } from "@/db/stock-movement-schema";
import { createRecipeService } from "@/modules/recipes/service";
import { createInventoryService } from "@/modules/inventory/service";
import { reconcileDailyOperations } from "@/modules/daily-operations/reconcile";
import { runTaskCommand } from "@/modules/daily-operations/commands";
import { executeCommand } from "@/modules/operations/command";
import { finishProduction } from "@/modules/production/orders";
import { planProduction } from "@/modules/production/planning";
import type { Actor } from "@/lib/access";

let ctx: Awaited<ReturnType<typeof createDataModelTestContext>>;
const manager: Actor = { id: "central-manager", role: "admin" };
const staff: Actor = { id: "central-staff", role: "staff" };
let depot: string, bar: string, kitchen: string;
beforeAll(async () => {
  ctx = await createDataModelTestContext();
  depot = ctx.mapping.initialLocation.id;
  await ctx.db
    .update(locations)
    .set({ code: "DEPOSITO", name: "Depósito principal" })
    .where(eq(locations.id, depot));
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
  const destinations = await ctx.db
    .insert(locations)
    .values([
      { branchId: manager.branchId!, code: "BAR", name: "Barra" },
      { branchId: manager.branchId!, code: "KITCHEN", name: "Cocina" },
    ])
    .returning();
  [bar, kitchen] = destinations.map((d) => d.id);
}, 60000);
afterAll(async () => {
  await ctx?.close();
});

async function scenario() {
  const [raw, output] = await ctx.db
    .insert(items)
    .values([
      {
        code: uid().toUpperCase(),
        name: "Materia prima",
        class: "food",
        baseUnit: "g",
        recipeUsable: true,
        purchasable: true,
      },
      {
        code: uid().toUpperCase(),
        name: "Tapas preparadas",
        class: "food",
        baseUnit: "unit",
        recipeUsable: true,
        purchasable: false,
      },
    ])
    .returning();
  const recipe = await createRecipeService(ctx.db).save(manager, {
    requestId: uid(),
    kind: "preparation",
    targetId: output.id,
    yieldQuantity: "4",
    lines: [{ options: [{ itemId: raw.id, quantity: "10" }] }],
    preparation: {
      steps: ["Preparar"],
      estimatedMinutes: 10,
      observations: "",
    },
  });
  await ctx.db.insert(replenishmentPolicies).values(
    [bar, kitchen].map((locationId) => ({
      branchId: manager.branchId!,
      locationId,
      itemId: output.id,
      minimumQuantity: "2.000000",
      targetQuantity: "5.000000",
      enabled: true,
      updatedBy: manager.id,
    })),
  );
  return { raw, output, recipe };
}
const reconcile = () =>
  reconcileDailyOperations(ctx.db, manager, { requestId: uid() });
const itemTasks = (itemId: string) =>
  ctx.db.select().from(tasks).where(eq(tasks.itemId, itemId));

it("prepares once in Depot, keeps future stock unavailable, then offers real transfers after completion", async () => {
  const { raw, output } = await scenario();
  await reconcile();
  let [task] = await itemTasks(output.id);
  expect(task).toMatchObject({
    kind: "production",
    locationId: depot,
    quantity: "12.000000",
  });
  await runTaskCommand(ctx.db, manager, task.id, {
    requestId: uid(),
    expectedRevision: task.revision,
    action: "assign",
    assignedTo: staff.id,
  });
  [task] = await itemTasks(output.id);
  const command = {
    requestId: uid(),
    expectedRevision: task.revision,
    action: "confirm_production",
  };
  await expect(
    runTaskCommand(ctx.db, staff, task.id, command),
  ).rejects.toMatchObject({ status: 403 });
  const before = await ctx.db.select().from(stockMovements);
  await runTaskCommand(ctx.db, manager, task.id, command);
  expect(
    (await runTaskCommand(ctx.db, manager, task.id, command)).replayed,
  ).toBe(true);
  [task] = await itemTasks(output.id);
  const orders = await ctx.db
    .select()
    .from(productionOrders)
    .where(eq(productionOrders.outputItemId, output.id));
  expect(orders).toHaveLength(1);
  expect(orders[0]).toMatchObject({
    locationId: depot,
    assignedTo: staff.id,
    state: "planned",
    plannedQuantity: "12.000000",
  });
  expect(task.documentId).toBe(orders[0].id);
  expect(await ctx.db.select().from(stockMovements)).toEqual(before);
  await reconcile();
  await reconcile();
  expect(
    (await itemTasks(output.id)).filter(
      (t) => !["superseded", "done"].includes(t.state),
    ),
  ).toHaveLength(1);
  await createInventoryService(ctx.db).adjust(manager, {
    requestId: uid(),
    kind: "opening",
    itemId: raw.id,
    locationId: depot,
    quantity: "100",
    unitCost: "1",
    receivedOn: "2026-10-01",
    expiresOn: null,
    reason: "Prueba",
  });
  [task] = await itemTasks(output.id);
  await runTaskCommand(ctx.db, staff, task.id, {
    requestId: uid(),
    expectedRevision: task.revision,
    action: "start",
  });
  await reconcile();
  expect(
    (await itemTasks(output.id)).filter((t) => t.kind === "transfer"),
  ).toHaveLength(0);
  const completion = { expectedRevision: 2 };
  await executeCommand(
    ctx.db,
    staff,
    staff.branchId!,
    { requestId: uid() },
    "production-finish",
    { id: orders[0].id, completion },
    (tx, context, op) =>
      finishProduction(tx, context, op, orders[0].id, completion),
  );
  await reconcile();
  const after = await itemTasks(output.id);
  expect(after.find((t) => t.id === task.id)?.state).toBe("done");
  expect(after.filter((t) => t.kind === "transfer")).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        originLocationId: depot,
        locationId: bar,
        quantity: "5.000000",
      }),
      expect.objectContaining({
        originLocationId: depot,
        locationId: kitchen,
        quantity: "5.000000",
      }),
    ]),
  );
  expect(
    after.filter((t) => t.kind === "production" && t.state !== "done"),
  ).toHaveLength(0);
});

it("rejects missing assignees, stale batch sizes and service-location production", async () => {
  const { raw, output, recipe } = await scenario();
  await reconcile();
  let [task] = await itemTasks(output.id);
  const confirm = () =>
    runTaskCommand(ctx.db, manager, task.id, {
      requestId: uid(),
      expectedRevision: task.revision,
      action: "confirm_production",
    });
  await expect(confirm()).rejects.toMatchObject({ status: 409 });
  await runTaskCommand(ctx.db, manager, task.id, {
    requestId: uid(),
    expectedRevision: task.revision,
    action: "assign",
    assignedTo: staff.id,
  });
  [task] = await itemTasks(output.id);
  await ctx.db
    .update(tasks)
    .set({ locationId: bar })
    .where(eq(tasks.id, task.id));
  await expect(confirm()).rejects.toMatchObject({ status: 409 });
  await ctx.db
    .update(tasks)
    .set({ locationId: depot })
    .where(eq(tasks.id, task.id));
  await createRecipeService(ctx.db).save(manager, {
    requestId: uid(),
    id: recipe.id,
    kind: "preparation",
    targetId: output.id,
    revision: recipe.revision,
    yieldQuantity: "5",
    lines: [{ options: [{ itemId: raw.id, quantity: "10" }] }],
    preparation: {
      steps: ["Preparar"],
      estimatedMinutes: 10,
      observations: "",
    },
  });
  await expect(confirm()).rejects.toMatchObject({ status: 409 });
  await reconcile();
  [task] = (await itemTasks(output.id)).filter((t) => t.state !== "superseded");
  expect(task.quantity).toBe("10.000000");
  await confirm();
  expect(
    (
      await ctx.db
        .select()
        .from(productionOrders)
        .where(eq(productionOrders.outputItemId, output.id))
    )[0].plannedQuantity,
  ).toBe("10.000000");
});

it("opens only the additional batch when demand grows while a central order is pending", async () => {
  const { output } = await scenario();
  await reconcile();
  let [task] = await itemTasks(output.id);
  await runTaskCommand(ctx.db, manager, task.id, {
    requestId: uid(),
    expectedRevision: task.revision,
    action: "assign",
    assignedTo: staff.id,
  });
  [task] = await itemTasks(output.id);
  await runTaskCommand(ctx.db, manager, task.id, {
    requestId: uid(),
    expectedRevision: task.revision,
    action: "confirm_production",
  });
  const policies = await ctx.db
    .select()
    .from(replenishmentPolicies)
    .where(eq(replenishmentPolicies.itemId, output.id));
  await ctx.db
    .update(replenishmentPolicies)
    .set({ targetQuantity: "20.000000" })
    .where(
      eq(
        replenishmentPolicies.id,
        policies.find((p) => p.locationId === bar)!.id,
      ),
    );
  await reconcile();
  await reconcile();
  const suggestions = (await itemTasks(output.id)).filter(
    (t) => !t.documentId && t.state === "pending",
  );
  expect(suggestions).toHaveLength(1);
  expect(suggestions[0]).toMatchObject({
    locationId: depot,
    quantity: "16.000000",
  });
  expect(
    (await itemTasks(output.id)).filter((t) => t.kind === "transfer"),
  ).toHaveLength(0);
});

it.each(["planned order", "finished stock"])(
  "rejects a stale suggestion after independently added %s",
  async (supply) => {
    const { output, recipe } = await scenario();
    await reconcile();
    let [task] = await itemTasks(output.id);
    await runTaskCommand(ctx.db, manager, task.id, {
      requestId: uid(),
      expectedRevision: task.revision,
      action: "assign",
      assignedTo: staff.id,
    });
    [task] = await itemTasks(output.id);
    if (supply === "planned order") {
      const order = {
        recipeVersionId: recipe.versionId,
        locationId: depot,
        plannedQuantity: "12.000000",
        selections: recipe.lines.map((l) => ({
          lineId: l.id,
          optionId: l.options[0].id,
        })),
      };
      const assignment = {
        assignedTo: staff.id,
        scheduledFor: new Date().toISOString(),
        notes: "Plan independiente",
      };
      await executeCommand(
        ctx.db,
        manager,
        manager.branchId!,
        { requestId: uid() },
        "production-plan",
        { order, assignment },
        (tx, context, op) => planProduction(tx, context, op, order, assignment),
      );
    } else {
      await createInventoryService(ctx.db).adjust(manager, {
        requestId: uid(),
        kind: "opening",
        itemId: output.id,
        locationId: depot,
        quantity: "12",
        unitCost: "1",
        receivedOn: "2026-10-01",
        expiresOn: null,
        reason: "Preparado disponible",
      });
    }
    const before = await ctx.db
      .select()
      .from(productionOrders)
      .where(eq(productionOrders.outputItemId, output.id));
    await expect(
      runTaskCommand(ctx.db, manager, task.id, {
        requestId: uid(),
        expectedRevision: task.revision,
        action: "confirm_production",
      }),
    ).rejects.toMatchObject({ status: 409 });
    expect(
      await ctx.db
        .select()
        .from(productionOrders)
        .where(eq(productionOrders.outputItemId, output.id)),
    ).toEqual(before);
  },
);
