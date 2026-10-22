import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { createDataModelTestContext } from "./helpers/data-model-database";
import { account, operationalUsers, session, user } from "@/db/auth-schema";
import { auditEvents } from "@/db/business-schema";
import { branches } from "@/db/branch-schema";
import { provisionUser, createAuth, actorFromHeaders } from "@/lib/auth";
import { resolveOperationalContext } from "@/modules/branches/active";
import { listUsers, saveUser } from "@/modules/users/service";
import type { Actor } from "@/lib/access";

let c: Awaited<ReturnType<typeof createDataModelTestContext>>;
let admin: Actor, branchId: string;
const password = "TestPassword-Only123!";
const origin = "http://localhost:3000";
beforeAll(async () => {
  vi.stubEnv(
    "BETTER_AUTH_SECRET",
    "test-only-secret-for-user-administration-commands",
  );
  c = await createDataModelTestContext();
  admin = {
    id: await provisionUser(c.db, {
      name: "Admin",
      username: "owner",
      password,
      role: "admin",
    }),
    role: "admin",
  };
  const [branch] = await c.db
    .insert(branches)
    .values({
      code: "USERS_TEST",
      name: "Local de prueba",
      timeZone: "America/Argentina/Buenos_Aires",
    })
    .returning();
  branchId = branch.id;
});
afterAll(async () => {
  await c?.close();
  vi.unstubAllEnvs();
});
const command = (username: string) => ({
  requestId: crypto.randomUUID(),
  name: "Empleado de prueba",
  username,
  email: "",
  password,
  role: "staff",
  disabled: false,
  catalogManager: false,
  memberships: [{ branchId, role: "staff" }],
});

it("creates a username-only employee, assigns the branch and returns no credentials", async () => {
  const result = await saveUser(c.db, admin, command("empleado"));
  const snapshot = await listUsers(c.db, admin);
  const row = snapshot.rows.find((r) => r.id === result.id)!;
  expect(row).toMatchObject({
    username: "empleado",
    email: null,
    role: "staff",
    disabled: false,
    memberships: [{ branchId, role: "staff" }],
  });
  expect(JSON.stringify(snapshot)).not.toMatch(/password|token|users\.invalid/);
  const auth = createAuth(c.db, {
    baseURL: origin,
    secret: "test-only-long-secret-for-user-administration",
  });
  const login = await auth.handler(
    new Request(origin + "/api/auth/sign-in/username", {
      method: "POST",
      headers: { "Content-Type": "application/json", origin },
      body: JSON.stringify({ username: "EMPLEADO", password }),
    }),
  );
  expect(login.ok).toBe(true);
  const cookie = login.headers.get("set-cookie")!.split(";")[0];
  const actor = await actorFromHeaders(new Headers({ cookie }), c.db, auth);
  expect((await resolveOperationalContext(c.db, actor!, "")).branchId).toBe(
    branchId,
  );
  const [credential] = await c.db
    .select()
    .from(account)
    .where(eq(account.userId, result.id));
  expect(credential.password).not.toBe(password);
});

it("replays a creation request without creating another account or audit record", async () => {
  const input = command("reintento");
  const first = await saveUser(c.db, admin, input);
  expect(await saveUser(c.db, admin, input)).toMatchObject({
    id: first.id,
    replayed: true,
  });
  await expect(
    saveUser(c.db, admin, { ...input, name: "Otra persona" }),
  ).rejects.toMatchObject({ status: 409 });
  expect(
    (
      await c.db
        .select()
        .from(auditEvents)
        .where(eq(auditEvents.recordId, input.requestId))
    ).length,
  ).toBe(1);
});

it("rejects duplicate identifiers, missing branch assignments and archived branches atomically", async () => {
  await expect(
    saveUser(c.db, admin, command("EMPLEADO")),
  ).rejects.toMatchObject({ status: 409 });
  await expect(
    saveUser(c.db, admin, { ...command("sinlocal"), memberships: [] }),
  ).rejects.toBeDefined();
  const [closed] = await c.db
    .insert(branches)
    .values({
      code: "USERS_CLOSED",
      name: "Cerrada",
      timeZone: "America/Argentina/Buenos_Aires",
      archivedAt: new Date(),
    })
    .returning();
  await expect(
    saveUser(c.db, admin, {
      ...command("cerrada"),
      memberships: [{ branchId: closed.id, role: "staff" }],
    }),
  ).rejects.toMatchObject({ status: 400 });
  expect(
    (await c.db.select().from(user).where(eq(user.username, "cerrada"))).length,
  ).toBe(0);
});

it("checks current administrator permissions, ignoring a forged or revoked actor role", async () => {
  const id = await provisionUser(c.db, {
    name: "Encargado",
    username: "manager",
    password,
    role: "manager",
    branchId,
  });
  const forged = { id, role: "admin" } as Actor;
  await expect(listUsers(c.db, forged)).rejects.toMatchObject({ status: 403 });
  await expect(
    saveUser(c.db, forged, command("intruso")),
  ).rejects.toMatchObject({ status: 403 });
  await c.db
    .update(operationalUsers)
    .set({ disabled: true })
    .where(eq(operationalUsers.userId, id));
  await expect(listUsers(c.db, forged)).rejects.toMatchObject({ status: 403 });
});

it("updates roles and branches with conflict detection, revokes sessions and preserves account history", async () => {
  const created = await saveUser(c.db, admin, command("edicion"));
  const row = (await listUsers(c.db, admin)).rows.find(
    (r) => r.id === created.id,
  )!;
  await c.db.insert(session).values({
    id: crypto.randomUUID(),
    userId: row.id,
    token: crypto.randomUUID(),
    expiresAt: new Date(Date.now() + 60000),
  });
  const update = {
    ...command("edicion"),
    id: row.id,
    version: row.version,
    password: "",
    role: "manager",
    catalogManager: true,
    memberships: [{ branchId, role: "manager" }],
  };
  await saveUser(c.db, admin, update);
  await expect(
    saveUser(c.db, admin, {
      ...update,
      requestId: crypto.randomUUID(),
      name: "Desactualizado",
    }),
  ).rejects.toMatchObject({ status: 409 });
  const changed = (await listUsers(c.db, admin)).rows.find(
    (r) => r.id === row.id,
  )!;
  expect(changed).toMatchObject({
    role: "manager",
    catalogManager: true,
    memberships: [{ branchId, role: "manager" }],
  });
  await saveUser(c.db, admin, {
    ...update,
    requestId: crypto.randomUUID(),
    version: changed.version,
    disabled: true,
  });
  expect(
    (await c.db.select().from(session).where(eq(session.userId, row.id)))
      .length,
  ).toBe(0);
  expect(
    (await c.db.select().from(user).where(eq(user.id, row.id))).length,
  ).toBe(1);
  const events = await c.db
    .select()
    .from(auditEvents)
    .where(eq(auditEvents.entity, "user-management"));
  expect(JSON.stringify(events)).not.toContain(password);
  expect(JSON.stringify(events)).not.toContain("users.invalid");
});

it("does not let an administrator disable or demote their own account", async () => {
  const row = (await listUsers(c.db, admin)).rows.find(
    (r) => r.id === admin.id,
  )!;
  const input = {
    ...command("owner"),
    id: row.id,
    version: row.version,
    name: row.name,
    password: "",
    role: "admin",
    memberships: [],
  };
  await expect(
    saveUser(c.db, admin, { ...input, disabled: true }),
  ).rejects.toMatchObject({ status: 400 });
  await expect(
    saveUser(c.db, admin, {
      ...input,
      role: "staff",
      memberships: [{ branchId, role: "staff" }],
    }),
  ).rejects.toMatchObject({ status: 400 });
});

it("can deactivate an employee after their only branch is archived", async () => {
  const [closed] = await c.db
    .insert(branches)
    .values({
      code: "USERS_TO_CLOSE",
      name: "Local cerrado",
      timeZone: "America/Argentina/Buenos_Aires",
    })
    .returning();
  const created = await saveUser(c.db, admin, {
    ...command("localcerrado"),
    memberships: [{ branchId: closed.id, role: "staff" }],
  });
  await c.db
    .update(branches)
    .set({ archivedAt: new Date() })
    .where(eq(branches.id, closed.id));
  const row = (await listUsers(c.db, admin)).rows.find(
    (r) => r.id === created.id,
  )!;
  expect(row.memberships).toEqual([]);
  const input = {
    ...command("localcerrado"),
    id: row.id,
    version: row.version,
    password: "",
    memberships: [],
    disabled: true,
  };
  await saveUser(c.db, admin, input);
  const disabled = (await listUsers(c.db, admin)).rows.find(
    (r) => r.id === row.id,
  )!;
  expect(disabled.disabled).toBe(true);
  await expect(
    saveUser(c.db, admin, {
      ...input,
      requestId: crypto.randomUUID(),
      version: disabled.version,
      disabled: false,
    }),
  ).rejects.toBeDefined();
});

it("preserves email-only accounts and rotates their credentials without exposing them", async () => {
  const id = await provisionUser(c.db, {
    name: "Cuenta anterior",
    email: "legacy@example.test",
    password,
    role: "staff",
    branchId,
  });
  let row = (await listUsers(c.db, admin)).rows.find((r) => r.id === id)!;
  const input = {
    ...command(""),
    id,
    version: row.version,
    name: row.name,
    email: row.email!,
    password: "",
  };
  const [original] = await c.db
    .select()
    .from(account)
    .where(eq(account.userId, id));
  await saveUser(c.db, admin, input);
  const [unchanged] = await c.db
    .select()
    .from(account)
    .where(eq(account.userId, id));
  expect(unchanged.password).toBe(original.password);
  row = (await listUsers(c.db, admin)).rows.find((r) => r.id === id)!;
  const changedPassword = "OtherPassword-Only123!";
  const change = {
    ...input,
    requestId: crypto.randomUUID(),
    version: row.version,
    password: changedPassword,
  };
  await saveUser(c.db, admin, change);
  await expect(
    saveUser(c.db, admin, { ...change, requestId: crypto.randomUUID() }),
  ).rejects.toMatchObject({ status: 409 });
  const auth = createAuth(c.db, {
    baseURL: origin,
    secret: "test-only-long-secret-for-user-administration",
  });
  const signIn = (attempt: string) =>
    auth.handler(
      new Request(origin + "/api/auth/sign-in/email", {
        method: "POST",
        headers: { "Content-Type": "application/json", origin },
        body: JSON.stringify({ email: row.email, password: attempt }),
      }),
    );
  expect((await signIn(password)).ok).toBe(false);
  expect((await signIn(changedPassword)).ok).toBe(true);
});
