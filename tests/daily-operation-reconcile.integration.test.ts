import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { randomUUID as uid } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { createRecipeService } from "@/modules/recipes/service";
import { productionOrders } from "@/db/production-order-schema";
import { syncDocumentTask } from "@/modules/daily-operations/document-adapters";
import { requireOperationalContext } from "@/modules/branches/context";
import { createDataModelTestContext } from "./helpers/data-model-database";
import { user, operationalUsers } from "@/db/auth-schema";
import { locations, branchMemberships } from "@/db/branch-schema";
import { items } from "@/db/item-schema";
import { replenishmentPolicies } from "@/db/replenishment-schema";
import { dailyOperationTasks as tasks } from "@/db/daily-operation-schema";
import { reconcileDailyOperations } from "@/modules/daily-operations/reconcile";
import { getDailyOperationSnapshot } from "@/modules/daily-operations/queries";
import type { Actor } from "@/lib/access";
let ctx: Awaited<ReturnType<typeof createDataModelTestContext>>;
const actor: Actor = { id: "daily-reconcile", role: "admin" },
  staff: Actor = { id: "daily-read-staff", role: "staff" };
let bar: string, itemId: string;
beforeAll(async () => {
  ctx = await createDataModelTestContext();
  for (const a of [actor, staff]) {
    a.branchId = ctx.mapping.initialBranch.id;
    await ctx.db
      .insert(user)
      .values({ id: a.id, name: a.id, email: a.id + "@test.local" });
    await ctx.db
      .insert(operationalUsers)
      .values({ userId: a.id, role: a.role });
  }
  await ctx.db
    .insert(branchMemberships)
    .values({ branchId: staff.branchId!, userId: staff.id, role: "staff" });
  const [item] = await ctx.db.select().from(items);
  itemId = item.id;
  const [l] = await ctx.db
    .insert(locations)
    .values({ branchId: actor.branchId!, code: "DAILY", name: "Barra" })
    .returning();
  bar = l.id;
  await ctx.db.insert(replenishmentPolicies).values({
    branchId: actor.branchId!,
    locationId: bar,
    itemId,
    minimumQuantity: "2.000000",
    targetQuantity: "20.000000",
    enabled: true,
    updatedBy: actor.id,
  });
}, 60000);
afterAll(async () => {
  await ctx?.close();
});
it("reconciliation deduplicates and preserves assignment; partial source leaves remainder", async () => {
  await reconcileDailyOperations(ctx.db, actor, { requestId: uid() });
  const first = await ctx.db.select().from(tasks);
  expect(first.filter((t) => t.kind === "transfer")).toHaveLength(1);
  expect(first.find((t) => t.kind === "transfer")?.quantity).toBe("12.000000");
  expect(first.find((t) => t.kind === "purchase")?.quantity).toBe("8.000000");
  await ctx.db
    .update(tasks)
    .set({ assignedTo: staff.id })
    .where(eq(tasks.id, first[0].id));
  await reconcileDailyOperations(ctx.db, actor, { requestId: uid() });
  expect(await ctx.db.select().from(tasks)).toHaveLength(2);
  expect(
    (await ctx.db.select().from(tasks).where(eq(tasks.id, first[0].id)))[0]
      .assignedTo,
  ).toBe(staff.id);
});
it("snapshot reads physical stock without writes and staff cannot read team tasks", async () => {
  const before = await ctx.db.select().from(tasks);
  const view = await getDailyOperationSnapshot(ctx.db, actor, {});
  expect(
    view.stock.find((s) => s.itemId === itemId && s.locationId === bar),
  ).toMatchObject({ physical: "0.000000", available: "0.000000" });
  expect(
    view.stock.find(
      (s) =>
        s.itemId === itemId && s.locationId === ctx.mapping.initialLocation.id,
    ),
  ).toMatchObject({ physical: "12.000000", available: "12.000000" });
  expect(await ctx.db.select().from(tasks)).toEqual(before);
  await expect(
    getDailyOperationSnapshot(ctx.db, staff, { mine: false }),
  ).rejects.toMatchObject({ status: 403 });
  const mine = await getDailyOperationSnapshot(ctx.db, staff, { mine: true });
  expect(mine.tasks.every((t) => t.assignedTo === staff.id)).toBe(true);
  expect(mine.people).toEqual([]);
});
it("disabled need is superseded rather than completed", async () => {
  await ctx.db.update(replenishmentPolicies).set({ enabled: false });
  await reconcileDailyOperations(ctx.db, actor, { requestId: uid() });
  expect(
    (await ctx.db.select().from(tasks)).every((t) => t.state === "superseded"),
  ).toBe(true);
});
it("time alone raises urgency for an unchanged production order", async () => {
  const [output] = await ctx.db
    .insert(items)
    .values({
      code: "DAILY-OUTPUT",
      name: "Preparado diario",
      class: "food",
      baseUnit: "unit",
      recipeUsable: true,
      purchasable: false,
    })
    .returning();
  const recipe = await createRecipeService(ctx.db).save(actor, {
    requestId: uid(),
    kind: "preparation",
    targetId: output.id,
    yieldQuantity: "1",
    lines: [{ options: [{ itemId, quantity: "1" }] }],
    preparation: {
      steps: ["Preparar"],
      estimatedMinutes: 10,
      observations: "",
    },
  });
  const [order] = await ctx.db
    .insert(productionOrders)
    .values({
      branchId: actor.branchId!,
      locationId: bar,
      outputItemId: output.id,
      recipeVersionId: recipe.versionId,
      plannedQuantity: "1.000000",
      composition: { components: [], selections: [], untracked: [] },
      state: "planned",
      scheduledFor: new Date("2030-10-22T12:00:00Z"),
      assignedTo: staff.id,
    })
    .returning();
  vi.useFakeTimers({ toFake: ["Date"] });
  try {
    vi.setSystemTime(new Date("2030-10-22T11:00:00Z"));
    const sync = () =>
      ctx.db.transaction(async (tx) =>
        syncDocumentTask(
          tx,
          await requireOperationalContext(tx, actor, actor.branchId!),
          { type: "production", id: order.id },
        ),
      );
    await sync();
    expect(
      (
        await ctx.db.select().from(tasks).where(eq(tasks.documentId, order.id))
      )[0].urgency,
    ).toBe("scheduled");
    vi.setSystemTime(new Date("2030-10-22T13:00:00Z"));
    await sync();
    expect(
      (
        await ctx.db.select().from(tasks).where(eq(tasks.documentId, order.id))
      )[0].urgency,
    ).toBe("high");
  } finally {
    vi.useRealTimers();
  }
});
it("reconciliation reads orders and physical balances in one repeatable snapshot", async () => {
  const original = ctx.db.transaction.bind(ctx.db);
  let isolation: unknown;
  const proxy = new Proxy(ctx.db, {
    get(target, key) {
      if (key === "transaction")
        return ((callback, config) =>
          original(async (tx) => {
            isolation = (await tx.execute(sql`show transaction_isolation`))
              .rows[0];
            return callback(tx);
          }, config)) as typeof ctx.db.transaction;
      return Reflect.get(target, key);
    },
  });
  await reconcileDailyOperations(proxy, actor, { requestId: uid() });
  expect(isolation).toMatchObject({ transaction_isolation: "repeatable read" });
});
it("disabled assignee is visible as needing reassignment", async () => {
  await ctx.db
    .update(operationalUsers)
    .set({ disabled: true })
    .where(eq(operationalUsers.userId, staff.id));
  const view = await getDailyOperationSnapshot(ctx.db, actor, {});
  expect(
    view.tasks.find((t) => t.assignedTo === staff.id)?.assigneeUnavailable,
  ).toBe(true);
});
