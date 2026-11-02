import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { createAttendanceContext, testPassword } from "./helpers/attendance";
import { saveUser, listUsers } from "@/modules/users/service";
import {
  passwordPolicyState,
  beginTemporaryPasswordLogin,
} from "@/modules/password-policy/service";
import { account, user } from "@/db/schema";
import { verifyPassword } from "better-auth/crypto";
let c: Awaited<ReturnType<typeof createAttendanceContext>>;
beforeAll(async () => {
  vi.stubEnv(
    "BETTER_AUTH_SECRET",
    "password-users-only-test-secret-at-least-32-characters",
  );
  vi.stubEnv("BETTER_AUTH_URL", "https://kybo.example");
  c = await createAttendanceContext(undefined, {
    attendanceAccess: true,
    passwordPolicy: true,
  });
}, 60000);
afterAll(async () => {
  await c?.close();
  vi.unstubAllEnvs();
});
const input = () => ({
  requestId: crypto.randomUUID(),
  name: "Nueva persona",
  username: "temporary.member",
  email: "",
  password: "Member-TestOnly-123!",
  temporaryPassword: true,
  role: "staff",
  disabled: false,
  catalogManager: false,
  memberships: [{ branchId: c.branchId, role: "staff" }],
});
it("creates a temporary policy atomically with a personal account and preserves its first login on request replay", async () => {
  const command = input();
  const created = await saveUser(c.db, c.actors.admin, command);
  expect(await passwordPolicyState(c.db, created.id)).toMatchObject({
    required: true,
    firstLoginAt: null,
    expiresAt: null,
  });
  const first = new Date();
  await c.db.transaction((tx) =>
    beginTemporaryPasswordLogin(tx, created.id, first),
  );
  expect(await saveUser(c.db, c.actors.admin, command)).toMatchObject({
    id: created.id,
    replayed: true,
  });
  expect((await passwordPolicyState(c.db, created.id)).firstLoginAt).toBe(
    first.toISOString(),
  );
  const row = (await listUsers(c.db, c.actors.admin)).rows.find(
    (x) => x.id === created.id,
  )!;
  expect(row.passwordPolicy).toMatchObject({
    required: true,
    firstLoginAt: first.toISOString(),
  });
  expect(JSON.stringify(row)).not.toContain(command.password);
});
it("updates the existing identity without duplicating it and starts a fresh policy only with a replacement password", async () => {
  const current = (await listUsers(c.db, c.actors.admin)).rows.find(
    (x) => x.id === c.actors.staff.id,
  )!;
  const count = await c.db.select().from(user);
  const result = await saveUser(c.db, c.actors.admin, {
    ...input(),
    id: current.id,
    version: current.version,
    name: "Nombre actualizado",
    username: "existing.member",
    email: current.email ?? "",
    password: "Replacement-TestOnly-123!",
  });
  expect(result.id).toBe(current.id);
  expect(await c.db.select().from(user)).toHaveLength(count.length);
  const [credential] = await c.db
    .select()
    .from(account)
    .where(eq(account.userId, current.id));
  expect(
    await verifyPassword({
      hash: credential.password!,
      password: "Replacement-TestOnly-123!",
    }),
  ).toBe(true);
  expect(
    await verifyPassword({
      hash: credential.password!,
      password: testPassword,
    }),
  ).toBe(false);
  expect(await passwordPolicyState(c.db, current.id)).toMatchObject({
    required: true,
    firstLoginAt: null,
  });
  const updated = (await listUsers(c.db, c.actors.admin)).rows.find(
    (x) => x.id === current.id,
  )!;
  await saveUser(c.db, c.actors.admin, {
    ...input(),
    id: current.id,
    version: updated.version,
    name: updated.name,
    username: updated.username!,
    email: updated.email ?? "",
    password: "",
    temporaryPassword: false,
  });
  expect((await passwordPolicyState(c.db, current.id)).required).toBe(true);
});
it("makes generated invitation credentials temporary as well", async () => {
  const created = await saveUser(c.db, c.actors.admin, {
    action: "invite-create",
    requestId: crypto.randomUUID(),
    name: "Invitación temporal",
    role: "staff",
    branchId: c.branchId,
    attendanceEnabled: true,
  });
  expect(created.invitation).toBeTruthy();
  expect(await passwordPolicyState(c.db, created.id)).toMatchObject({
    required: true,
    firstLoginAt: null,
  });
});
it("fails closed instead of issuing an untracked temporary password before its schema is installed", async () => {
  await c.client.exec("drop table user_password_policies");
  const count = await c.db.select().from(user);
  await expect(
    saveUser(c.db, c.actors.admin, { ...input(), username: "not.created" }),
  ).rejects.toMatchObject({ code: "PASSWORD_POLICY_SETUP", status: 503 });
  expect(await c.db.select().from(user)).toHaveLength(count.length);
});
