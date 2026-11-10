import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { readFile } from "node:fs/promises";
import { eq } from "drizzle-orm";
import { verifyPassword } from "better-auth/crypto";
import {
  account,
  user,
  operationalUsers,
  passwordRecoveryChallenges,
} from "@/db/schema";
import { createAttendanceContext } from "./helpers/attendance";
import { createRecoveryService } from "@/modules/password-recovery/service";
import { listUsers, saveUser } from "@/modules/users/service";
const config = {
  secret: "email-recovery-test-private-secret-32-chars",
  channel: "email" as const,
};
let c: Awaited<ReturnType<typeof createAttendanceContext>>,
  originalHash: string,
  now: Date;
let messages: Array<{ recipient: string; code: string }>;
const service = () =>
  createRecoveryService(
    c.db,
    config,
    {
      sendCode: async (message: { recipient: string; code: string }) => {
        messages.push(message);
      },
    },
    () => now,
  );
beforeAll(async () => {
  vi.stubEnv("BETTER_AUTH_SECRET", "email-test-only-authentication-secret-32");
  c = await createAttendanceContext(undefined, {
    attendanceAccess: true,
    passwordPolicy: true,
  });
  await c.client.exec(
    await readFile("drizzle/0036_whatsapp_password_recovery.sql", "utf8"),
  );
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
  now = new Date("2026-11-06T14:00:00Z");
  messages = [];
  await c.client.exec(
    "truncate password_recovery_challenges,password_recovery_limits,password_recovery_contacts",
  );
  await c.db
    .update(user)
    .set({
      username: "email_staff",
      email: "employee@example.test",
      emailVerified: true,
      updatedAt: now,
    })
    .where(eq(user.id, c.actors.staff.id));
  await c.db
    .update(account)
    .set({ password: originalHash })
    .where(eq(account.userId, c.actors.staff.id));
  await c.db
    .update(operationalUsers)
    .set({ disabled: false, updatedAt: now })
    .where(eq(operationalUsers.userId, c.actors.staff.id));
});
const start = async () => {
  const flow = service();
  const request = await flow.request("email_staff", "client");
  await request.deliver();
  return { flow, request, code: messages.at(-1)?.code ?? "000000" };
};
it("recovers through a confirmed email without configuring a phone", async () => {
  const { flow, request, code } = await start();
  expect(messages).toHaveLength(1);
  expect(messages[0].recipient).toBe("employee@example.test");
  const grant = await flow.verify(request.challengeId, code, "client");
  await flow.reset(
    request.challengeId,
    grant.token,
    "Changed-through-email-123!",
    "client",
  );
  const [credential] = await c.db
    .select()
    .from(account)
    .where(eq(account.userId, c.actors.staff.id));
  expect(
    await verifyPassword({
      hash: credential.password!,
      password: "Changed-through-email-123!",
    }),
  ).toBe(true);
});
it.each([
  { email: "employee@example.test", emailVerified: false },
  { email: "reserved@users.invalid", emailVerified: true },
])(
  "does not send to an unconfirmed or placeholder address: $email",
  async (values) => {
    await c.db.update(user).set(values).where(eq(user.id, c.actors.staff.id));
    const { flow, request } = await start();
    expect(messages).toHaveLength(0);
    await expect(
      flow.verify(request.challengeId, "123456", "client"),
    ).rejects.toMatchObject({ code: "RECOVERY_INVALID" });
  },
);
it("invalidates proof when the email changes even if its timestamp was not advanced", async () => {
  const { flow, request, code } = await start();
  const grant = await flow.verify(request.challengeId, code, "client");
  await c.db
    .update(user)
    .set({ email: "replacement@example.test" })
    .where(eq(user.id, c.actors.staff.id));
  await expect(
    flow.reset(
      request.challengeId,
      grant.token,
      "Must-not-be-accepted-123!",
      "client",
    ),
  ).rejects.toMatchObject({ code: "RECOVERY_INVALID" });
});
it("invalidates proof when email confirmation is revoked", async () => {
  const { flow, request, code } = await start();
  const grant = await flow.verify(request.challengeId, code, "client");
  await c.db
    .update(user)
    .set({ emailVerified: false })
    .where(eq(user.id, c.actors.staff.id));
  await expect(
    flow.reset(
      request.challengeId,
      grant.token,
      "Must-not-be-accepted-123!",
      "client",
    ),
  ).rejects.toMatchObject({ code: "RECOVERY_INVALID" });
});
it("does not expose or persist the destination in the public request or challenge", async () => {
  const { request } = await start();
  expect(JSON.stringify(request)).not.toContain("employee@example.test");
  const [row] = await c.db
    .select()
    .from(passwordRecoveryChallenges)
    .where(eq(passwordRecoveryChallenges.id, request.challengeId));
  expect(JSON.stringify(row)).not.toContain("employee@example.test");
});
it("lets Administration confirm recovery email and disables it when the address changes", async () => {
  await c.db
    .update(user)
    .set({ emailVerified: false })
    .where(eq(user.id, c.actors.staff.id));
  let row = (await listUsers(c.db, c.actors.admin)).rows.find(
    (row) => row.id === c.actors.staff.id,
  )!;
  expect(row.emailRecoveryEnabled).toBe(false);
  const body = (profile: typeof row) => ({
    id: profile.id,
    requestId: crypto.randomUUID(),
    version: profile.version,
    name: profile.name,
    username: profile.username ?? "",
    email: profile.email ?? "",
    password: "",
    role: profile.role,
    disabled: profile.disabled,
    catalogManager: profile.catalogManager,
    memberships: profile.memberships,
  });
  await saveUser(c.db, c.actors.admin, {
    ...body(row),
    emailRecoveryEnabled: true,
  });
  expect(
    (await c.db.select().from(user).where(eq(user.id, c.actors.staff.id)))[0]
      .emailVerified,
  ).toBe(true);
  row = (await listUsers(c.db, c.actors.admin)).rows.find(
    (row) => row.id === c.actors.staff.id,
  )!;
  await saveUser(c.db, c.actors.admin, {
    ...body(row),
    email: "replacement@example.test",
    emailRecoveryEnabled: false,
  });
  expect(
    (await c.db.select().from(user).where(eq(user.id, c.actors.staff.id)))[0]
      .emailVerified,
  ).toBe(false);
});
it("rejects enabling email recovery without a real address", async () => {
  const row = (await listUsers(c.db, c.actors.admin)).rows.find(
    (row) => row.id === c.actors.staff.id,
  )!;
  await expect(
    saveUser(c.db, c.actors.admin, {
      id: row.id,
      requestId: crypto.randomUUID(),
      version: row.version,
      name: row.name,
      username: row.username,
      email: "",
      password: "",
      role: row.role,
      disabled: row.disabled,
      catalogManager: row.catalogManager,
      memberships: row.memberships,
      emailRecoveryEnabled: true,
    }),
  ).rejects.toThrow();
});
it("does not silently confirm a recovery email in a legacy create payload", async () => {
  const result = await saveUser(c.db, c.actors.admin, {
    requestId: crypto.randomUUID(),
    name: "New email test",
    username: "legacy_email_create",
    email: "legacy-created@example.test",
    password: "Test-only-new-user-123!",
    role: "staff",
    disabled: false,
    catalogManager: false,
    memberships: [{ branchId: c.branchId, role: "staff" }],
  });
  const [profile] = await c.db
    .select()
    .from(user)
    .where(eq(user.id, result.id));
  expect(profile.emailVerified).toBe(false);
});
