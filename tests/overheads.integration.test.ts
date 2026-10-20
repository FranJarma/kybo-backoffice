import { afterAll, beforeAll, expect, it } from "vitest";
import { randomUUID as uid } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { createDataModelTestContext } from "./helpers/data-model-database";
import * as s from "@/db/schema";
import type { Actor } from "@/lib/access";
import { executeCommand } from "@/modules/operations/command";
import { expenseCommand, getExpenses } from "@/modules/overheads/service";
let c: Awaited<ReturnType<typeof createDataModelTestContext>>;
const actor: Actor = { id: "expenses-admin", role: "admin" };
const staff: Actor = {
  id: "expenses-staff",
  role: "staff",
  catalogManager: true,
};
const entries = [
  {
    category: "rent",
    concept: "Alquiler",
    budget: "2000000",
    actual: "2100000",
    notes: "",
  },
];
const cmd = (payload: object, who = actor, requestId = uid()) =>
  executeCommand(
    c.db,
    who,
    who.branchId!,
    { requestId },
    "business-expenses",
    payload,
    (tx, ctx, id) => expenseCommand(tx, ctx, id, payload),
  );
beforeAll(async () => {
  c = await createDataModelTestContext();
  for (const a of [actor, staff]) {
    a.branchId = c.mapping.initialBranch.id;
    await c.db
      .insert(s.user)
      .values({ id: a.id, name: a.id, email: `${a.id}@test.local` });
    await c.db.insert(s.operationalUsers).values({
      userId: a.id,
      role: a.role,
      catalogManager: a.catalogManager ?? false,
    });
  }
  await c.db
    .insert(s.branchMemberships)
    .values({ userId: staff.id, branchId: staff.branchId!, role: "staff" });
}, 60000);
afterAll(async () => {
  await c?.close();
});
it("keeps unknown actual expenses pending while saving a budget", async () => {
  const saved = await cmd({
    action: "save",
    month: "2026-01",
    revision: 0,
    expectedUnits: 4000,
    entries: [{ ...entries[0], budget: "2.000.000", actual: "" }],
  });
  expect(saved.result.entries[0]).toMatchObject({
    budget: "2000000.00",
    actual: null,
  });
  const view = await getExpenses(c.db, actor, "2026-01");
  expect(view.summary).toMatchObject({
    budgetRate: "500.000000",
    actualRate: null,
    actualPending: 1,
  });
  await expect(
    cmd({ action: "close", month: "2026-01", revision: 1, confirmed: true }),
  ).rejects.toMatchObject({ status: 400 });
});
it("saves fixed expense types automatically while preserving descriptions and legacy detail", async () => {
  const input = {
    action: "save",
    month: "2026-02",
    revision: 0,
    expectedUnits: null,
    entries: [
      { category: "electricity", budget: "", actual: "", notes: "" },
      {
        category: "other",
        concept: "Seguro del local",
        budget: "1000",
        actual: "",
        notes: "",
      },
      {
        ...entries[0],
        concept: "Alquiler depósito",
        notes: "Contrato anterior",
      },
    ],
  };
  await expect(
    cmd({ ...input, entries: [{ ...input.entries[1], concept: " " }] }),
  ).rejects.toMatchObject({
    status: 400,
    fields: { "entries.0.concept": "Describí el gasto al elegir «Otros»." },
  });
  await cmd(input);
  const view = await getExpenses(c.db, actor, "2026-02");
  expect(view.period?.entries).toMatchObject([
    {
      category: "electricity",
      concept: "Luz",
      budget: null,
      actual: null,
      notes: "",
    },
    { category: "other", concept: "Seguro del local", notes: "" },
    {
      category: "rent",
      concept: "Alquiler depósito",
      notes: "Contrato anterior",
    },
  ]);
});
it("stores an estimated IIBB rate, preserves it on older writes and snapshots revisions", async () => {
  const input = {
    action: "save",
    month: "2026-05",
    revision: 0,
    expectedUnits: 4000,
    entries,
    iibbRate: "4,5",
  };
  expect((await cmd(input)).result.iibbRate).toBe("4.50");
  const oldInput = {
    action: "save",
    month: input.month,
    revision: input.revision,
    expectedUnits: input.expectedUnits,
    entries: input.entries,
  };
  await cmd({ ...oldInput, revision: 1 });
  expect((await getExpenses(c.db, actor, "2026-05")).period?.iibbRate).toBe(
    "4.50",
  );
  await cmd({
    action: "close",
    month: "2026-05",
    revision: 2,
    confirmed: true,
  });
  await cmd({
    ...input,
    action: "revise",
    revision: 3,
    iibbRate: "0",
    confirmed: true,
    reason: "Exención confirmada",
  });
  expect(
    (await getExpenses(c.db, actor, "2026-05")).closures.map((x) => x.iibbRate),
  ).toEqual(["0.00", "4.50"]);
  await expect(
    cmd({ ...input, month: "2026-04", iibbRate: "100,01" }),
  ).rejects.toMatchObject({ status: 400 });
});
it("saves, retries idempotently, rejects stale versions, and keeps closed snapshots immutable", async () => {
  const input = {
    action: "save",
    month: "2026-09",
    revision: 0,
    expectedUnits: 4000,
    entries,
  };
  const key = uid();
  const saved = await cmd(input, actor, key);
  expect((await cmd(input, actor, key)).replayed).toBe(true);
  expect(saved.result.revision).toBe(1);
  await expect(cmd(input)).rejects.toMatchObject({ status: 409 });
  const closed = await cmd({
    ...input,
    action: "close",
    revision: 1,
    confirmed: true,
  });
  expect(closed.result.status).toBe("closed");
  let view = await getExpenses(c.db, actor, "2026-09");
  expect(view.closures[0]).toMatchObject({
    sequence: 1,
    actualUnits: 0,
    summary: { actualRate: null, budgetRate: "500.000000" },
  });
  await expect(cmd({ ...input, revision: 2 })).rejects.toMatchObject({
    status: 409,
  });
  await expect(
    cmd({
      ...input,
      action: "revise",
      revision: 2,
      confirmed: true,
      reason: "",
    }),
  ).rejects.toThrow();
  await cmd({
    ...input,
    action: "revise",
    revision: 2,
    confirmed: true,
    reason: "Factura de alquiler corregida",
    entries: [{ ...entries[0], actual: "2200000" }],
  });
  view = await getExpenses(c.db, actor, "2026-09");
  expect(view.closures.map((v) => v.summary.actualTotal)).toEqual([
    "2200000.00",
    "2100000.00",
  ]);
  expect(
    (
      await c.db
        .select()
        .from(s.auditEvents)
        .where(
          and(
            eq(s.auditEvents.entity, "expense-periods"),
            eq(s.auditEvents.recordId, saved.result.id),
          ),
        )
    ).length,
  ).toBe(3);
  await c.db
    .update(s.operationalUsers)
    .set({ disabled: true })
    .where(eq(s.operationalUsers.userId, actor.id));
  await expect(cmd(input, actor, key)).rejects.toMatchObject({ status: 403 });
  await c.db
    .update(s.operationalUsers)
    .set({ disabled: false })
    .where(eq(s.operationalUsers.userId, actor.id));
});
it("protects financial reads and writes from staff, including catalog managers", async () => {
  await expect(getExpenses(c.db, staff, "2026-09")).rejects.toMatchObject({
    status: 403,
  });
  await expect(
    cmd(
      {
        action: "save",
        month: "2026-08",
        revision: 0,
        expectedUnits: 10,
        entries,
      },
      staff,
    ),
  ).rejects.toMatchObject({ status: 403 });
});
it("allows the assigned branch manager but forbids another branch", async () => {
  const manager: Actor = {
    id: "expense-branch-manager",
    role: "staff",
    branchId: actor.branchId,
  };
  await c.db.insert(s.user).values({
    id: manager.id,
    name: "Encargado",
    email: "expenses-manager@test.local",
  });
  await c.db
    .insert(s.operationalUsers)
    .values({ userId: manager.id, role: "staff" });
  await c.db.insert(s.branchMemberships).values({
    userId: manager.id,
    branchId: manager.branchId!,
    role: "manager",
  });
  await expect(getExpenses(c.db, manager, "2026-09")).resolves.toHaveProperty(
    "month",
    "2026-09",
  );
  await expect(
    cmd(
      {
        action: "save",
        month: "2026-06",
        revision: 0,
        expectedUnits: 10,
        entries,
      },
      manager,
    ),
  ).resolves.toHaveProperty("result.revision", 1);
  const [other] = await c.db
    .insert(s.branches)
    .values({ code: "EXP-NO-MEMBERSHIP", name: "Otra", timeZone: "UTC" })
    .returning();
  await expect(
    getExpenses(c.db, { ...manager, branchId: other.id }, "2026-09"),
  ).rejects.toMatchObject({ status: 403 });
});
it("does not close incomplete actuals or mistake blank amounts for zero", async () => {
  await cmd({
    action: "save",
    month: "2026-08",
    revision: 0,
    expectedUnits: null,
    entries: [{ ...entries[0], budget: "", actual: "" }],
  });
  const view = await getExpenses(c.db, actor, "2026-08");
  expect(view.summary).toMatchObject({ budgetRate: null, actualPending: 1 });
  await expect(
    cmd({ action: "close", month: "2026-08", revision: 1, confirmed: true }),
  ).rejects.toMatchObject({ status: 400 });
  await expect(
    cmd({
      action: "save",
      month: "2026-13",
      revision: 0,
      expectedUnits: 1,
      entries,
    }),
  ).rejects.toThrow();
});
it("keeps closure snapshots immutable even at the database level", async () => {
  const view = await getExpenses(c.db, actor, "2026-09");
  await expect(
    c.db
      .update(s.expenseClosures)
      .set({ reason: "Silent overwrite" })
      .where(eq(s.expenseClosures.id, view.closures[0].id)),
  ).rejects.toThrow();
});
it("counts only historical final lines in closed sales within branch and business month", async () => {
  const [p] = await c.db
    .insert(s.products)
    .values({ name: "Final product" })
    .returning();
  const [other] = await c.db
    .insert(s.branches)
    .values({ code: "EXP-OTHER", name: "Otra", timeZone: "UTC" })
    .returning();
  for (const [status, day, branchId, q] of [
    ["closed", "2026-07-01", actor.branchId!, 2],
    ["closed", "2026-07-31", actor.branchId!, 3],
    ["open", "2026-07-10", actor.branchId!, 50],
    ["cancelled", "2026-07-10", actor.branchId!, 50],
    ["closed", "2026-08-01", actor.branchId!, 50],
    ["closed", "2026-07-10", other.id, 50],
  ] as const) {
    const [sale] = await c.db
      .insert(s.sales)
      .values({
        branchId,
        status,
        businessDate: day,
        origin: "counter",
        channel: "counter",
        fulfillment: "takeaway",
        totalAmount: "0",
        actorId: actor.id,
      })
      .returning();
    const [order] = await c.db
      .insert(s.saleOrders)
      .values({
        branchId,
        saleId: sale.id,
        sequence: 1,
        totalAmount: "0",
        actorId: actor.id,
      })
      .returning();
    await c.db.insert(s.saleLines).values({
      branchId,
      orderId: order.id,
      position: 0,
      productId: p.id,
      name: p.name,
      quantity: q,
      unitPrice: "0",
      lineTotal: "0",
    });
  }
  expect((await getExpenses(c.db, actor, "2026-07")).actualUnits).toBe(5);
  const [combo] = await c.db
    .insert(s.products)
    .values({ name: "Combo", kind: "combo" })
    .returning();
  const [version] = await c.db
    .insert(s.comboVersions)
    .values({ productId: combo.id, revision: 1, actorId: actor.id })
    .returning();
  const [group] = await c.db
    .insert(s.comboGroups)
    .values({ versionId: version.id, name: "Elegir", quantity: 3, position: 0 })
    .returning();
  const [option] = await c.db
    .insert(s.comboOptions)
    .values({ groupId: group.id, productId: p.id, position: 0 })
    .returning();
  const [fulfillment] = await c.db
    .insert(s.productFulfillmentVersions)
    .values({
      productId: p.id,
      version: 1,
      mode: "direct",
      itemId: c.itemId,
      quantity: "1",
    })
    .returning();
  const [sale] = await c.db
    .insert(s.sales)
    .values({
      branchId: actor.branchId!,
      status: "closed",
      businessDate: "2026-07-31",
      origin: "counter",
      channel: "counter",
      fulfillment: "takeaway",
      totalAmount: "0",
      actorId: actor.id,
    })
    .returning();
  const [order] = await c.db
    .insert(s.saleOrders)
    .values({
      branchId: actor.branchId!,
      saleId: sale.id,
      sequence: 1,
      totalAmount: "0",
      actorId: actor.id,
    })
    .returning();
  const [parent] = await c.db
    .insert(s.saleLines)
    .values({
      branchId: actor.branchId!,
      orderId: order.id,
      position: 0,
      productId: combo.id,
      name: "Combo",
      quantity: 2,
      unitPrice: "0",
      lineTotal: "0",
      lineKind: "combo",
      comboVersionId: version.id,
    })
    .returning();
  await c.db.insert(s.saleLines).values({
    branchId: actor.branchId!,
    orderId: order.id,
    position: 1,
    productId: p.id,
    name: p.name,
    quantity: 6,
    unitPrice: "0",
    lineTotal: "0",
    lineKind: "combo_component",
    comboVersionId: version.id,
    parentLineId: parent.id,
    comboGroupId: group.id,
    comboOptionId: option.id,
    fulfillmentVersionId: fulfillment.id,
  });
  expect((await getExpenses(c.db, actor, "2026-07")).actualUnits).toBe(11);
  await cmd({
    action: "save",
    month: "2026-07",
    revision: 0,
    expectedUnits: 100,
    entries,
  });
  await cmd({
    action: "close",
    month: "2026-07",
    revision: 1,
    confirmed: true,
  });
  const [nextVersion] = await c.db
    .insert(s.comboVersions)
    .values({ productId: combo.id, revision: 2, actorId: actor.id })
    .returning();
  await c.db.insert(s.comboGroups).values({
    versionId: nextVersion.id,
    name: "Nuevo combo",
    quantity: 10,
    position: 0,
  });
  expect((await getExpenses(c.db, actor, "2026-07")).actualUnits).toBe(11);
  await c.db
    .update(s.sales)
    .set({ status: "cancelled" })
    .where(eq(s.sales.id, sale.id));
  const changed = await getExpenses(c.db, actor, "2026-07");
  expect(changed.actualUnits).toBe(5);
  expect(changed.closures[0].actualUnits).toBe(11);
  await c.db
    .update(s.products)
    .set({ name: "Renamed later" })
    .where(eq(s.products.id, p.id));
  expect((await getExpenses(c.db, actor, "2026-07")).actualUnits).toBe(5);
});
