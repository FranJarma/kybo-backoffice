import { afterAll, beforeAll, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import {
  createAttendanceContext,
  attendanceNow as now,
  testPassword,
  testIdentityConfig as config,
} from "./helpers/attendance";
import { testAuthenticator } from "./helpers/test-authenticator";
import * as s from "@/db/schema";
import {
  beginRegistration,
  finishRegistration,
  beginVerification,
  finishVerification,
  consumeConfirmation,
  revokeCredential,
  listCredentials,
} from "@/modules/identity/service";
let c: Awaited<ReturnType<typeof createAttendanceContext>>;
const authenticator = testAuthenticator();
beforeAll(async () => {
  c = await createAttendanceContext();
}, 60000);
afterAll(() => c?.close());
const binding = () => ({
  action: "attendance-punch" as const,
  branchId: c.branchId,
  requestId: crypto.randomUUID(),
  payload: { action: "punch", kind: "entry", assignmentId: null },
});
it("registers a genuine UV attestation only after password reauthentication", async () => {
  const result = await beginRegistration(
    c.db,
    c.actors.staff,
    { password: testPassword, name: "Celular personal" },
    config,
    now,
  );
  expect(result.options.authenticatorSelection?.userVerification).toBe(
    "required",
  );
  await expect(
    finishRegistration(
      c.db,
      c.actors.staff,
      {
        challengeId: result.challengeId,
        response: authenticator.registration(result.options.challenge, false),
      },
      config,
      now,
    ),
  ).rejects.toThrow();
  await finishRegistration(
    c.db,
    c.actors.staff,
    {
      challengeId: result.challengeId,
      response: authenticator.registration(result.options.challenge),
    },
    config,
    now,
  );
  const credentials = await listCredentials(c.db, c.actors.staff, config);
  expect(
    await listCredentials(c.db, c.actors.admin, config, c.actors.staff.id),
  ).toEqual(credentials);
  await expect(
    listCredentials(c.db, c.actors.manager, config, c.actors.staff.id),
  ).rejects.toThrow();
  expect(credentials[0]).toMatchObject({
    id: authenticator.id,
    name: "Celular personal",
  });
  expect(JSON.stringify(credentials)).not.toMatch(
    /publicKey|private|counter|password/,
  );
  await expect(
    finishRegistration(
      c.db,
      c.actors.staff,
      {
        challengeId: result.challengeId,
        response: authenticator.registration(result.options.challenge),
      },
      config,
      now,
    ),
  ).rejects.toThrow();
});
it("validates a real signature and consumes an operation-bound proof in the business transaction", async () => {
  const intent = binding(),
    start = await beginVerification(c.db, c.actors.staff, intent, config, now);
  const proof = await finishVerification(
    c.db,
    c.actors.staff,
    {
      challengeId: start.challengeId,
      response: authenticator.assertion(start.options.challenge),
    },
    config,
    now,
  );
  await expect(
    c.db.transaction((tx) =>
      consumeConfirmation(
        tx,
        c.actors.staff,
        { ...intent, payload: { action: "punch", kind: "exit" } },
        proof.proofId,
        now,
      ),
    ),
  ).rejects.toThrow();
  await expect(
    c.db.transaction((tx) =>
      consumeConfirmation(tx, c.actors.manager, intent, proof.proofId, now),
    ),
  ).rejects.toThrow();
  expect(
    await c.db.transaction((tx) =>
      consumeConfirmation(tx, c.actors.staff, intent, proof.proofId, now),
    ),
  ).toMatchObject({ credentialId: authenticator.id });
  await expect(
    c.db.transaction((tx) =>
      consumeConfirmation(tx, c.actors.staff, intent, proof.proofId, now),
    ),
  ).rejects.toThrow();
  await expect(
    finishVerification(
      c.db,
      c.actors.staff,
      {
        challengeId: start.challengeId,
        response: authenticator.assertion(start.options.challenge),
      },
      config,
      now,
    ),
  ).rejects.toThrow();
});
it("rejects UV missing, wrong origin, an expired challenge and an expired proof", async () => {
  const intent = binding(),
    start = await beginVerification(c.db, c.actors.staff, intent, config, now);
  await expect(
    finishVerification(
      c.db,
      c.actors.staff,
      {
        challengeId: start.challengeId,
        response: authenticator.assertion(start.options.challenge, false),
      },
      config,
      now,
    ),
  ).rejects.toThrow();
  const response = authenticator.assertion(start.options.challenge);
  await expect(
    finishVerification(
      c.db,
      c.actors.staff,
      { challengeId: start.challengeId, response },
      { ...config, origin: "https://wrong.example" },
      now,
    ),
  ).rejects.toThrow();
  await expect(
    finishVerification(
      c.db,
      c.actors.staff,
      { challengeId: start.challengeId, response },
      config,
      new Date(now.getTime() + 301000),
    ),
  ).rejects.toThrow();
  const proof = await finishVerification(
    c.db,
    c.actors.staff,
    {
      challengeId: start.challengeId,
      response: authenticator.assertion(start.options.challenge),
    },
    config,
    now,
  );
  await expect(
    c.db.transaction((tx) =>
      consumeConfirmation(
        tx,
        c.actors.staff,
        intent,
        proof.proofId,
        new Date(now.getTime() + 121000),
      ),
    ),
  ).rejects.toThrow();
});
it("rechecks revocations at proof consumption and does not reveal another employee credentials", async () => {
  const intent = binding(),
    start = await beginVerification(c.db, c.actors.staff, intent, config, now);
  const proof = await finishVerification(
    c.db,
    c.actors.staff,
    {
      challengeId: start.challengeId,
      response: authenticator.assertion(start.options.challenge),
    },
    config,
    now,
  );
  expect(await listCredentials(c.db, c.actors.manager, config)).toEqual([]);
  await expect(
    revokeCredential(c.db, c.actors.manager, authenticator.id, now),
  ).rejects.toThrow();
  await revokeCredential(c.db, c.actors.admin, authenticator.id, now);
  await expect(
    c.db.transaction((tx) =>
      consumeConfirmation(tx, c.actors.staff, intent, proof.proofId, now),
    ),
  ).rejects.toThrow();
});
it("persists password failure throttling instead of rolling it back on an error", async () => {
  for (let i = 0; i < 5; i++)
    await expect(
      beginRegistration(
        c.db,
        c.actors.manager,
        { password: "incorrect", name: "Phone" },
        config,
        now,
      ),
    ).rejects.toThrow();
  await expect(
    beginRegistration(
      c.db,
      c.actors.manager,
      { password: testPassword, name: "Phone" },
      config,
      now,
    ),
  ).rejects.toThrow();
  const [limit] = await c.db
    .select()
    .from(s.identityEnrollmentLimits)
    .where(eq(s.identityEnrollmentLimits.userId, c.actors.manager.id));
  expect(limit.failures).toBe(5);
  expect(limit.blockedUntil!.getTime()).toBeGreaterThan(now.getTime());
});
