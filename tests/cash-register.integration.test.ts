import { afterAll, beforeAll, expect, it } from "vitest";
import { randomUUID as uid } from "node:crypto";
import { eq } from "drizzle-orm";
import { createDataModelTestContext } from "./helpers/data-model-database";
import * as s from "@/db/schema";
import type { Actor } from "@/lib/access";
import type { CashCommand } from "@/modules/cash/types";
import { runCashCommand, runCashSettingsCommand } from "@/modules/cash/service";
import { getCashSnapshot, getCashStatus } from "@/modules/cash/queries";
import {
  recordCashMovement,
  lockCashSession,
} from "@/modules/cash/integration";
import { requireOperationalContext } from "@/modules/branches/context";
let c: Awaited<ReturnType<typeof createDataModelTestContext>>;
const admin: Actor = { id: "cash-admin", role: "admin" },
  staff: Actor = { id: "cash-staff", role: "staff" },
  manager: Actor = { id: "cash-manager", role: "manager" };
const now = new Date("2026-10-27T12:00:00Z");
const cmd = (command: CashCommand, actor = admin, id = uid(), at = now) =>
  runCashCommand(c.db, actor, id, command, at);
beforeAll(async () => {
  c = await createDataModelTestContext();
  for (const actor of [admin, staff, manager]) {
    actor.branchId = c.mapping.initialBranch.id;
    await c.db.insert(s.user).values({
      id: actor.id,
      name: actor.id,
      email: `${actor.id}@test.local`,
    });
    await c.db
      .insert(s.operationalUsers)
      .values({ userId: actor.id, role: actor.role });
    if (actor.role !== "admin")
      await c.db.insert(s.branchMemberships).values({
        branchId: actor.branchId,
        userId: actor.id,
        role: actor.role,
      });
  }
}, 60000);
afterAll(() => c?.close());
it("exposes the opening in the header only to people allowed to read cash", async () => {
  const branchId = uid();
  await c.db.insert(s.branches).values({
    id: branchId,
    code: `HEADER-${branchId.slice(0, 6).toUpperCase()}`,
    name: "Caja en encabezado",
    timeZone: "America/Argentina/Buenos_Aires",
  });
  const owner = { ...admin, branchId };
  expect(await getCashStatus(c.db, owner)).toMatchObject({
    branchId,
    canView: true,
    opening: null,
  });
  const opened = await runCashCommand(
    c.db,
    owner,
    uid(),
    { action: "open", amount: "12500.50" },
    now,
  );
  const opening = {
    openedByName: admin.id,
    openedAt: opened.current!.openedAt,
    openingCash: "12500.50",
  };
  expect(await getCashStatus(c.db, owner)).toMatchObject({
    branchId,
    actorId: admin.id,
    timeZone: "America/Argentina/Buenos_Aires",
    open: true,
    canOpen: true,
    canView: true,
    opening,
  });
  await c.db
    .insert(s.branchMemberships)
    .values({ branchId, userId: staff.id, role: "staff" });
  const employee = { ...staff, branchId };
  const restricted = await getCashStatus(c.db, employee);
  expect(restricted).toMatchObject({
    branchId,
    open: true,
    canOpen: false,
    canView: false,
    opening: null,
  });
  expect(JSON.stringify(restricted)).not.toContain("12500.50");
  await runCashSettingsCommand(c.db, owner, uid(), {
    action: "permission",
    userId: staff.id,
    canOpen: false,
    canClose: false,
    canExpense: true,
  });
  expect(await getCashStatus(c.db, employee)).toMatchObject({
    canOpen: false,
    canView: true,
    opening,
  });
});
it("requires explicit staff permissions and admin alone configures them", async () => {
  await expect(
    cmd({ action: "open", amount: "50000.00" }, staff),
  ).rejects.toMatchObject({ code: "FORBIDDEN" });
  await expect(
    runCashSettingsCommand(c.db, manager, uid(), {
      action: "permission",
      userId: staff.id,
      canOpen: true,
      canClose: true,
      canExpense: true,
    }),
  ).rejects.toMatchObject({ code: "FORBIDDEN" });
  await runCashSettingsCommand(c.db, admin, uid(), {
    action: "permission",
    userId: staff.id,
    canOpen: true,
    canClose: true,
    canExpense: true,
  });
  expect((await getCashSnapshot(c.db, staff)).capabilities).toMatchObject({
    expense: true,
    externalExpense: false,
  });
  for (const actor of [admin, manager])
    expect((await getCashSnapshot(c.db, actor)).capabilities).toMatchObject({
      expense: true,
      externalExpense: true,
    });
});
it("opens only one session and exact retry returns without another opening", async () => {
  const id = uid(),
    command: CashCommand = { action: "open", amount: "50000.00" };
  const first = await cmd(command, staff, id);
  expect(first.current?.openingCash).toBe("50000.00");
  const retry = await cmd(command, staff, id);
  expect(retry.current?.id).toBe(first.current?.id);
  expect(retry.movements).toHaveLength(1);
  await expect(cmd(command, admin)).rejects.toMatchObject({
    code: "CASH_ALREADY_OPEN",
  });
});
it("records an expense once, and staff cannot withdraw", async () => {
  const id = uid(),
    command: CashCommand = {
      action: "expense",
      amount: "1500.00",
      category: "other",
      concept: "Limpieza",
    };
  const first = await cmd(command, staff, id);
  expect(first.totals.expectedCash).toBe("48500.00");
  expect((await cmd(command, staff, id)).totals.expectedCash).toBe("48500.00");
  expect(await c.db.select().from(s.cashExpenses)).toHaveLength(1);
  await expect(
    cmd({ ...command, source: "external" }, staff),
  ).rejects.toMatchObject({ code: "FORBIDDEN" });
  expect(await c.db.select().from(s.cashExpenses)).toHaveLength(1);
  await expect(
    cmd(
      {
        action: "withdraw",
        amount: "100.00",
        reason: "Retiro",
        recipient: "Dueño",
      },
      staff,
    ),
  ).rejects.toMatchObject({ code: "FORBIDDEN" });
});
it("keeps transactions after midnight in the same operational day and preserves an immutable close", async () => {
  await c.db.transaction(async (tx) => {
    const ctx = await requireOperationalContext(tx, staff, staff.branchId!);
    await recordCashMovement(tx, ctx, {
      kind: "collection",
      amount: "5000.00",
      sourceType: "test-payment",
      sourceId: uid(),
      methodKind: "cash",
      methodName: "Efectivo",
      concept: "Cobro después de medianoche",
      occurredAt: new Date("2026-10-28T03:15:00Z"),
    });
  });
  const snapshot = await getCashSnapshot(c.db, admin);
  expect(snapshot.current?.businessDate).toBe("2026-10-27");
  expect(snapshot.totals.expectedCash).toBe("53500.00");
  const closing: CashCommand = {
    action: "close",
    sessionId: snapshot.current!.id,
    expectedRevision: snapshot.current!.revision,
    counted: "53000.00",
    withdrawal: "3000.00",
    reason: "Se recontó y faltan 500",
    posnet: { mode: "none", lots: [] },
  };
  await expect(
    cmd({ ...closing, withdrawal: "1.00" }, staff),
  ).rejects.toMatchObject({ code: "FORBIDDEN" });
  const closed = await cmd(
    closing,
    admin,
    uid(),
    new Date("2026-10-28T03:30:00Z"),
  );
  expect(closed.lastClosed).toMatchObject({
    expectedClosing: "53500.00",
    counted: "53000.00",
    withdrawal: "3000.00",
    fund: "50000.00",
    difference: "-500.00",
    reviewRequired: true,
  });
  await expect(
    c.db.transaction(async (tx) => {
      const ctx = await requireOperationalContext(tx, admin, admin.branchId!);
      await lockCashSession(tx, ctx);
    }),
  ).rejects.toMatchObject({ code: "CASH_CLOSED" });
  const reviewed = await cmd(
    {
      action: "review",
      sessionId: snapshot.current!.id,
      note: "Revisado con responsable",
    },
    manager,
  );
  expect(reviewed.lastClosed).toMatchObject({
    difference: "-500.00",
    counted: "53000.00",
    reviewNote: "Revisado con responsable",
  });
  const opened = await cmd(
    { action: "open", amount: "50000.00" },
    staff,
    uid(),
    new Date("2026-10-28T12:00:00Z"),
  );
  expect(opened.current?.businessDate).toBe("2026-10-28");
});
it("rejects a stale close revision and a replay after permission revocation", async () => {
  const snapshot = await getCashSnapshot(c.db, admin);
  await expect(
    cmd({
      action: "close",
      sessionId: snapshot.current!.id,
      expectedRevision: 0,
      counted: "50000.00",
      withdrawal: "0.00",
      reason: "",
      posnet: { mode: "none", lots: [] },
    }),
  ).rejects.toThrow();
  await c.db
    .update(s.cashPermissions)
    .set({ canOpen: false, canClose: false, canExpense: false })
    .where(eq(s.cashPermissions.userId, staff.id));
  await expect(
    cmd(
      {
        action: "expense",
        amount: "100.00",
        concept: "No autorizado",
        category: "other",
      },
      staff,
    ),
  ).rejects.toMatchObject({ code: "FORBIDDEN" });
});
it("does not debit an origin twice even when its first debit empties the drawer", async () => {
  const sourceId = uid();
  const run = c.db.transaction(async (tx) => {
    const ctx = await requireOperationalContext(tx, admin, admin.branchId!);
    const movement = {
      kind: "supplier" as const,
      amount: "-50000.00",
      sourceType: "direct-retry",
      sourceId,
      methodKind: "cash",
      methodName: "Efectivo",
      concept: "Pago",
    };
    await recordCashMovement(tx, ctx, movement);
    await recordCashMovement(tx, ctx, movement);
  });
  await expect(run).resolves.toBeUndefined();
  expect((await getCashSnapshot(c.db, admin)).totals.expectedCash).toBe("0.00");
});
it("rechecks effective authority after waiting for a cash lock", async () => {
  await c.db.transaction(async (tx) => {
    const ctx = await requireOperationalContext(tx, admin, admin.branchId!);
    await recordCashMovement(tx, ctx, {
      kind: "collection",
      amount: "10.00",
      sourceType: "authority-test-credit",
      sourceId: uid(),
      methodKind: "cash",
      methodName: "Efectivo",
      concept: "Saldo",
    });
  });
  await expect(
    c.db.transaction(async (tx) => {
      const stale = await requireOperationalContext(
        tx,
        manager,
        manager.branchId!,
      );
      // Model the new committed state visible once a lock wait finishes.
      await tx
        .update(s.branchMemberships)
        .set({ role: "staff" })
        .where(eq(s.branchMemberships.userId, manager.id));
      await recordCashMovement(tx, stale, {
        kind: "withdrawal",
        amount: "-1.00",
        sourceType: "authority-test-debit",
        sourceId: uid(),
        methodKind: "cash",
        methodName: "Efectivo",
        concept: "Retiro",
      });
    }),
  ).rejects.toMatchObject({ code: "FORBIDDEN" });
});
it("keeps an old unresolved closure reachable beyond the latest sixty sessions", async () => {
  const branchId = uid();
  await c.db.insert(s.branches).values({
    id: branchId,
    code: `HISTORY-${branchId.slice(0, 6).toUpperCase()}`,
    name: "Historial",
    timeZone: "America/Argentina/Buenos_Aires",
  });
  const older = uid();
  const rows = Array.from({ length: 62 }, (_, index) => ({
    id: index === 0 ? older : uid(),
    branchId,
    businessDate: "2026-01-01",
    state: "closed" as const,
    openingCash: "0.00",
    closeTime: "23:00",
    timeZone: "America/Argentina/Buenos_Aires",
    openedBy: admin.id,
    openedAt: new Date(Date.UTC(2026, 0, index + 1)),
    closedBy: admin.id,
    closedAt: new Date(Date.UTC(2026, 0, index + 1, 1)),
    expectedClosing: "0.00",
    counted: "0.00",
    withdrawal: "0.00",
    fund: "0.00",
    difference: "0.00",
    posnet: {
      mode: "pending" as const,
      reason: "Falta comprobante",
      lots: [],
      expected: "0.00",
      expectedOperations: 1,
      total: null,
      operations: null,
      difference: null,
      needsReview: true,
    },
    reviewRequired: index === 0,
    reviewedAt: index === 0 ? null : new Date(),
    reviewedBy: index === 0 ? null : admin.id,
  }));
  await c.db.insert(s.cashSessions).values(rows);
  const view = await getCashSnapshot(c.db, { ...admin, branchId });
  expect(view.pendingReviews).toBe(1);
  expect(view.sessions.some((session) => session.id === older)).toBe(true);
});
