import { afterAll, beforeAll, expect, it } from "vitest";
import { randomUUID as uid } from "node:crypto";
import { eq } from "drizzle-orm";
import * as s from "@/db/schema";
import { cashExpenses, cashMovements, cashSessions } from "@/db/cash-schema";
import type { Actor } from "@/lib/access";
import { executeCommand } from "@/modules/operations/command";
import { expenseCommand, getExpenses } from "@/modules/overheads/service";
import { createDataModelTestContext } from "./helpers/data-model-database";

let c: Awaited<ReturnType<typeof createDataModelTestContext>>;
const actor: Actor = { id: "cash-overheads-admin", role: "admin" };
let sessionId: string;
const manual = [
  {
    category: "rent",
    concept: "Alquiler",
    budget: "1000",
    actual: "1000",
    notes: "",
  },
];
const command = (payload: object, requestId = uid()) =>
  executeCommand(
    c.db,
    actor,
    actor.branchId!,
    { requestId },
    "business-expenses",
    payload,
    (tx, ctx, id) => expenseCommand(tx, ctx, id, payload),
  );
const expense = async (month: string, amount: string, source = "cash") => {
  const [row] = await c.db
    .insert(cashExpenses)
    .values({
      branchId: actor.branchId!,
      sessionId,
      businessDate: `${month}-15`,
      category: "maintenance",
      concept: "Reparación del local",
      amount,
      source,
      actorId: actor.id,
    })
    .returning();
  return row;
};
beforeAll(async () => {
  c = await createDataModelTestContext();
  actor.branchId = c.mapping.initialBranch.id;
  await c.db
    .insert(s.user)
    .values({
      id: actor.id,
      name: "Encargado",
      email: "cash-overheads@test.local",
    });
  await c.db
    .insert(s.operationalUsers)
    .values({ userId: actor.id, role: "admin" });
  const [session] = await c.db
    .insert(cashSessions)
    .values({
      branchId: actor.branchId,
      businessDate: "2026-10-27",
      openingCash: "0",
      closeTime: "23:00",
      timeZone: "UTC",
      openedBy: actor.id,
    })
    .returning();
  sessionId = session.id;
}, 60000);
afterAll(async () => {
  await c?.close();
});

it("includes daily expenses once alongside manual entries, excluding purchases and other months", async () => {
  const first = await expense("2026-10", "50.25");
  await expense("2026-10", "20.00", "external");
  await expense("2026-09", "900.00");
  const [other] = await c.db
    .insert(s.branches)
    .values({
      code: "CASH-OVERHEADS-OTHER",
      name: "Otra sucursal",
      timeZone: "UTC",
    })
    .returning();
  const [otherSession] = await c.db
    .insert(cashSessions)
    .values({
      branchId: other.id,
      businessDate: "2026-10-15",
      openingCash: "0",
      closeTime: "23:00",
      timeZone: "UTC",
      openedBy: actor.id,
    })
    .returning();
  await c.db
    .insert(cashExpenses)
    .values({
      branchId: other.id,
      sessionId: otherSession.id,
      businessDate: "2026-10-15",
      category: "other",
      concept: "Otra sucursal",
      amount: "9999",
      source: "cash",
      actorId: actor.id,
    });
  await c.db
    .insert(cashMovements)
    .values({
      branchId: actor.branchId!,
      sessionId,
      kind: "supplier",
      amount: "-500.00",
      methodKind: "cash",
      methodName: "Efectivo",
      concept: "Mercadería",
      sourceType: "purchase-payment",
      sourceId: uid(),
      actorId: actor.id,
    });
  const payload = {
    action: "save",
    month: "2026-10",
    revision: 0,
    expectedUnits: 100,
    entries: manual,
  };
  const key = uid();
  await command(payload, key);
  await command(payload, key);
  const view = await getExpenses(c.db, actor, "2026-10");
  expect(view.period?.entries).toHaveLength(1);
  expect(view.automaticEntries).toHaveLength(2);
  expect(view.automaticEntries[0]).toMatchObject({
    source: "cash",
    sourceId: first.id,
    actual: "50.25",
    budget: "0.00",
    fundingSource: "cash",
  });
  expect(view.summary).toMatchObject({
    budgetTotal: "1000.00",
    actualTotal: "1070.25",
    budgetRate: "10.000000",
    budgetPending: 0,
    actualPending: 0,
  });
  await expect(
    command({
      ...payload,
      revision: 1,
      entries: [...manual, view.automaticEntries[0]],
    }),
  ).rejects.toMatchObject({ status: 400 });
});

it("freezes automatic actuals on close and creates a fresh snapshot on revision without copying them twice", async () => {
  const original = await expense("2026-08", "10.00");
  const payload = {
    action: "save",
    month: "2026-08",
    revision: 0,
    expectedUnits: 100,
    entries: manual,
  };
  await command(payload);
  await command({
    action: "close",
    month: payload.month,
    revision: 1,
    confirmed: true,
  });
  await expense("2026-08", "7.00");
  await c.db
    .update(cashExpenses)
    .set({ amount: "12.00" })
    .where(eq(cashExpenses.id, original.id));
  let view = await getExpenses(c.db, actor, payload.month);
  expect(view.summary.actualTotal).toBe("1010.00");
  expect(view.automaticEntries).toHaveLength(1);
  expect(view.closures[0].summary.actualTotal).toBe("1010.00");
  await command({
    ...payload,
    action: "revise",
    revision: 2,
    confirmed: true,
    reason: "Gasto recibido después del cierre",
  });
  view = await getExpenses(c.db, actor, payload.month);
  expect(view.summary.actualTotal).toBe("1019.00");
  expect(view.period?.entries).toHaveLength(1);
  expect(view.automaticEntries).toHaveLength(2);
  expect(view.closures.map((close) => close.summary.actualTotal)).toEqual([
    "1019.00",
    "1010.00",
  ]);
  expect(view.closures.map((close) => close.entries.length)).toEqual([3, 2]);
});

it("can close a month whose actual expenses all came from daily cash records", async () => {
  await expense("2026-07", "30.00");
  await command({
    action: "save",
    month: "2026-07",
    revision: 0,
    expectedUnits: null,
    entries: [],
  });
  await command({
    action: "close",
    month: "2026-07",
    revision: 1,
    confirmed: true,
  });
  const view = await getExpenses(c.db, actor, "2026-07");
  expect(view.summary.actualTotal).toBe("30.00");
  expect(view.closures[0].entries).toHaveLength(1);
});

it("keeps monthly analysis available before the cash migration is deployed", async () => {
  await c.client.exec("drop table cash_sessions cascade");
  const view = await getExpenses(c.db, actor, "2026-10");
  expect(view.automaticEntries).toEqual([]);
  expect(view.summary.actualTotal).toBe("1000.00");
});
