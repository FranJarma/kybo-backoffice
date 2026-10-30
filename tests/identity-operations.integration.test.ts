import { beforeAll, afterAll, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import {
  createAttendanceContext,
  testIdentityConfig as config,
} from "./helpers/attendance";
import { testAuthenticator } from "./helpers/test-authenticator";
import * as s from "@/db/schema";
import {
  beginVerification,
  finishVerification,
} from "@/modules/identity/service";
import { executeCommand } from "@/modules/operations/command";
import { runCashCommand } from "@/modules/cash/service";
import { runTaskCommand } from "@/modules/daily-operations/commands";
import { createRecipeService } from "@/modules/recipes/service";
import { planProduction, startProduction } from "@/modules/production/planning";
let c: Awaited<ReturnType<typeof createAttendanceContext>>;
const key = testAuthenticator();
beforeAll(async () => {
  c = await createAttendanceContext();
  await c.db.insert(s.identityCredentials).values({
    id: key.id,
    userId: c.actors.admin.id,
    rpId: config.rpId,
    publicKey: key.publicKey,
    counter: 0,
    name: "Test phone",
    transports: ["internal"],
    deviceType: "singleDevice",
    backedUp: false,
  });
}, 60000);
afterAll(() => c?.close());
async function proof(
  action: "cash-close" | "production-start",
  requestId: string,
  payload: unknown,
) {
  const start = await beginVerification(
    c.db,
    c.actors.admin,
    { action, branchId: c.branchId, requestId, payload },
    config,
  );
  return (
    await finishVerification(
      c.db,
      c.actors.admin,
      {
        challengeId: start.challengeId,
        response: key.assertion(start.options.challenge),
      },
      config,
    )
  ).proofId;
}
it("requires a bound confirmation for production start, consumes once, and rejects changed intent and a revoked key", async () => {
  const requestId = crypto.randomUUID(),
    payload = {
      id: crypto.randomUUID(),
      requestId,
      start: { expectedRevision: 1 },
    };
  const run = (verificationId?: string, value = payload) =>
    executeCommand(
      c.db,
      c.actors.admin,
      c.branchId,
      { requestId, verificationId },
      "production-start",
      value,
      async () => ({ id: value.id }),
    );
  await expect(run()).rejects.toThrow(/Face ID/);
  const verificationId = await proof("production-start", requestId, payload);
  await expect(
    run(verificationId, { ...payload, start: { expectedRevision: 2 } }),
  ).rejects.toThrow();
  expect(await run(verificationId)).toMatchObject({ replayed: false });
  expect(await run(verificationId)).toMatchObject({ replayed: true });
  const nextId = crypto.randomUUID(),
    nextPayload = { ...payload, requestId: nextId };
  const nextProof = await proof("production-start", nextId, nextPayload);
  await c.db
    .update(s.identityCredentials)
    .set({ revokedAt: new Date() })
    .where(eq(s.identityCredentials.id, key.id));
  await expect(
    executeCommand(
      c.db,
      c.actors.admin,
      c.branchId,
      { requestId: nextId, verificationId: nextProof },
      "production-start",
      nextPayload,
      async () => ({}),
    ),
  ).rejects.toThrow();
  await c.db
    .update(s.identityCredentials)
    .set({ revokedAt: null })
    .where(eq(s.identityCredentials.id, key.id));
});
it("closes a real cash session only with a confirmation for that exact close, and safely replays it", async () => {
  const opened = await runCashCommand(
    c.db,
    c.actors.admin,
    crypto.randomUUID(),
    { action: "open", amount: "5000" },
  );
  const requestId = crypto.randomUUID(),
    command = {
      action: "close" as const,
      sessionId: opened.current!.id,
      expectedRevision: opened.current!.revision,
      counted: "5000.00",
      withdrawal: "0.00",
      reason: "",
      posnet: { mode: "none" as const, lots: [] },
    };
  await expect(
    runCashCommand(c.db, c.actors.admin, requestId, command),
  ).rejects.toThrow(/Face ID/);
  const verificationId = await proof("cash-close", requestId, command);
  const closed = await runCashCommand(
    c.db,
    c.actors.admin,
    requestId,
    command,
    new Date(),
    verificationId,
  );
  expect(closed.current).toBeNull();
  expect(
    (
      await runCashCommand(
        c.db,
        c.actors.admin,
        requestId,
        command,
        new Date(),
        verificationId,
      )
    ).current,
  ).toBeNull();
  const [stored] = await c.db
    .select()
    .from(s.identityConfirmations)
    .where(eq(s.identityConfirmations.id, verificationId));
  expect(stored.consumedAt).not.toBeNull();
});
it("keeps verification disabled when the branch has not explicitly activated it", async () => {
  await c.db
    .update(s.attendanceSettings)
    .set({ requireStepUp: false })
    .where(eq(s.attendanceSettings.branchId, c.branchId));
  expect(
    await executeCommand(
      c.db,
      c.actors.admin,
      c.branchId,
      { requestId: crypto.randomUUID() },
      "production-start",
      { id: crypto.randomUUID() },
      async () => ({ ok: true }),
    ),
  ).toMatchObject({ result: { ok: true } });
});
it("verifies real production starts from daily tasks and the production order", async () => {
  await c.db
    .update(s.attendanceSettings)
    .set({ requireStepUp: true })
    .where(eq(s.attendanceSettings.branchId, c.branchId));
  const [water, output] = await c.db
    .insert(s.items)
    .values([
      {
        code: "IDENTITY-WATER",
        name: "Agua",
        class: "beverage",
        baseUnit: "ml",
        recipeUsable: true,
        stockTracked: false,
        unitCost: "0",
        purchasable: false,
      },
      {
        code: "IDENTITY-OUTPUT",
        name: "Preparado",
        class: "beverage",
        baseUnit: "ml",
        recipeUsable: true,
        purchasable: false,
      },
    ])
    .returning();
  const recipe = await createRecipeService(c.db).save(c.actors.admin, {
    requestId: crypto.randomUUID(),
    kind: "preparation",
    targetId: output.id,
    yieldQuantity: "1000",
    lines: [{ options: [{ itemId: water.id, quantity: "1000" }] }],
  });
  async function order() {
    const input = {
      recipeVersionId: recipe.versionId,
      locationId: c.mapping.initialLocation.id,
      plannedQuantity: "1000.000000",
      selections: recipe.lines.map((l) => ({
        lineId: l.id,
        optionId: l.options[0].id,
      })),
    };
    const assignment = {
      assignedTo: c.actors.manager.id,
      scheduledFor: new Date().toISOString(),
      notes: "",
    };
    return (
      await executeCommand(
        c.db,
        c.actors.admin,
        c.branchId,
        { requestId: crypto.randomUUID() },
        "production-plan",
        { input, assignment },
        (tx, ctx, id) => planProduction(tx, ctx, id, input, assignment),
      )
    ).result;
  }
  const production = await order();
  const [task] = await c.db
    .insert(s.dailyOperationTasks)
    .values({
      branchId: c.branchId,
      kind: "production",
      title: "Preparar",
      documentId: production.id,
      documentRevision: production.revision,
      assignedTo: c.actors.manager.id,
      locationId: c.mapping.initialLocation.id,
    })
    .returning();
  const input = {
    requestId: crypto.randomUUID(),
    action: "start",
    expectedRevision: task.revision,
  };
  await expect(
    runTaskCommand(c.db, c.actors.admin, task.id, input),
  ).rejects.toThrow(/Face ID/);
  const verificationId = await proof("production-start", input.requestId, {
    taskId: task.id,
    ...input,
  });
  await runTaskCommand(c.db, c.actors.admin, task.id, {
    ...input,
    verificationId,
  });
  await runTaskCommand(c.db, c.actors.admin, task.id, {
    ...input,
    verificationId,
  });
  expect(
    (
      await c.db
        .select()
        .from(s.productionOrders)
        .where(eq(s.productionOrders.id, production.id))
    )[0],
  ).toMatchObject({ state: "confirmed", revision: 2 });
  const direct = await order(),
    requestId = crypto.randomUUID();
  const payload = {
    id: direct.id,
    requestId,
    start: { expectedRevision: direct.revision },
  };
  const directProof = await proof("production-start", requestId, payload);
  await executeCommand(
    c.db,
    c.actors.admin,
    c.branchId,
    { requestId, verificationId: directProof },
    "production-start",
    payload,
    (tx, ctx, id) => startProduction(tx, ctx, id, direct.id, payload.start),
  );
  expect(
    (
      await c.db
        .select()
        .from(s.productionOrders)
        .where(eq(s.productionOrders.id, direct.id))
    )[0].state,
  ).toBe("confirmed");
});
