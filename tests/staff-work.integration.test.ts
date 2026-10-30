import { randomUUID as uid } from "node:crypto";
import { afterAll, beforeAll, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import * as s from "@/db/schema";
import { createAttendanceContext } from "./helpers/attendance";
import { createPreparationService } from "@/modules/preparation/service";
import { createSalesService } from "@/modules/sales/service";
import { executeCommand } from "@/modules/operations/command";
import {
  completePreparation,
  deliverLines,
} from "@/modules/fulfillment/service";
import {
  workplaceStationAssignments,
  workplaceStoreAccounts,
} from "@/db/workplace-schema";

let c: Awaited<ReturnType<typeof createAttendanceContext>>;
let bar: string, kitchen: string;
let barLine: Record<string, unknown>, kitchenLine: Record<string, unknown>;
let methodId: string;
beforeAll(async () => {
  c = await createAttendanceContext(undefined, { attendanceAccess: true });
  const stations = await c.db
    .insert(s.preparationStations)
    .values([
      {
        branchId: c.branchId,
        name: "Barra",
        consumptionLocationId: c.mapping.initialLocation.id,
      },
      {
        branchId: c.branchId,
        name: "Cocina",
        consumptionLocationId: c.mapping.initialLocation.id,
      },
    ])
    .returning();
  [bar, kitchen] = stations.map((r) => r.id);
  const [method] = await c.db
    .insert(s.paymentMethods)
    .values({ name: "Efectivo personal", kind: "cash" })
    .returning();
  methodId = method.id;
  const [ingredient] = await c.db
    .insert(s.items)
    .values({
      code: "STAFF-INGREDIENT",
      name: "Agua",
      class: "beverage",
      baseUnit: "ml",
      recipeUsable: true,
      purchasable: false,
      stockTracked: false,
      unitCost: "0",
    })
    .returning();
  const fixtures: Record<string, unknown>[] = [];
  for (const [stationId, name] of [
    [bar, "Café"],
    [kitchen, "Tostado"],
  ]) {
    const [product] = await c.db
      .insert(s.products)
      .values({ name })
      .returning();
    await c.db
      .insert(s.branchProducts)
      .values({ branchId: c.branchId, productId: product.id, enabled: true });
    await c.db
      .insert(s.productPrices)
      .values({ productId: product.id, channel: "counter", amount: "100" });
    const [recipe] = await c.db
      .insert(s.recipes)
      .values({ kind: "product", productId: product.id })
      .returning();
    const [version] = await c.db
      .insert(s.recipeVersions)
      .values({
        recipeId: recipe.id,
        version: 1,
        compositionModel: "configurable",
        outputName: name,
        outputUnit: "unit",
        yieldQuantity: "1",
        actorId: c.actors.admin.id,
      })
      .returning();
    const [line] = await c.db
      .insert(s.recipeLines)
      .values({ versionId: version.id, position: 0 })
      .returning();
    await c.db.insert(s.recipeOptions).values({
      lineId: line.id,
      position: 0,
      itemId: ingredient.id,
      itemName: ingredient.name,
      baseUnit: ingredient.baseUnit,
      quantity: "10",
    });
    const [fulfillment] = await c.db
      .insert(s.productFulfillmentVersions)
      .values({
        productId: product.id,
        version: 1,
        mode: "recipe",
        recipeVersionId: version.id,
      })
      .returning();
    await c.db
      .insert(s.productFulfillments)
      .values({ productId: product.id, versionId: fulfillment.id });
    await c.db
      .insert(s.preparationRoutes)
      .values({ branchId: c.branchId, productId: product.id, stationId });
    fixtures.push({
      productId: product.id,
      quantity: 1,
      price: "100",
      expectedPrice: "100.00",
      expectedFulfillmentVersionId: fulfillment.id,
      expectedRecipeVersionId: version.id,
    });
  }
  [barLine, kitchenLine] = fixtures;
}, 60_000);
afterAll(async () => {
  await c?.close();
});

async function order() {
  const sale = await createSalesService(c.db).create(c.actors.admin, {
    requestId: uid(),
    origin: "counter",
    channel: "counter",
    fulfillment: "takeaway",
    locatorMode: "automatic",
    lines: [barLine, kitchenLine],
    payments: [{ collector: "local", methodId, amount: "200" }],
  });
  return (
    await createPreparationService(c.db).list(c.actors.admin, {
      saleId: sale.id,
    })
  ).rows;
}

it("does not expose a station queue or detail to a personal employee with no station assignment", async () => {
  const tasks = await order();
  expect(
    (
      await createPreparationService(c.db).list(c.actors.staff, {
        saleId: tasks[0].saleId,
      })
    ).rows,
  ).toEqual([]);
  await expect(
    createPreparationService(c.db).get(c.actors.staff, tasks[0].id),
  ).rejects.toMatchObject({ status: 403 });
});

it("rejects starting an unassigned station even when its task ID is known", async () => {
  const tasks = await order();
  await expect(
    createPreparationService(c.db).act(c.actors.staff, tasks[0].id, {
      requestId: uid(),
      revision: 1,
      action: "start",
    }),
  ).rejects.toMatchObject({ status: 403 });
  const [task] = await c.db
    .select()
    .from(s.preparationTasks)
    .where(eq(s.preparationTasks.id, tasks[0].id));
  expect(task.status).toBe("pending");
});

it("allows the responsible employee to finish already-started work after the station window changes without delivering it", async () => {
  const tasks = await order();
  const target = tasks.find((t) => t.stationId === bar)!;
  await c.db
    .update(s.preparationTasks)
    .set({
      status: "preparing",
      assigneeId: c.actors.staff.id,
      startedAt: new Date(),
      revision: 2,
    })
    .where(eq(s.preparationTasks.id, target.id));
  const result = await createPreparationService(c.db).act(
    c.actors.staff,
    target.id,
    { requestId: uid(), revision: 2, action: "ready" },
  );
  expect(result.task.status).toBe("ready");
  expect(result.task.deliveredAt).toBeNull();
  const progress = await c.db
    .select()
    .from(s.saleLineFulfillments)
    .where(eq(s.saleLineFulfillments.saleLineId, target.lines[0].id));
  expect(progress[0]).toMatchObject({ completed: 1, delivered: 0 });
  expect(
    (
      await createPreparationService(c.db).list(c.actors.staff, {
        saleId: target.saleId,
      })
    ).rows.map((t) => t.id),
  ).toEqual([target.id]);
});

it("keeps the alternate completion path limited to the responsible person and permits a safe late completion", async () => {
  const tasks = await order();
  const task = tasks.find((t) => t.stationId === kitchen)!;
  await c.db
    .update(s.preparationTasks)
    .set({
      status: "preparing",
      assigneeId: c.actors.staff.id,
      startedAt: new Date(),
      revision: 2,
    })
    .where(eq(s.preparationTasks.id, task.id));
  const input = {
    taskId: task.id,
    expectedRevision: 2,
    lines: [{ saleLineId: task.lines[0].id, quantity: 1 }],
  };
  await expect(
    executeCommand(
      c.db,
      c.actors.manager,
      c.branchId,
      { requestId: uid() },
      "complete",
      input,
      (tx, ctx, operationId) =>
        completePreparation(tx, ctx, { ...input, operationId }),
    ),
  ).rejects.toMatchObject({ status: 409 });
  await executeCommand(
    c.db,
    c.actors.staff,
    c.branchId,
    { requestId: uid() },
    "complete",
    input,
    (tx, ctx, operationId) =>
      completePreparation(tx, ctx, { ...input, operationId }),
  );
  expect(
    (await createPreparationService(c.db).get(c.actors.staff, task.id)).task
      .status,
  ).toBe("ready");
});

it("denies personal employee delivery on both preparation and alternate fulfillment routes", async () => {
  const tasks = await order();
  const task = tasks[0];
  await c.db
    .update(s.preparationTasks)
    .set({
      status: "ready",
      assigneeId: c.actors.staff.id,
      startedAt: new Date(),
      readyAt: new Date(),
      revision: 2,
    })
    .where(eq(s.preparationTasks.id, task.id));
  await c.db
    .update(s.saleLineFulfillments)
    .set({ completed: 1 })
    .where(eq(s.saleLineFulfillments.saleLineId, task.lines[0].id));
  await expect(
    createPreparationService(c.db).act(c.actors.staff, task.id, {
      requestId: uid(),
      revision: 2,
      action: "deliver",
    }),
  ).rejects.toMatchObject({ status: 403 });
  const input = {
    orderId: task.orderId,
    lines: [{ saleLineId: task.lines[0].id, quantity: 1 }],
  };
  await expect(
    executeCommand(
      c.db,
      c.actors.staff,
      c.branchId,
      { requestId: uid() },
      "deliver",
      input,
      (tx, ctx, operationId) =>
        deliverLines(tx, ctx, { ...input, operationId }),
    ),
  ).rejects.toMatchObject({ status: 403 });
});

async function stationAssignment(
  stationId: string | null,
  startsAt: Date,
  endsAt: Date,
) {
  const [assignment] = await c.db
    .insert(s.attendanceAssignments)
    .values({
      branchId: c.branchId,
      userId: c.actors.staff.id,
      businessDate: "2026-10-29",
      kind: "work",
      name: "Turno particular",
      startsAt,
      endsAt,
      timeZone: "America/Argentina/Buenos_Aires",
      updatedBy: c.actors.admin.id,
    })
    .returning();
  await c.db.insert(workplaceStationAssignments).values({
    assignmentId: assignment.id,
    branchId: c.branchId,
    stationId,
    updatedBy: c.actors.admin.id,
  });
  return assignment;
}

it("shows station lines for the current overnight assignment and removes pending work after reassignment", async () => {
  const { getStaffWork } = await import("@/modules/staff-work/queries");
  const assignment = await stationAssignment(
    bar,
    new Date("2026-10-30T02:00:00Z"),
    new Date("2026-10-30T05:00:00Z"),
  );
  const tasks = await order();
  const snapshot = await getStaffWork(
    c.db,
    c.actors.staff,
    new Date("2026-10-30T03:30:00Z"),
  );
  expect(snapshot.assignments[0]).toMatchObject({
    stationId: bar,
    businessDate: "2026-10-29",
  });
  expect(
    snapshot.preparation.rows
      .filter((t) => t.saleId === tasks[0].saleId)
      .map((t) => t.stationId),
  ).toEqual([bar]);
  expect(
    snapshot.preparation.rows
      .find((t) => t.saleId === tasks[0].saleId)
      ?.lines.map((l) => l.name),
  ).toEqual(["Café"]);
  await c.db
    .update(workplaceStationAssignments)
    .set({ stationId: kitchen })
    .where(eq(workplaceStationAssignments.assignmentId, assignment.id));
  const changed = await getStaffWork(
    c.db,
    c.actors.staff,
    new Date("2026-10-30T03:30:00Z"),
  );
  expect(
    changed.preparation.rows
      .filter((t) => t.saleId === tasks[0].saleId)
      .map((t) => t.stationId),
  ).toEqual([kitchen]);
  const ended = await getStaffWork(
    c.db,
    c.actors.staff,
    new Date("2026-10-30T05:00:00Z"),
  );
  expect(
    ended.preparation.rows.filter((t) => t.saleId === tasks[0].saleId),
  ).toEqual([]);
  await c.db
    .update(s.attendanceAssignments)
    .set({ canceledAt: new Date() })
    .where(eq(s.attendanceAssignments.id, assignment.id));
});

it("starts only assigned station work and rejects a stale pending start after a station change", async () => {
  const now = new Date();
  const assignment = await stationAssignment(
    bar,
    new Date(now.getTime() - 60_000),
    new Date(now.getTime() + 3_600_000),
  );
  const tasks = await order();
  const target = tasks.find((t) => t.stationId === bar)!;
  const started = await createPreparationService(c.db).act(
    c.actors.staff,
    target.id,
    { requestId: uid(), revision: 1, action: "start" },
  );
  expect(started.task.assigneeId).toBe(c.actors.staff.id);
  const pending = (await order()).find((t) => t.stationId === bar)!;
  await c.db
    .update(workplaceStationAssignments)
    .set({ stationId: kitchen })
    .where(eq(workplaceStationAssignments.assignmentId, assignment.id));
  await expect(
    createPreparationService(c.db).act(c.actors.staff, pending.id, {
      requestId: uid(),
      revision: 1,
      action: "start",
    }),
  ).rejects.toMatchObject({ status: 403 });
  const finish = {
    requestId: uid(),
    revision: started.task.revision,
    action: "ready",
  };
  const ready = await createPreparationService(c.db).act(
    c.actors.staff,
    target.id,
    finish,
  );
  expect(ready.task.status).toBe("ready");
  expect(
    (
      await createPreparationService(c.db).act(
        c.actors.staff,
        target.id,
        finish,
      )
    ).task.revision,
  ).toBe(ready.task.revision);
  await c.db
    .update(s.attendanceAssignments)
    .set({ canceledAt: new Date() })
    .where(eq(s.attendanceAssignments.id, assignment.id));
});

it("does not expose personal work to the shared store account", async () => {
  const { getStaffWork } = await import("@/modules/staff-work/queries");
  await expect(
    getStaffWork(c.db, { ...c.actors.staff, accountKind: "store" }),
  ).rejects.toMatchObject({ status: 403 });
});

it("shows and authorizes only the person's assigned Depósito production", async () => {
  const { getStaffWork } = await import("@/modules/staff-work/queries");
  const { requirePersonalProductionAccess } =
    await import("@/modules/staff-work/access");
  const [depot] = await c.db
    .insert(s.locations)
    .values({
      branchId: c.branchId,
      code: "DEPOSITO",
      name: "Depósito central",
    })
    .returning();
  const [output] = await c.db
    .insert(s.items)
    .values({
      code: "STAFF-OUTPUT",
      name: "Salsa preparada",
      class: "food",
      baseUnit: "g",
      recipeUsable: true,
      purchasable: false,
    })
    .returning();
  const [recipe] = await c.db
    .insert(s.recipes)
    .values({ kind: "preparation", outputItemId: output.id })
    .returning();
  const [ingredient] = await c.db
    .select()
    .from(s.items)
    .where(eq(s.items.code, "STAFF-INGREDIENT"));
  const [version] = await c.db
    .insert(s.recipeVersions)
    .values({
      recipeId: recipe.id,
      version: 1,
      compositionModel: "configurable",
      outputName: output.name,
      outputUnit: "g",
      yieldQuantity: "100",
      actorId: c.actors.admin.id,
      preparation: {
        steps: ["Mezclar"],
        estimatedMinutes: 10,
        observations: "",
      },
    })
    .returning();
  const rows = await c.db
    .insert(s.productionOrders)
    .values([
      {
        branchId: c.branchId,
        locationId: depot.id,
        recipeVersionId: version.id,
        outputItemId: output.id,
        plannedQuantity: "100.000000",
        composition: {
          components: [
            { itemId: ingredient.id, quantity: "10.000000" },
            { itemId: ingredient.id, quantity: "5.000000" },
          ],
          selections: [],
          untracked: [],
        },
        state: "planned",
        assignedTo: c.actors.staff.id,
      },
      {
        branchId: c.branchId,
        locationId: depot.id,
        recipeVersionId: version.id,
        outputItemId: output.id,
        plannedQuantity: "200.000000",
        composition: { components: [], selections: [], untracked: [] },
        state: "planned",
        assignedTo: c.actors.manager.id,
      },
      {
        branchId: c.branchId,
        locationId: c.mapping.initialLocation.id,
        recipeVersionId: version.id,
        outputItemId: output.id,
        plannedQuantity: "300.000000",
        composition: { components: [], selections: [], untracked: [] },
        state: "planned",
        assignedTo: c.actors.staff.id,
      },
    ])
    .returning();
  const snapshot = await getStaffWork(c.db, c.actors.staff);
  expect(snapshot.production.rows.map((o) => o.id)).toEqual([rows[0].id]);
  const { listProductionOrders } = await import("@/modules/production/queries");
  expect(
    (
      await listProductionOrders(c.db, c.actors.staff, "active", 0, false)
    ).rows.map((o) => o.id),
  ).toEqual([rows[0].id]);
  expect(snapshot.production.rows[0]).toMatchObject({
    plannedQuantity: "100.000000",
    preparation: { steps: ["Mezclar"] },
    components: [
      {
        itemId: ingredient.id,
        name: "Agua",
        baseUnit: "ml",
        quantity: "15.000000",
      },
    ],
  });
  const ctx = {
    actorId: c.actors.staff.id,
    role: "staff" as const,
    branchId: c.branchId,
    timeZone: "America/Argentina/Buenos_Aires",
    accountKind: "personal" as const,
  };
  await expect(
    requirePersonalProductionAccess(c.db, ctx, rows[0].id),
  ).resolves.toBeUndefined();
  await expect(
    requirePersonalProductionAccess(c.db, ctx, rows[1].id),
  ).rejects.toMatchObject({ status: 403 });
  await expect(
    requirePersonalProductionAccess(c.db, ctx, rows[2].id),
  ).rejects.toMatchObject({ status: 403 });
  const [task] = await c.db
    .insert(s.dailyOperationTasks)
    .values({
      branchId: c.branchId,
      kind: "production",
      title: "Producción fuera de Depósito",
      documentId: rows[2].id,
      documentRevision: 1,
      assignedTo: c.actors.staff.id,
    })
    .returning();
  await c.db
    .update(s.attendanceSettings)
    .set({ requireStepUp: false })
    .where(eq(s.attendanceSettings.branchId, c.branchId));
  try {
    await expect(
      executeCommand(
        c.db,
        c.actors.staff,
        c.branchId,
        { requestId: uid() },
        "daily-task",
        { taskId: task.id, action: "start" },
        async () => ({ started: true }),
      ),
    ).rejects.toMatchObject({ code: "FORBIDDEN", status: 403 });
  } finally {
    await c.db
      .update(s.attendanceSettings)
      .set({ requireStepUp: true })
      .where(eq(s.attendanceSettings.branchId, c.branchId));
  }
});

it("rejects shared-store commands before execution or replay while preserving its delivery operation", async () => {
  const sessionId = uid();
  await c.db.insert(s.session).values({
    id: sessionId,
    userId: c.actors.staff.id,
    token: uid(),
    expiresAt: new Date(Date.now() + 3_600_000),
  });
  await c.db.insert(workplaceStoreAccounts).values({
    userId: c.actors.staff.id,
    branchId: c.branchId,
    createdBy: c.actors.admin.id,
  });
  const store = { ...c.actors.staff, sessionId, accountKind: "store" as const };
  let executed = false;
  try {
    await expect(
      executeCommand(
        c.db,
        store,
        c.branchId,
        { requestId: uid() },
        "complete",
        { taskId: uid() },
        async () => {
          executed = true;
          return { done: true };
        },
      ),
    ).rejects.toMatchObject({ status: 403 });
    expect(executed).toBe(false);
    const delivery = await executeCommand(
      c.db,
      store,
      c.branchId,
      { requestId: uid() },
      "deliver",
      { orderId: uid() },
      async () => ({ delivered: true }),
    );
    expect(delivery.result.delivered).toBe(true);
    const { listProductionOrders } =
      await import("@/modules/production/queries");
    const { getDailyOperationSnapshot } =
      await import("@/modules/daily-operations/queries");
    const reads = await Promise.allSettled([
      listProductionOrders(c.db, store, "active", 0, true),
      getDailyOperationSnapshot(c.db, store, { mine: true }),
    ]);
    expect(reads.map((read) => read.status)).toEqual(["rejected", "rejected"]);
  } finally {
    await c.db
      .delete(workplaceStoreAccounts)
      .where(eq(workplaceStoreAccounts.userId, store.id));
    await c.db.delete(s.session).where(eq(s.session.id, sessionId));
  }
});

it("keeps store preparation queues and details private when the station assignment table is unavailable", async () => {
  const tasks = await order();
  await c.db
    .insert(workplaceStoreAccounts)
    .values({
      userId: c.actors.staff.id,
      branchId: c.branchId,
      createdBy: c.actors.admin.id,
    });
  await c.client.exec(
    "alter table workplace_station_assignments rename to workplace_station_assignments_unavailable",
  );
  try {
    const store = c.actors.staff;
    const reads = await Promise.allSettled([
      createPreparationService(c.db).list(store, { saleId: tasks[0].saleId }),
      createPreparationService(c.db).get(store, tasks[0].id),
    ]);
    expect(reads.map((read) => read.status)).toEqual(["rejected", "rejected"]);
  } finally {
    await c.client.exec(
      "alter table workplace_station_assignments_unavailable rename to workplace_station_assignments",
    );
    await c.db
      .delete(workplaceStoreAccounts)
      .where(eq(workplaceStoreAccounts.userId, c.actors.staff.id));
  }
});
