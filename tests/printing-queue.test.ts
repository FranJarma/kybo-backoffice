import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID as uid } from "node:crypto";
import { eq } from "drizzle-orm";
import * as s from "@/db/schema";
import type { Actor } from "@/lib/access";
import { createDataModelTestContext } from "./helpers/data-model-database";
import {
  runPrintingCommand,
  getPrintingSnapshot,
} from "@/modules/printing/service";
import {
  enqueueOrderPrints,
  cancelOrderPrints,
  notifyLocatorChange,
} from "@/modules/printing/snapshot";
import { runConnectorCommand } from "@/modules/printing/connector";
let c: Awaited<ReturnType<typeof createDataModelTestContext>>;
const priorSecret = process.env.BETTER_AUTH_SECRET;
beforeAll(async () => {
  process.env.BETTER_AUTH_SECRET ??=
    "printing-test-only-secret-longer-than-32-characters";
  c = await createDataModelTestContext();
  await c.db.insert(s.user).values([
    { id: "print-admin", name: "Admin", email: "print-admin@test.local" },
    { id: "print-staff", name: "Staff", email: "print-staff@test.local" },
  ]);
  await c.db.insert(s.operationalUsers).values([
    { userId: "print-admin", role: "admin" },
    { userId: "print-staff", role: "staff" },
  ]);
});
afterAll(async () => {
  await c?.close();
  if (priorSecret === undefined) delete process.env.BETTER_AUTH_SECRET;
});
async function fixture() {
  const [branch] = await c.db
    .insert(s.branches)
    .values({
      name: "Print branch",
      code: uid().toUpperCase(),
      timeZone: "America/Argentina/Buenos_Aires",
    })
    .returning();
  const actor: Actor = {
    id: "print-admin",
    role: "admin",
    branchId: branch.id,
  };
  const command = (command: unknown, requestId = uid()) =>
    runPrintingCommand(c.db, actor, requestId, command);
  await command({
    action: "configure",
    revision: 0,
    enabled: true,
    printerName: "Hasar USB",
  });
  const [sale] = await c.db
    .insert(s.sales)
    .values({
      branchId: branch.id,
      origin: "counter",
      channel: "counter",
      fulfillment: "takeaway",
      status: "closed",
      totalAmount: "0",
      paidAmount: "0",
      businessDate: "2026-11-02",
      actorId: actor.id,
    })
    .returning();
  const [order] = await c.db
    .insert(s.saleOrders)
    .values({
      branchId: branch.id,
      saleId: sale.id,
      sequence: 1,
      totalAmount: "0",
      actorId: actor.id,
    })
    .returning();
  const [product] = await c.db
    .insert(s.products)
    .values({ name: "Gaseosa" })
    .returning();
  await c.db.insert(s.saleLines).values({
    branchId: branch.id,
    orderId: order.id,
    productId: product.id,
    name: "Gaseosa",
    quantity: 1,
    position: 0,
    unitPrice: "0",
    lineTotal: "0",
  });
  const pair = async () => {
    const value = (await command({ action: "pairing" })) as { code: string };
    const paired = (await runConnectorCommand(c.db, "", {
      action: "pair",
      code: value.code,
      printerName: "Hasar USB",
    })) as { token: string };
    const instanceId = uid();
    const machine = (body: object) =>
      runConnectorCommand(c.db, paired.token, { ...body, instanceId });
    await machine({ action: "heartbeat", printerStatus: "ready" });
    return { machine, token: paired.token, instanceId, code: value.code };
  };
  return { actor, command, branch, order, sale, pair };
}
describe("durable scoped order printing", () => {
  it("holds an enqueue from an old configuration even if it commits after the replacement", async () => {
    const f = await fixture();
    await c.db.transaction((tx) => enqueueOrderPrints(tx, f.actor, f.order.id));
    await f.command({
      action: "configure",
      revision: 1,
      enabled: true,
      printerName: "Hasar USB",
    });
    // Reproduce an enqueue that observed revision 1 but became visible after the bulk hold.
    await c.db
      .update(s.printJobs)
      .set({
        state: "pending",
        settingsRevision: 1,
        createdAt: new Date(Date.now() + 1000),
      })
      .where(eq(s.printJobs.branchId, f.branch.id));
    const m = await f.pair();
    expect(await m.machine({ action: "claim" })).toEqual({ job: null });
    const [job] = (await getPrintingSnapshot(c.db, f.actor, f.sale.id)).jobs;
    expect(job.state).toBe("review");
    await f.command({ action: "retry", jobId: job.id });
    expect(
      ((await m.machine({ action: "claim" })) as { job: unknown }).job,
    ).toBeTruthy();
  });
  it("blocks a fresh copy if a discarded previous copy may still print in Windows", async () => {
    const f = await fixture();
    await c.db.transaction((tx) => enqueueOrderPrints(tx, f.actor, f.order.id));
    const m = await f.pair();
    const dispatch = async () => {
      const { job } = (await m.machine({ action: "claim" })) as {
        job: { id: string; leaseToken: string };
      };
      await m.machine({
        action: "begin",
        jobId: job.id,
        leaseToken: job.leaseToken,
      });
      await m.machine({
        action: "report",
        jobId: job.id,
        leaseToken: job.leaseToken,
        outcome: "sent",
        spoolJobId: 42,
      });
      return job;
    };
    const original = await dispatch();
    await m.machine({
      action: "reconcile",
      jobId: original.id,
      leaseToken: original.leaseToken,
      outcome: "removed",
    });
    await f.command({
      action: "reprint",
      jobId: original.id,
      reason: "Ticket perdido",
    });
    const copy = await dispatch();
    await m.machine({
      action: "reconcile",
      jobId: copy.id,
      leaseToken: copy.leaseToken,
      outcome: "present",
      spoolJobId: 42,
    });
    await f.command({ action: "resolve", jobId: copy.id, result: "discard" });
    await expect(
      f.command({
        action: "reprint",
        jobId: original.id,
        reason: "Otra copia",
      }),
    ).rejects.toBeDefined();
    const [first] = await c.db
      .select()
      .from(s.printJobs)
      .where(eq(s.printJobs.id, original.id));
    await c.db.insert(s.printJobs).values({
      branchId: f.branch.id,
      ticketId: first.ticketId,
      kind: "copy",
      copyNumber: 2,
      eventKey: `forced:${uid()}`,
      requestedBy: f.actor.id,
    });
    expect(await m.machine({ action: "claim" })).toEqual({ job: null });
    await expect(
      f.command({
        action: "resolve",
        jobId: copy.id,
        result: "discard",
        queueCleared: true,
      }),
    ).resolves.toHaveProperty("id", copy.id);
    expect(
      ((await m.machine({ action: "claim" })) as { job: unknown }).job,
    ).toBeTruthy();
  });
  it("prints every actual locator change including return to the original and repeated returns", async () => {
    const f = await fixture();
    let [locator] = await c.db
      .insert(s.locatorAssignments)
      .values({
        branchId: f.branch.id,
        orderId: f.order.id,
        number: 1,
        assignedBy: f.actor.id,
      })
      .returning();
    await c.db.transaction((tx) => enqueueOrderPrints(tx, f.actor, f.order.id));
    for (const number of [2, 1, null, 2, null]) {
      await c.db
        .update(s.locatorAssignments)
        .set({ returnedAt: new Date(), returnedBy: f.actor.id })
        .where(eq(s.locatorAssignments.id, locator.id));
      if (number !== null)
        [locator] = await c.db
          .insert(s.locatorAssignments)
          .values({
            branchId: f.branch.id,
            orderId: f.order.id,
            number,
            assignedBy: f.actor.id,
          })
          .returning();
      const requestId = uid();
      await c.db.transaction((tx) =>
        notifyLocatorChange(tx, f.actor, f.order.id, requestId),
      );
      await c.db.transaction((tx) =>
        notifyLocatorChange(tx, f.actor, f.order.id, requestId),
      );
    }
    const jobs = (
      await getPrintingSnapshot(c.db, f.actor, f.sale.id)
    ).jobs.filter((j) => j.kind === "change");
    expect(jobs).toHaveLength(5);
    expect(
      jobs.filter((j) =>
        j.document.lines.some((l) => l.text === "LOCALIZADOR DEVUELTO"),
      ),
    ).toHaveLength(2);
  });
  it("rejects cross-branch job IDs, expired pairing and replay after permissions are revoked", async () => {
    const a = await fixture(),
      b = await fixture();
    await c.db.transaction((tx) => enqueueOrderPrints(tx, a.actor, a.order.id));
    const original = (await getPrintingSnapshot(c.db, a.actor, a.sale.id))
      .jobs[0];
    await expect(
      b.command({ action: "retry", jobId: original.id }),
    ).rejects.toMatchObject({ status: 404 });
    const requestId = uid();
    const pair = (await a.command({ action: "pairing" }, requestId)) as {
      code: string;
      id: string;
    };
    await c.db
      .update(s.printingPairings)
      .set({ expiresAt: new Date(0) })
      .where(eq(s.printingPairings.id, pair.id));
    await expect(
      runConnectorCommand(c.db, "", {
        action: "pair",
        code: pair.code,
        printerName: "Hasar USB",
      }),
    ).rejects.toMatchObject({ status: 401 });
    await c.db
      .update(s.operationalUsers)
      .set({ disabled: true })
      .where(eq(s.operationalUsers.userId, a.actor.id));
    try {
      await expect(
        a.command({ action: "pairing" }, requestId),
      ).rejects.toMatchObject({ status: 403 });
    } finally {
      await c.db
        .update(s.operationalUsers)
        .set({ disabled: false })
        .where(eq(s.operationalUsers.userId, a.actor.id));
    }
  });
  it("makes a discarded active ticket a historical copy rather than a new preparation order", async () => {
    const f = await fixture();
    await c.db.transaction((tx) => enqueueOrderPrints(tx, f.actor, f.order.id));
    const original = (await getPrintingSnapshot(c.db, f.actor, f.sale.id))
      .jobs[0];
    await c.db
      .update(s.printJobs)
      .set({ state: "review", spoolState: "removed" })
      .where(eq(s.printJobs.id, original.id));
    await f.command({
      action: "resolve",
      jobId: original.id,
      result: "discard",
    });
    await f.command({
      action: "reprint",
      jobId: original.id,
      reason: "Consulta histórica",
    });
    const historical = (
      await getPrintingSnapshot(c.db, f.actor, f.sale.id)
    ).jobs.find((j) => j.kind === "historical")!;
    expect(historical).toBeDefined();
    await c.db
      .update(s.printJobs)
      .set({ state: "sent", spoolState: "removed" })
      .where(eq(s.printJobs.id, historical.id));
    await c.db
      .insert(s.branchMemberships)
      .values({ branchId: f.branch.id, userId: "print-staff", role: "staff" });
    const staff = {
      id: "print-staff",
      role: "staff" as const,
      branchId: f.branch.id,
    };
    await expect(
      runPrintingCommand(c.db, staff, uid(), {
        action: "reprint",
        jobId: historical.id,
        reason: "Copia",
      }),
    ).rejects.toMatchObject({ status: 403 });
    await f.command({
      action: "reprint",
      jobId: historical.id,
      reason: "Otra consulta histórica",
    });
    expect(
      (await getPrintingSnapshot(c.db, f.actor, f.sale.id)).jobs.filter(
        (j) => j.kind === "historical",
      ),
    ).toHaveLength(2);
  });
  it("holds existing queued jobs when changing the printer", async () => {
    const f = await fixture();
    await c.db.transaction((tx) => enqueueOrderPrints(tx, f.actor, f.order.id));
    await f.command({
      action: "configure",
      revision: 1,
      enabled: true,
      printerName: "Replacement USB",
    });
    expect(
      (await getPrintingSnapshot(c.db, f.actor, f.sale.id)).jobs[0].state,
    ).toBe("review");
  });
  it("acknowledges a late journal after manual verification without undoing that decision", async () => {
    const f = await fixture();
    await c.db.transaction((tx) => enqueueOrderPrints(tx, f.actor, f.order.id));
    const m = await f.pair();
    const { job } = (await m.machine({ action: "claim" })) as {
      job: { id: string; leaseToken: string };
    };
    const refs = { jobId: job.id, leaseToken: job.leaseToken };
    await m.machine({ action: "begin", ...refs });
    await c.db
      .update(s.printJobs)
      .set({ leaseExpiresAt: new Date(0) })
      .where(eq(s.printJobs.id, job.id));
    await m.machine({ action: "claim" });
    await f.command({ action: "resolve", jobId: job.id, result: "printed" });
    await expect(
      m.machine({ action: "report", ...refs, outcome: "uncertain" }),
    ).resolves.toEqual({ ok: true });
    expect(
      (await getPrintingSnapshot(c.db, f.actor, f.sale.id)).jobs[0],
    ).toMatchObject({ state: "sent", spoolState: "removed" });
  });
  it("does not hold an unrouted bottle just because another station started cooking", async () => {
    const f = await fixture();
    const [product] = await c.db
      .insert(s.products)
      .values({ name: "Waffle" })
      .returning();
    const [line] = await c.db
      .insert(s.saleLines)
      .values({
        branchId: f.branch.id,
        orderId: f.order.id,
        productId: product.id,
        name: "Waffle",
        quantity: 1,
        position: 1,
        unitPrice: "0",
        lineTotal: "0",
      })
      .returning();
    const [location] = await c.db
      .insert(s.locations)
      .values({ branchId: f.branch.id, code: "K", name: "Cocina" })
      .returning();
    const [station] = await c.db
      .insert(s.preparationStations)
      .values({
        branchId: f.branch.id,
        name: "Cocina",
        consumptionLocationId: location.id,
      })
      .returning();
    const [task] = await c.db
      .insert(s.preparationTasks)
      .values({
        branchId: f.branch.id,
        orderId: f.order.id,
        stationId: station.id,
        stationName: "Cocina",
        status: "preparing",
        startedAt: new Date(),
        assigneeId: f.actor.id,
      })
      .returning();
    await c.db
      .insert(s.preparationTaskLines)
      .values({ taskId: task.id, lineId: line.id });
    await c.db.transaction((tx) => enqueueOrderPrints(tx, f.actor, f.order.id));
    const m = await f.pair();
    const first = (await m.machine({ action: "claim" })) as {
      job: { document: { lines: { text: string }[] } } | null;
    };
    expect(
      first.job?.document.lines.some((l) => l.text.includes("Gaseosa")),
    ).toBe(true);
  });
  it("allows an explicitly historical copy of a cancelled unsent original only for management", async () => {
    const f = await fixture();
    await c.db.transaction((tx) => enqueueOrderPrints(tx, f.actor, f.order.id));
    await c.db
      .update(s.sales)
      .set({ status: "cancelled", cancelledAt: new Date() })
      .where(eq(s.sales.id, f.sale.id));
    await c.db.transaction((tx) => cancelOrderPrints(tx, f.actor, f.sale.id));
    const original = (await getPrintingSnapshot(c.db, f.actor, f.sale.id))
      .jobs[0];
    await f.command({
      action: "reprint",
      jobId: original.id,
      reason: "Consulta histórica",
    });
    expect(
      (await getPrintingSnapshot(c.db, f.actor, f.sale.id)).jobs
        .find((j) => j.kind === "historical")
        ?.document.lines.map((l) => l.text),
    ).toContain("HISTÓRICO · NO PREPARAR");
  });
  it("returns the same pairing code after lost response while storing only its hash", async () => {
    const f = await fixture(),
      requestId = uid();
    const a = (await f.command({ action: "pairing" }, requestId)) as {
      code: string;
    };
    const b = (await f.command({ action: "pairing" }, requestId)) as {
      code: string;
    };
    expect(a.code).toBe(b.code);
    const [stored] = await c.db
      .select()
      .from(s.printingRequests)
      .where(eq(s.printingRequests.requestId, requestId));
    expect(JSON.stringify(stored.result)).not.toContain(a.code);
  });
  it("keeps disabled defaults and permissions; no original twice", async () => {
    const f = await fixture();
    await c.db.transaction((tx) => enqueueOrderPrints(tx, f.actor, f.order.id));
    await c.db.transaction((tx) => enqueueOrderPrints(tx, f.actor, f.order.id));
    const state = await getPrintingSnapshot(c.db, f.actor, f.sale.id);
    expect(state.jobs).toHaveLength(1);
    expect(state.jobs[0].stationName).toBe("REVISAR ESTACIÓN");
    expect(state.jobs[0].requestedBy).toBe("Admin");
    expect(
      state.jobs[0].document.lines.some((l) => l.text.includes("Gaseosa")),
    ).toBe(true);
    await expect(
      runPrintingCommand(
        c.db,
        { id: "print-staff", role: "staff", branchId: f.branch.id },
        uid(),
        {
          action: "configure",
          revision: 1,
          printerName: "Other",
          enabled: true,
        },
      ),
    ).rejects.toBeDefined();
  });
  it("rolls back the outbox with the order transaction", async () => {
    const f = await fixture();
    await expect(
      c.db.transaction(async (tx) => {
        await enqueueOrderPrints(tx, f.actor, f.order.id);
        throw new Error("rollback");
      }),
    ).rejects.toThrow("rollback");
    expect(
      (await getPrintingSnapshot(c.db, f.actor, f.sale.id)).jobs,
    ).toHaveLength(0);
  });
  it("claims once, begins before dispatch, replays ACK and requires empty Windows queue for copy", async () => {
    const f = await fixture();
    await c.db.transaction((tx) => enqueueOrderPrints(tx, f.actor, f.order.id));
    const m = await f.pair();
    const first = (await m.machine({ action: "claim" })) as {
      job: { id: string; leaseToken: string };
    };
    expect(first.job).toBeTruthy();
    expect(
      ((await m.machine({ action: "claim" })) as { job: unknown }).job,
    ).toBeNull();
    const fields = { jobId: first.job.id, leaseToken: first.job.leaseToken };
    expect(await m.machine({ ...fields, action: "begin" })).toEqual({
      dispatch: true,
    });
    await m.machine({
      ...fields,
      action: "report",
      outcome: "sent",
      spoolJobId: 42,
    });
    await m.machine({
      ...fields,
      action: "report",
      outcome: "sent",
      spoolJobId: 42,
    });
    await expect(
      f.command({
        action: "reprint",
        jobId: first.job.id,
        reason: "Ticket perdido",
      }),
    ).rejects.toBeDefined();
    await m.machine({
      ...fields,
      action: "reconcile",
      outcome: "removed",
      spoolJobId: 42,
    });
    const requestId = uid();
    await f.command(
      { action: "reprint", jobId: first.job.id, reason: "Ticket perdido" },
      requestId,
    );
    await f.command(
      { action: "reprint", jobId: first.job.id, reason: "Ticket perdido" },
      requestId,
    );
    const state = await getPrintingSnapshot(c.db, f.actor, f.sale.id);
    expect(state.jobs.filter((j) => j.kind === "copy")).toHaveLength(1);
    expect(state.jobs.find((j) => j.kind === "copy")?.copyNumber).toBe(1);
  });
  it("never reclaims a sending job on lease expiry and freezes uncertain reports", async () => {
    const f = await fixture();
    await c.db.transaction((tx) => enqueueOrderPrints(tx, f.actor, f.order.id));
    const m = await f.pair();
    const { job } = (await m.machine({ action: "claim" })) as {
      job: { id: string; leaseToken: string };
    };
    await m.machine({
      action: "begin",
      jobId: job.id,
      leaseToken: job.leaseToken,
    });
    await c.db
      .update(s.printJobs)
      .set({ leaseExpiresAt: new Date(0) })
      .where(eq(s.printJobs.id, job.id));
    expect(
      ((await m.machine({ action: "claim" })) as { job: unknown }).job,
    ).toBeNull();
    await m.machine({
      action: "report",
      jobId: job.id,
      leaseToken: job.leaseToken,
      outcome: "uncertain",
    });
    expect(
      (await getPrintingSnapshot(c.db, f.actor, f.sale.id)).jobs[0].state,
    ).toBe("uncertain");
  });
  it("rejects another machine instance and revokes a bearer immediately", async () => {
    const f = await fixture(),
      m = await f.pair();
    await expect(
      runConnectorCommand(c.db, m.token, {
        action: "heartbeat",
        instanceId: uid(),
        printerStatus: "ready",
      }),
    ).rejects.toBeDefined();
    await expect(
      runConnectorCommand(c.db, "", {
        action: "pair",
        code: m.code,
        printerName: "Hasar USB",
      }),
    ).rejects.toBeDefined();
    const state = await getPrintingSnapshot(c.db, f.actor);
    await f.command({ action: "revoke", connectorId: state.connector!.id });
    await expect(m.machine({ action: "claim" })).rejects.toBeDefined();
  });
  it("holds old jobs and cancels pending originals rather than dispatching them", async () => {
    const f = await fixture();
    await c.db.transaction((tx) => enqueueOrderPrints(tx, f.actor, f.order.id));
    const state = await getPrintingSnapshot(c.db, f.actor, f.sale.id);
    await c.db
      .update(s.printJobs)
      .set({ createdAt: new Date(Date.now() - 61000) })
      .where(eq(s.printJobs.id, state.jobs[0].id));
    const m = await f.pair();
    expect(
      ((await m.machine({ action: "claim" })) as { job: unknown }).job,
    ).toBeNull();
    expect(
      (await getPrintingSnapshot(c.db, f.actor, f.sale.id)).jobs[0].state,
    ).toBe("review");
    await c.db.transaction((tx) => cancelOrderPrints(tx, f.actor, f.sale.id));
    expect(
      (await getPrintingSnapshot(c.db, f.actor, f.sale.id)).jobs[0].state,
    ).toBe("cancelled");
  });
});
