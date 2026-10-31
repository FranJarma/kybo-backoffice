import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { and, eq, sql } from "drizzle-orm";
import { verifyPassword } from "better-auth/crypto";
import { account, session, userPasswordPolicies } from "@/db/schema";
import { createAttendanceContext, testPassword } from "./helpers/attendance";
import {
  issueTemporaryPassword,
  beginTemporaryPasswordLogin,
  passwordPolicyState,
  requirePasswordAccess,
  changeOwnPassword,
} from "@/modules/password-policy/service";
import {
  requireOperationalContext,
  requireAdministrator,
  requireCatalogRead,
  requireCatalogManagement,
} from "@/modules/branches/context";
import { requireUserAdministrator } from "@/modules/users/service";
import {
  createStoreAccount,
  authorizeManagement,
  getManagementSnapshot,
} from "@/modules/workplace/service";

const now = new Date("2026-10-29T16:00:00.000Z");
const later = (ms: number) => new Date(+now + ms);
let c: Awaited<ReturnType<typeof createAttendanceContext>>;
let originalHash: string;
beforeAll(async () => {
  vi.stubEnv(
    "BETTER_AUTH_SECRET",
    "password-policy-test-only-secret-at-least-32-characters",
  );
  c = await createAttendanceContext(undefined, {
    attendanceAccess: true,
    passwordPolicy: true,
  });
  originalHash = (
    await c.db
      .select()
      .from(account)
      .where(eq(account.userId, c.actors.staff.id))
  )[0].password!;
}, 60000);
afterAll(async () => {
  await c?.close();
  vi.unstubAllEnvs();
});
beforeEach(async () => {
  await c.db.delete(userPasswordPolicies);
  await c.db
    .update(account)
    .set({ password: originalHash, updatedAt: now })
    .where(eq(account.userId, c.actors.staff.id));
  await c.db
    .insert(session)
    .values({
      id: c.actors.staff.sessionId!,
      userId: c.actors.staff.id,
      token: crypto.randomUUID(),
      expiresAt: later(365 * 86400000),
    })
    .onConflictDoNothing();
});
const issue = () =>
  c.db.transaction((tx) =>
    issueTemporaryPassword(tx, c.actors.staff.id, c.actors.admin.id, now),
  );
const login = (at = now) =>
  c.db.transaction((tx) =>
    beginTemporaryPasswordLogin(tx, c.actors.staff.id, at),
  );

it("starts the exact 24-hour clock only on first login and cannot extend it by logging in again", async () => {
  await issue();
  expect(
    await passwordPolicyState(c.db, c.actors.staff.id, later(365 * 86400000)),
  ).toMatchObject({
    required: true,
    firstLoginAt: null,
    expiresAt: null,
    blocked: false,
  });
  expect(await login()).toMatchObject({
    required: true,
    firstLoginAt: "2026-10-29T16:00:00.000Z",
    expiresAt: "2026-10-30T16:00:00.000Z",
    blocked: false,
  });
  expect(await login(later(3600000))).toMatchObject({
    firstLoginAt: "2026-10-29T16:00:00.000Z",
    expiresAt: "2026-10-30T16:00:00.000Z",
  });
  await expect(
    requirePasswordAccess(c.db, c.actors.staff.id, later(86400000 - 1)),
  ).resolves.toBeUndefined();
  await expect(
    requirePasswordAccess(c.db, c.actors.staff.id, later(86400000)),
  ).rejects.toMatchObject({ code: "TEMPORARY_PASSWORD_EXPIRED", status: 403 });
  await expect(login(later(86400000))).rejects.toMatchObject({
    code: "TEMPORARY_PASSWORD_EXPIRED",
  });
});

it("changes only the caller password, clears the obligation and revokes other sessions", async () => {
  await issue();
  await login();
  await c.db.insert(session).values({
    id: "old-password-session",
    userId: c.actors.staff.id,
    token: crypto.randomUUID(),
    expiresAt: later(86400000),
  });
  await changeOwnPassword(
    c.db,
    c.actors.staff,
    { currentPassword: testPassword, newPassword: "Different-TestOnly-456!" },
    later(1000),
  );
  const row = (
    await c.db
      .select()
      .from(account)
      .where(eq(account.userId, c.actors.staff.id))
  )[0];
  expect(
    await verifyPassword({
      hash: row.password!,
      password: "Different-TestOnly-456!",
    }),
  ).toBe(true);
  expect(
    await verifyPassword({ hash: row.password!, password: testPassword }),
  ).toBe(false);
  expect(
    await passwordPolicyState(c.db, c.actors.staff.id, later(90000000)),
  ).toMatchObject({ required: false, blocked: false });
  const sessions = await c.db
    .select()
    .from(session)
    .where(eq(session.userId, c.actors.staff.id));
  expect(sessions.map((s) => s.id)).toEqual([c.actors.staff.sessionId]);
  const audit = await c.db.execute(
    sql`select after from audit_events where entity='password-change' and actor_id=${c.actors.staff.id}`,
  );
  expect(audit.rows.length).toBeGreaterThan(0);
  const text = JSON.stringify(audit.rows);
  expect(text).not.toContain(testPassword);
  expect(text).not.toContain("Different-TestOnly-456!");
});

it("keeps the failure throttle after rejected changes and permits recovery when its cooldown ends", async () => {
  await issue();
  await login();
  for (let attempt = 0; attempt < 5; attempt++)
    await expect(
      changeOwnPassword(
        c.db,
        c.actors.staff,
        {
          currentPassword: "Wrong-TestOnly-123!",
          newPassword: "Different-TestOnly-456!",
        },
        now,
      ),
    ).rejects.toMatchObject({ code: "PASSWORD_INVALID" });
  await expect(
    changeOwnPassword(
      c.db,
      c.actors.staff,
      { currentPassword: testPassword, newPassword: "Different-TestOnly-456!" },
      now,
    ),
  ).rejects.toMatchObject({ status: 429 });
  await expect(
    changeOwnPassword(
      c.db,
      c.actors.staff,
      { currentPassword: testPassword, newPassword: "Different-TestOnly-456!" },
      later(900001),
    ),
  ).resolves.toBeUndefined();
});

it("rejects a reused password, a missing session and a change after the deadline", async () => {
  await issue();
  await login();
  await expect(
    changeOwnPassword(
      c.db,
      c.actors.staff,
      { currentPassword: testPassword, newPassword: testPassword },
      now,
    ),
  ).rejects.toMatchObject({ code: "PASSWORD_REUSED" });
  await expect(
    changeOwnPassword(
      c.db,
      { ...c.actors.staff, sessionId: undefined },
      { currentPassword: testPassword, newPassword: "Different-TestOnly-456!" },
      now,
    ),
  ).rejects.toMatchObject({ status: 401 });
  await expect(
    changeOwnPassword(
      c.db,
      c.actors.staff,
      { currentPassword: testPassword, newPassword: "Different-TestOnly-456!" },
      later(86400000),
    ),
  ).rejects.toMatchObject({ code: "TEMPORARY_PASSWORD_EXPIRED" });
  const row = (
    await c.db
      .select()
      .from(account)
      .where(
        and(
          eq(account.userId, c.actors.staff.id),
          eq(account.providerId, "credential"),
        ),
      )
  )[0];
  expect(row.password).toBe(originalHash);
});

it("renews an expired temporary policy only on explicit admin issuance and leaves permanent accounts unrestricted", async () => {
  await issue();
  await login();
  await c.db.transaction((tx) =>
    issueTemporaryPassword(
      tx,
      c.actors.staff.id,
      c.actors.admin.id,
      later(90000000),
    ),
  );
  expect(
    await passwordPolicyState(c.db, c.actors.staff.id, later(90000000)),
  ).toMatchObject({
    required: true,
    firstLoginAt: null,
    expiresAt: null,
    blocked: false,
  });
  expect(
    await passwordPolicyState(c.db, c.actors.admin.id, later(365 * 86400000)),
  ).toMatchObject({ required: false, blocked: false });
});

it("rejects expired credentials at all live domain authorization gates even with a previously valid Actor", async () => {
  const past = new Date(Date.now() - 90000000);
  await c.db.transaction(async (tx) => {
    await issueTemporaryPassword(
      tx,
      c.actors.admin.id,
      c.actors.otherAdmin.id,
      past,
    );
    await beginTemporaryPasswordLogin(tx, c.actors.admin.id, past);
  });
  for (const action of [
    () => requireOperationalContext(c.db, c.actors.admin, c.branchId),
    () => requireAdministrator(c.db, c.actors.admin),
    () => requireUserAdministrator(c.db, c.actors.admin),
    () => requireCatalogRead(c.db, c.actors.admin),
    () => requireCatalogManagement(c.db, c.actors.admin),
  ])
    await expect(action()).rejects.toMatchObject({
      code: "TEMPORARY_PASSWORD_EXPIRED",
    });
});

it("rejects an already issued manager grant after the manager temporary password expires", async () => {
  const current = new Date();
  const store = await createStoreAccount(c.db, c.actors.admin, {
    requestId: crypto.randomUUID(),
    branchId: c.branchId,
    name: "Local de prueba",
    username: "policy.store",
    password: "Store-TestOnly-123!",
  });
  const storeActor = {
    id: store.id,
    role: "staff" as const,
    branchId: c.branchId,
    accountKind: "store" as const,
    sessionId: crypto.randomUUID(),
  };
  await c.db.insert(session).values({
    id: storeActor.sessionId,
    userId: store.id,
    token: crypto.randomUUID(),
    expiresAt: new Date(+current + 86400000),
  });
  const grant = await authorizeManagement(
    c.db,
    storeActor,
    { identifier: "att-manager@test.local", password: testPassword },
    current,
  );
  const past = new Date(+current - 90000000);
  await c.db.transaction(async (tx) => {
    await issueTemporaryPassword(
      tx,
      c.actors.manager.id,
      c.actors.admin.id,
      past,
    );
    await beginTemporaryPasswordLogin(tx, c.actors.manager.id, past);
  });
  await expect(
    getManagementSnapshot(c.db, storeActor, grant.token, "2026-10-29", current),
  ).rejects.toMatchObject({ code: "TEMPORARY_PASSWORD_EXPIRED" });
});

it("does not turn a shared store credential into a personal temporary password through a stale Actor", async () => {
  const store = await createStoreAccount(c.db, c.actors.admin, {
    requestId: crypto.randomUUID(),
    branchId: c.branchId,
    name: "Local fijo",
    username: "policy.fixed",
    password: "Store-TestOnly-123!",
  });
  const actor = {
    id: store.id,
    role: "staff" as const,
    branchId: c.branchId,
    sessionId: crypto.randomUUID(),
    accountKind: "personal" as const,
  };
  await c.db.insert(session).values({
    id: actor.sessionId,
    userId: store.id,
    token: crypto.randomUUID(),
    expiresAt: later(365 * 86400000),
  });
  await expect(
    changeOwnPassword(
      c.db,
      actor,
      {
        currentPassword: "Store-TestOnly-123!",
        newPassword: "Different-TestOnly-456!",
      },
      now,
    ),
  ).rejects.toMatchObject({ status: 401 });
  await expect(
    c.db.transaction((tx) =>
      issueTemporaryPassword(tx, store.id, c.actors.admin.id, now),
    ),
  ).rejects.toMatchObject({ status: 403 });
});

it("starts the same temporary-password clock when a manager first authenticates at the shared workstation", async () => {
  const current = new Date();
  const store = await createStoreAccount(c.db, c.actors.admin, {
    requestId: crypto.randomUUID(),
    branchId: c.branchId,
    name: "Puesto de prueba",
    username: "policy.clock",
    password: "Store-TestOnly-123!",
  });
  const actor = {
    id: store.id,
    role: "staff" as const,
    branchId: c.branchId,
    sessionId: crypto.randomUUID(),
    accountKind: "store" as const,
  };
  await c.db.insert(session).values({
    id: actor.sessionId,
    userId: actor.id,
    token: crypto.randomUUID(),
    expiresAt: new Date(+current + 86400000),
  });
  await c.db.transaction((tx) =>
    issueTemporaryPassword(tx, c.actors.manager.id, c.actors.admin.id, current),
  );
  await authorizeManagement(
    c.db,
    actor,
    { identifier: "att-manager@test.local", password: testPassword },
    current,
  );
  expect(
    await passwordPolicyState(c.db, c.actors.manager.id, current),
  ).toMatchObject({
    firstLoginAt: current.toISOString(),
    expiresAt: new Date(+current + 86400000).toISOString(),
  });
});

it("does not clear a temporary obligation with a compatibility-equivalent password", async () => {
  await issue();
  await login();
  const equivalent = testPassword.replace("A", "Ａ");
  expect(
    await verifyPassword({ hash: originalHash, password: equivalent }),
  ).toBe(true);
  await expect(
    changeOwnPassword(
      c.db,
      c.actors.staff,
      { currentPassword: testPassword, newPassword: equivalent },
      now,
    ),
  ).rejects.toMatchObject({ code: "PASSWORD_REUSED" });
  expect(
    (await passwordPolicyState(c.db, c.actors.staff.id, now)).required,
  ).toBe(true);
  const [stored] = await c.db
    .select()
    .from(account)
    .where(eq(account.userId, c.actors.staff.id));
  expect(stored.password).toBe(originalHash);
});
