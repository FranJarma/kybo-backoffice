import { afterAll, beforeAll, beforeEach, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createAttendanceContext } from "./helpers/attendance";
import { saveUser, listUsers } from "@/modules/users/service";
import { createAuth, handleAuthRequest, actorFromHeaders } from "@/lib/auth";
import { account, session, rateLimit } from "@/db/auth-schema";
import {
  beginGuidedRegistration,
  finishRegistration,
  beginRegistration,
} from "@/modules/identity/service";
import { onboardingState } from "@/modules/invitations/authentication";
import { testAuthenticator } from "./helpers/test-authenticator";

const origin = "https://kybo.example",
  secret = "invitation-integration-only-secret-at-least-32-characters";
let c: Awaited<ReturnType<typeof createAttendanceContext>>;
beforeAll(async () => {
  process.env.BETTER_AUTH_SECRET = secret;
  process.env.BETTER_AUTH_URL = origin;
  c = await createAttendanceContext(undefined, { attendanceAccess: true });
});
afterAll(async () => {
  await c?.close();
});
beforeEach(async () => {
  await c.db.delete(rateLimit);
});
const create = () => ({
  action: "invite-create",
  requestId: crypto.randomUUID(),
  name: "Ana Invitada",
  role: "staff",
  branchId: c.branchId,
  attendanceEnabled: true,
});
async function login(username: string, password: string, token?: string) {
  const auth = createAuth(c.db, { baseURL: origin, secret });
  const response = await handleAuthRequest(
    new Request(origin + "/api/auth/sign-in/username", {
      method: "POST",
      headers: {
        origin,
        "content-type": "application/json",
        ...(token ? { "X-Kybo-Invitation": token } : {}),
      },
      body: JSON.stringify({ username, password }),
    }),
    auth,
    [origin],
  );
  return {
    auth,
    response,
    body: await response.clone().json(),
    cookie: response.headers.get("set-cookie")?.split(";")[0] ?? "",
  };
}
it("generates one private invitation and replays without duplicate users or leaked audit credentials", async () => {
  const input = create(),
    first = await saveUser(c.db, c.actors.admin, input);
  expect(first.invitation?.username).toMatch(/^[a-z0-9_.]{3,30}$/);
  expect(first.invitation?.password.length).toBeGreaterThanOrEqual(20);
  expect(first.invitation?.message).toContain(first.invitation!.password);
  expect(first.invitation?.url).not.toContain(first.invitation!.password);
  const replay = await saveUser(c.db, c.actors.admin, input);
  expect(replay).toMatchObject({
    id: first.id,
    replayed: true,
    invitation: first.invitation,
  });
  expect(
    new Date(first.invitation!.expiresAt).getTime() - Date.now(),
  ).toBeGreaterThan(2.9 * 86400000);
  const snapshot = JSON.stringify(await listUsers(c.db, c.actors.admin));
  expect(snapshot).not.toContain(first.invitation!.password);
  expect(snapshot).not.toContain(first.invitation!.token);
  const audits = JSON.stringify(
    (
      await c.client.query("select * from audit_events where record_id=$1", [
        input.requestId,
      ])
    ).rows,
  );
  expect(audits).not.toContain(first.invitation!.password);
  expect(audits).not.toContain(first.invitation!.token);
  await expect(
    saveUser(c.db, c.actors.admin, { ...input, name: "Changed" }),
  ).rejects.toMatchObject({ status: 409 });
});
it("activates only a live invitation with password then preserves ordinary login after link expiry", async () => {
  const first = await saveUser(c.db, c.actors.admin, create()),
    i = first.invitation!;
  const missing = await login(i.username, i.password);
  expect(missing.response.status).toBe(403);
  expect(missing.cookie).toBe("");
  const wrong = await login(i.username, i.password, "wrong-token");
  expect(wrong.response.status).toBe(403);
  const valid = await login(i.username, i.password, i.token);
  expect(valid.response.status).toBe(200);
  expect(valid.body.onboarding).toMatchObject({
    needed: true,
    enrollmentReady: true,
    branchId: c.branchId,
  });
  expect(
    await actorFromHeaders(
      new Headers({ cookie: valid.cookie }),
      c.db,
      valid.auth,
    ),
  ).toMatchObject({
    id: first.id,
    sessionId: expect.any(String),
    accountKind: "personal",
  });
  const row = (
    await c.client.query<{
      activated_at: Date | null;
      message_ciphertext: string | null;
    }>("select * from user_invitations where user_id=$1", [first.id])
  ).rows[0];
  expect(row.activated_at).not.toBeNull();
  expect(row.message_ciphertext).toBeNull();
  await c.client.query(
    "update user_invitations set expires_at=now()-interval '1 day' where user_id=$1",
    [first.id],
  );
  const ordinary = await login(i.username, i.password);
  expect(ordinary.response.status).toBe(200);
  const replay = await saveUser(c.db, c.actors.admin, {
    action: "invite-reveal",
    userId: first.id,
  });
  expect(replay.invitation).toBeNull();
});
it("renewal preserves identity, rotates password/token, blocks historical credentials and does not disclose on old replay", async () => {
  const input = create(),
    first = await saveUser(c.db, c.actors.admin, input),
    old = first.invitation!;
  const renew = {
    action: "invite-renew",
    requestId: crypto.randomUUID(),
    userId: first.id,
    validityHours: 24,
  };
  const next = await saveUser(c.db, c.actors.admin, renew);
  expect(next.id).toBe(first.id);
  expect(next.invitation?.username).toBe(old.username);
  expect(next.invitation?.password).not.toBe(old.password);
  expect(next.invitation?.token).not.toBe(old.token);
  expect((await login(old.username, old.password, old.token)).response.ok).toBe(
    false,
  );
  expect(
    (await login(old.username, next.invitation!.password, old.token)).response
      .status,
  ).toBe(403);
  const oldReplay = await saveUser(c.db, c.actors.admin, input);
  expect(oldReplay.invitation).toBeNull();
  expect(await saveUser(c.db, c.actors.admin, renew)).toMatchObject({
    id: first.id,
    replayed: true,
    invitation: next.invitation,
  });
  await c.client.query(
    "update user_invitations set expires_at=now()-interval '1 second' where user_id=$1",
    [first.id],
  );
  const expired = await login(
    old.username,
    next.invitation!.password,
    next.invitation!.token,
  );
  expect(expired.response.status).toBe(403);
  expect(
    (
      await c.client.query<{ message_ciphertext: string | null }>(
        "select message_ciphertext from user_invitations where user_id=$1",
        [first.id],
      )
    ).rows[0].message_ciphertext,
  ).toBeNull();
  expect(
    await c.db.select().from(session).where(eq(session.userId, first.id)),
  ).toHaveLength(0);
  expect(
    (await c.db.select().from(account).where(eq(account.userId, first.id)))[0]
      .password,
  ).not.toBe(next.invitation!.password);
});
it("enrolls from the verified login without repeating password and refuses another session or expired grant", async () => {
  const created = await saveUser(c.db, c.actors.admin, create()),
    i = created.invitation!;
  const signed = await login(i.username, i.password, i.token);
  const actor = {
    ...(await actorFromHeaders(
      new Headers({ cookie: signed.cookie }),
      c.db,
      signed.auth,
    ))!,
    branchId: c.branchId,
  };
  const config = { rpId: "kybo.example", origin, secret };
  await expect(
    beginGuidedRegistration(
      c.db,
      { ...actor, sessionId: crypto.randomUUID() },
      config,
    ),
  ).rejects.toMatchObject({ code: "IDENTITY_LOGIN_REQUIRED" });
  await expect(
    beginGuidedRegistration(c.db, actor, config, new Date(Date.now() + 301000)),
  ).rejects.toMatchObject({ code: "IDENTITY_LOGIN_REQUIRED" });
  const challenge = await beginGuidedRegistration(c.db, actor, config);
  const device = testAuthenticator();
  await finishRegistration(
    c.db,
    actor,
    {
      challengeId: challenge.challengeId,
      response: device.registration(challenge.options.challenge),
    },
    config,
  );
  expect(await onboardingState(c.db, actor, config.rpId)).toMatchObject({
    needed: false,
    enrollmentReady: false,
  });
  await expect(
    beginGuidedRegistration(c.db, actor, config),
  ).rejects.toBeDefined();
  const options = await beginRegistration(
    c.db,
    actor,
    { password: i.password, name: "Otro celular" },
    config,
  );
  expect(options.challengeId).toBeTruthy();
  const ordinary = await login(i.username, i.password);
  expect(ordinary.body.onboarding.needed).toBe(false);
});
it("drops the created session and all cookies when renewal wins between password verification and activation", async () => {
  const created = await saveUser(c.db, c.actors.admin, create()),
    i = created.invitation!;
  const auth = createAuth(c.db, { baseURL: origin, secret }),
    underlying = auth.handler;
  auth.handler = async (request) => {
    const response = await underlying(request);
    if (response.ok)
      await saveUser(c.db, c.actors.admin, {
        action: "invite-renew",
        requestId: crypto.randomUUID(),
        userId: created.id,
      });
    return response;
  };
  const response = await handleAuthRequest(
    new Request(origin + "/api/auth/sign-in/username", {
      method: "POST",
      headers: {
        origin,
        "content-type": "application/json",
        "X-Kybo-Invitation": i.token,
      },
      body: JSON.stringify({ username: i.username, password: i.password }),
    }),
    auth,
    [origin],
  );
  expect(response.ok).toBe(false);
  expect(response.headers.get("set-cookie")).toBeNull();
  expect(
    await c.db.select().from(session).where(eq(session.userId, created.id)),
  ).toHaveLength(0);
  expect(
    (
      await c.client.query<{ activated_at: Date | null }>(
        "select activated_at from user_invitations where user_id=$1",
        [created.id],
      )
    ).rows[0].activated_at,
  ).toBeNull();
});
it("does not reveal historical invitation credentials after an explicit administrator password reset", async () => {
  const created = await saveUser(c.db, c.actors.admin, create());
  const profile = (await listUsers(c.db, c.actors.admin)).rows.find(
    (row) => row.id === created.id,
  )!;
  await saveUser(c.db, c.actors.admin, {
    id: profile.id,
    version: profile.version,
    name: profile.name,
    username: profile.username ?? "",
    role: profile.role,
    disabled: profile.disabled,
    catalogManager: profile.catalogManager,
    memberships: profile.memberships,
    requestId: crypto.randomUUID(),
    email: profile.email ?? "",
    password: "Explicit-Reset-Password-123!",
  });
  const result = await saveUser(c.db, c.actors.admin, {
    action: "invite-reveal",
    userId: created.id,
  });
  expect(result.invitation).toBeNull();
  expect(
    (
      await login(
        created.invitation!.username,
        "Explicit-Reset-Password-123!",
        created.invitation!.token,
      )
    ).response.ok,
  ).toBe(false);
});
