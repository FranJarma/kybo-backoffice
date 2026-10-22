import { beforeAll, afterAll, it, expect } from "vitest";
import { randomUUID as uid } from "node:crypto";
import { eq } from "drizzle-orm";
import { createDataModelTestContext } from "./helpers/data-model-database";
import { user, operationalUsers } from "@/db/auth-schema";
import { branchMemberships, locations } from "@/db/branch-schema";
import {
  dailyOperationTasks as tasks,
  dailyOperationEvents as events,
} from "@/db/daily-operation-schema";
import { runTaskCommand } from "@/modules/daily-operations/commands";
import { createTransferService } from "@/modules/transfers/service";
import { syncDocumentTask } from "@/modules/daily-operations/document-adapters";
import { requireOperationalContext } from "@/modules/branches/context";
import { stockTransfers } from "@/db/transfer-schema";
import { lotLocationBalances } from "@/db/stock-schema";
import { inventoryLots } from "@/db/inventory-schema";
import { getDailyOperationSnapshot } from "@/modules/daily-operations/queries";
import type { Actor } from "@/lib/access";
let ctx: Awaited<ReturnType<typeof createDataModelTestContext>>;
const admin: Actor = { id: "daily-admin", role: "admin" },
  staff: Actor = { id: "daily-staff", role: "staff" },
  other: Actor = { id: "daily-other", role: "staff" };
beforeAll(async () => {
  ctx = await createDataModelTestContext();
  for (const a of [admin, staff, other]) {
    a.branchId = ctx.mapping.initialBranch.id;
    await ctx.db
      .insert(user)
      .values({ id: a.id, name: a.id, email: a.id + "@test.local" });
    await ctx.db
      .insert(operationalUsers)
      .values({ userId: a.id, role: a.role });
    await ctx.db.insert(branchMemberships).values({
      branchId: a.branchId,
      userId: a.id,
      role: a.role === "admin" ? "manager" : "staff",
    });
  }
}, 60000);
afterAll(async () => {
  await ctx?.close();
});
it("authorization is checked before replay after reassignment; stale commands have no event", async () => {
  const [t] = await ctx.db
    .insert(tasks)
    .values({
      branchId: admin.branchId!,
      kind: "transfer",
      title: "Reponer",
      assignedTo: staff.id,
    })
    .returning();
  const command = {
    requestId: uid(),
    expectedRevision: 1,
    action: "report_blocked",
    reason: "Falta mercadería",
  };
  await expect(
    runTaskCommand(ctx.db, other, t.id, command),
  ).rejects.toMatchObject({ status: 403 });
  await runTaskCommand(ctx.db, staff, t.id, command);
  await runTaskCommand(ctx.db, admin, t.id, {
    requestId: uid(),
    expectedRevision: 2,
    action: "assign",
    assignedTo: other.id,
  });
  await expect(
    runTaskCommand(ctx.db, staff, t.id, command),
  ).rejects.toMatchObject({ status: 403 });
  await expect(
    runTaskCommand(ctx.db, admin, t.id, {
      requestId: uid(),
      expectedRevision: 1,
      action: "cancel",
      reason: "Obsoleto",
    }),
  ).rejects.toMatchObject({ status: 409 });
  expect(
    await ctx.db.select().from(events).where(eq(events.taskId, t.id)),
  ).toHaveLength(2);
});
it("a suggestion cannot be marked complete or dispatched without an authorized document", async () => {
  const [t] = await ctx.db
    .insert(tasks)
    .values({
      branchId: admin.branchId!,
      kind: "transfer",
      title: "Reponer",
      assignedTo: staff.id,
    })
    .returning();
  await expect(
    runTaskCommand(ctx.db, staff, t.id, {
      requestId: uid(),
      expectedRevision: 1,
      action: "dispatch",
    }),
  ).rejects.toMatchObject({ status: 409 });
  expect(
    (await ctx.db.select().from(tasks).where(eq(tasks.id, t.id)))[0].state,
  ).toBe("pending");
});
it("manager confirms a suggestion without moving stock and preserves its assignee", async () => {
  const [balance] = await ctx.db.select().from(lotLocationBalances);
  const [lot] = await ctx.db
    .select()
    .from(inventoryLots)
    .where(eq(inventoryLots.id, balance.lotId));
  const [destination] = await ctx.db
    .insert(locations)
    .values({
      branchId: admin.branchId!,
      code: "DAILY-SUGGEST",
      name: "Cocina",
    })
    .returning();
  const [t] = await ctx.db
    .insert(tasks)
    .values({
      branchId: admin.branchId!,
      kind: "transfer",
      title: "Reponer",
      assignedTo: staff.id,
      originLocationId: balance.locationId,
      locationId: destination.id,
      itemId: lot.itemId,
      quantity: "1.000000",
      unit: "unit",
      needKey: "confirm-suggestion",
    })
    .returning();
  const cmd = {
    requestId: uid(),
    expectedRevision: 1,
    action: "confirm_transfer",
  };
  await expect(runTaskCommand(ctx.db, staff, t.id, cmd)).rejects.toMatchObject({
    status: 403,
  });
  await runTaskCommand(ctx.db, admin, t.id, cmd);
  const [saved] = await ctx.db.select().from(tasks).where(eq(tasks.id, t.id));
  expect(saved.documentId).toBeTruthy();
  expect(saved.assignedTo).toBe(staff.id);
  expect(saved.state).toBe("pending");
  expect(
    (
      await ctx.db
        .select()
        .from(lotLocationBalances)
        .where(eq(lotLocationBalances.lotId, balance.lotId))
    )[0].quantity,
  ).toBe(balance.quantity);
});
it("assigned internal transfer dispatch moves inventory once and completes the task atomically", async () => {
  const [balance] = await ctx.db.select().from(lotLocationBalances);
  const [lot] = await ctx.db
    .select()
    .from(inventoryLots)
    .where(eq(inventoryLots.id, balance.lotId));
  const [destination] = await ctx.db
    .insert(locations)
    .values({ branchId: admin.branchId!, code: "DAILY-BAR", name: "Barra" })
    .returning();
  const svc = createTransferService(ctx.db);
  const order = await svc.confirm(admin, admin.branchId!, {
    requestId: uid(),
    originLocationId: balance.locationId,
    destinationLocationId: destination.id,
    reason: "Reposición",
    demands: [{ itemId: lot.itemId, quantity: "2.000000" }],
  });
  await ctx.db.transaction(async (tx) => {
    await syncDocumentTask(
      tx,
      await requireOperationalContext(tx, admin, admin.branchId!),
      { type: "transfer", id: order.result.id },
    );
  });
  let [task] = await ctx.db
    .select()
    .from(tasks)
    .where(eq(tasks.documentId, order.result.id));
  await runTaskCommand(ctx.db, admin, task.id, {
    requestId: uid(),
    expectedRevision: task.revision,
    action: "assign",
    assignedTo: staff.id,
  });
  [task] = await ctx.db.select().from(tasks).where(eq(tasks.id, task.id));
  const cmd = {
    requestId: uid(),
    expectedRevision: task.revision,
    action: "dispatch",
  };
  const view = await getDailyOperationSnapshot(ctx.db, staff, { mine: true });
  expect(view.tasks.find((t) => t.id === task.id)?.materials).toEqual([
    expect.objectContaining({
      itemId: lot.itemId,
      quantity: "2.000000",
      unit: "unit",
    }),
  ]);
  await runTaskCommand(ctx.db, staff, task.id, cmd);
  await runTaskCommand(ctx.db, staff, task.id, cmd);
  expect(
    (
      await ctx.db
        .select()
        .from(stockTransfers)
        .where(eq(stockTransfers.id, order.result.id))
    )[0].state,
  ).toBe("received");
  expect(
    (await ctx.db.select().from(tasks).where(eq(tasks.id, task.id)))[0].state,
  ).toBe("done");
  expect(
    (
      await ctx.db
        .select()
        .from(lotLocationBalances)
        .where(eq(lotLocationBalances.locationId, destination.id))
    )[0].quantity,
  ).toBe("2.000000");
});
