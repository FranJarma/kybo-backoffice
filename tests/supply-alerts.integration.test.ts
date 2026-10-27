import { afterAll, beforeAll, expect, it } from "vitest";
import { randomUUID as uid } from "node:crypto";
import { eq } from "drizzle-orm";
import { createDataModelTestContext } from "./helpers/data-model-database";
import { user, operationalUsers } from "@/db/auth-schema";
import { locations, branchMemberships } from "@/db/branch-schema";
import { items } from "@/db/item-schema";
import { dailyOperationTasks as tasks } from "@/db/daily-operation-schema";
import { supplyAlertPolicies } from "@/db/supply-alert-schema";
import { replenishmentPolicies } from "@/db/replenishment-schema";
import { stockMovements } from "@/db/stock-movement-schema";
import { createInventoryService } from "@/modules/inventory/service";
import { createTransferService } from "@/modules/transfers/service";
import { executeCommand } from "@/modules/operations/command";
import {
  saveSupplyPolicy,
  getSupplySnapshot,
} from "@/modules/supply-alerts/service";
import { reconcileDailyOperations } from "@/modules/daily-operations/reconcile";
import { getDailyOperationSnapshot } from "@/modules/daily-operations/queries";
import type { Actor } from "@/lib/access";
let ctx: Awaited<ReturnType<typeof createDataModelTestContext>>;
const manager: Actor = { id: "supply-manager", role: "admin" };
const staff: Actor = { id: "supply-staff", role: "staff" };
let bar: string;
beforeAll(async () => {
  ctx = await createDataModelTestContext();
  for (const a of [manager, staff]) {
    a.branchId = ctx.mapping.initialBranch.id;
    await ctx.db
      .insert(user)
      .values({ id: a.id, name: a.id, email: `${a.id}@test.local` });
    await ctx.db
      .insert(operationalUsers)
      .values({ userId: a.id, role: a.role });
  }
  await ctx.db
    .insert(branchMemberships)
    .values({ userId: staff.id, branchId: staff.branchId!, role: "staff" });
  [bar] = (
    await ctx.db
      .insert(locations)
      .values({
        branchId: manager.branchId!,
        code: "SUPPLY-BAR",
        name: "Barra",
      })
      .returning()
  ).map((l) => l.id);
}, 60000);
afterAll(async () => {
  await ctx?.close();
});
const save = (actor: Actor, policy: unknown, requestId = uid()) =>
  executeCommand(
    ctx.db,
    actor,
    actor.branchId!,
    { requestId },
    "supply-alert-policy",
    { policy },
    (tx, context, op) => saveSupplyPolicy(tx, context, op, policy),
  );
async function scenario(quantity = "1500") {
  const [item] = await ctx.db
    .insert(items)
    .values({
      code: uid().toUpperCase(),
      name: "Vasos de Bolivia",
      class: "packaging",
      baseUnit: "unit",
      purchasable: true,
      recipeUsable: true,
    })
    .returning();
  await createInventoryService(ctx.db).adjust(manager, {
    requestId: uid(),
    kind: "opening",
    itemId: item.id,
    locationId: ctx.mapping.initialLocation.id,
    quantity,
    unitCost: "1",
    receivedOn: "2026-10-01",
    expiresOn: null,
    reason: "Prueba",
  });
  const input = {
    itemId: item.id,
    dailyConsumption: "150",
    leadDays: 7,
    safetyDays: 3,
    targetDays: 17,
    enabled: true,
  };
  return { item, input };
}
it("audits policy saves, protects roles/revisions and revalidates replay authorization", async () => {
  const { input } = await scenario();
  await expect(save(staff, input)).rejects.toMatchObject({ status: 403 });
  await expect(getSupplySnapshot(ctx.db, staff)).rejects.toMatchObject({
    status: 403,
  });
  const requestId = uid();
  const created = await save(manager, input, requestId);
  expect(created.result).toMatchObject({
    revision: 1,
    dailyConsumption: "150.000000",
  });
  expect((await save(manager, input, requestId)).replayed).toBe(true);
  const edit = {
    ...input,
    id: created.result.id,
    revision: 1,
    dailyConsumption: "160",
  };
  await save(manager, edit);
  await expect(save(manager, edit)).rejects.toMatchObject({ status: 409 });
  await expect(
    save(manager, { ...input, targetDays: 10 }),
  ).rejects.toMatchObject({ status: 400 });
  await ctx.db
    .update(operationalUsers)
    .set({ disabled: true })
    .where(eq(operationalUsers.userId, manager.id));
  await expect(save(manager, input, requestId)).rejects.toMatchObject({
    status: 403,
  });
  await ctx.db
    .update(operationalUsers)
    .set({ disabled: false })
    .where(eq(operationalUsers.userId, manager.id));
});
it("keeps same-branch transfer reservations in coverage, with no stock writes by reads", async () => {
  const { item, input } = await scenario();
  await save(manager, input);
  const read = async () =>
    (await getSupplySnapshot(ctx.db, manager)).alerts.find(
      (a) => a.itemId === item.id,
    )!;
  expect(await read()).toMatchObject({
    availableQuantity: "1500.000000",
    coverageDays: "10.000000",
    urgency: "high",
  });
  const transfer = await createTransferService(ctx.db).confirm(
    manager,
    manager.branchId!,
    {
      requestId: uid(),
      originLocationId: ctx.mapping.initialLocation.id,
      destinationLocationId: bar,
      reason: "Prueba",
      demands: [{ itemId: item.id, quantity: "100.000000" }],
    },
  );
  const movements = await ctx.db.select().from(stockMovements);
  expect(await read()).toMatchObject({
    availableQuantity: "1500.000000",
    coverageDays: "10.000000",
  });
  expect(await ctx.db.select().from(stockMovements)).toEqual(movements);
  await createTransferService(ctx.db).dispatch(
    manager,
    manager.branchId!,
    transfer.result.id,
    { requestId: uid(), expectedRevision: 1 },
  );
  expect(await read()).toMatchObject({
    availableQuantity: "1500.000000",
    coverageDays: "10.000000",
  });
});
it("reconciles one purchase per item, preserves assignment, and changes urgency and deadline", async () => {
  const { item, input } = await scenario("1800");
  const policy = (await save(manager, input)).result;
  const reconcile = () =>
    reconcileDailyOperations(ctx.db, manager, { requestId: uid() });
  await reconcile();
  await reconcile();
  let rows = await ctx.db.select().from(tasks).where(eq(tasks.itemId, item.id));
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({
    kind: "purchase",
    urgency: "scheduled",
    quantity: "750.000000",
    locationId: null,
  });
  expect(rows[0].dueAt).not.toBeNull();
  await ctx.db
    .update(tasks)
    .set({ assignedTo: staff.id })
    .where(eq(tasks.id, rows[0].id));
  await save(manager, {
    ...input,
    id: policy.id,
    revision: 1,
    dailyConsumption: "300",
  });
  await reconcile();
  rows = await ctx.db.select().from(tasks).where(eq(tasks.itemId, item.id));
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({
    urgency: "critical",
    assignedTo: staff.id,
    quantity: "3300.000000",
  });
  const view = await getDailyOperationSnapshot(ctx.db, manager, {});
  expect(view.timeZone).toBe(ctx.mapping.initialBranch.timeZone);
  expect(
    view.tasks.find((t) => t.itemId === item.id && t.kind === "purchase")
      ?.purchaseAlert,
  ).toMatchObject({
    itemId: item.id,
    suggestedQuantity: "3300.000000",
    leadDays: 7,
    safetyDays: 3,
  });
  const ranks = view.tasks.map(
    (t) => ({ critical: 0, high: 1, scheduled: 2 })[t.urgency],
  );
  expect(ranks).toEqual([...ranks].sort());
  await ctx.db
    .update(supplyAlertPolicies)
    .set({ enabled: false })
    .where(eq(supplyAlertPolicies.id, policy.id));
  await reconcile();
  expect(
    (await ctx.db.select().from(tasks).where(eq(tasks.id, rows[0].id)))[0]
      .state,
  ).toBe("superseded");
});

it("replaces generic location purchases once and resolves incomplete consumption without leaving a blocked purchase", async () => {
  const { item, input } = await scenario("100");
  const configured = (await save(manager, { ...input, dailyConsumption: null }))
    .result;
  await ctx.db.insert(replenishmentPolicies).values({
    branchId: manager.branchId!,
    locationId: bar,
    itemId: item.id,
    minimumQuantity: "100.000000",
    targetQuantity: "300.000000",
    enabled: true,
    updatedBy: manager.id,
  });
  await reconcileDailyOperations(ctx.db, manager, { requestId: uid() });
  const incomplete = (
    await ctx.db.select().from(tasks).where(eq(tasks.itemId, item.id))
  ).find((t) => t.needKey?.startsWith("supply-config:"));
  expect(incomplete?.state).toBe("blocked");
  await save(manager, {
    ...input,
    id: configured.id,
    revision: configured.revision,
  });
  await reconcileDailyOperations(ctx.db, manager, { requestId: uid() });
  const current = (
    await ctx.db.select().from(tasks).where(eq(tasks.itemId, item.id))
  ).filter((t) => t.state !== "superseded");
  expect(current.filter((t) => t.kind === "purchase")).toEqual([
    expect.objectContaining({
      needKey: `supply:${item.id}`,
      state: "pending",
      urgency: "critical",
    }),
  ]);
  expect(current.filter((t) => t.kind === "transfer")).toHaveLength(1);
});

it("keeps the existing board usable and reports pending activation without the new migration", async () => {
  const legacy = await createDataModelTestContext({ legacySupplyAlerts: true });
  try {
    const actor = {
      id: "legacy-supply",
      role: "admin" as const,
      branchId: legacy.mapping.initialBranch.id,
    };
    await legacy.db.insert(user).values({
      id: actor.id,
      name: actor.id,
      email: `${actor.id}@test.local`,
    });
    await legacy.db
      .insert(operationalUsers)
      .values({ userId: actor.id, role: "admin" });
    expect(await getSupplySnapshot(legacy.db, actor)).toMatchObject({
      available: false,
    });
    await reconcileDailyOperations(legacy.db, actor, { requestId: uid() });
    expect(
      (
        await getDailyOperationSnapshot(legacy.db, actor, {})
      ).configurationWarnings.join(" "),
    ).toContain("pendientes de activación");
  } finally {
    await legacy.close();
  }
});
