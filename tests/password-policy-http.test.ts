import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { createAttendanceContext, testPassword } from "./helpers/attendance";
import { createAuth, handleAuthRequest, actorFromHeaders } from "@/lib/auth";
import { rateLimit, userPasswordPolicies, account } from "@/db/schema";
import {
  issueTemporaryPassword,
  passwordPolicyState,
} from "@/modules/password-policy/service";
import { handlePasswordRequest } from "@/modules/password-policy/http";
const origin = "https://kybo.example",
  secret = "password-http-test-only-secret-at-least-32-characters";
let c: Awaited<ReturnType<typeof createAttendanceContext>>,
  auth: ReturnType<typeof createAuth>;
beforeAll(async () => {
  vi.stubEnv("BETTER_AUTH_URL", origin);
  vi.stubEnv("BETTER_AUTH_SECRET", secret);
  c = await createAttendanceContext(undefined, {
    attendanceAccess: true,
    passwordPolicy: true,
  });
  auth = createAuth(c.db, { baseURL: origin, secret });
}, 60000);
afterAll(async () => {
  await c?.close();
  vi.unstubAllEnvs();
});
beforeEach(async () => {
  await c.db.delete(rateLimit);
  await c.db.delete(userPasswordPolicies);
});
async function login(password = testPassword) {
  const response = await handleAuthRequest(
    new Request(origin + "/api/auth/sign-in/email", {
      method: "POST",
      headers: { origin, "content-type": "application/json" },
      body: JSON.stringify({ email: "att-staff@test.local", password }),
    }),
    auth,
    [origin],
  );
  return {
    response,
    body: await response.clone().json(),
    cookie: response.headers.get("set-cookie")?.split(";")[0] ?? "",
  };
}
const issue = () =>
  c.db.transaction((tx) =>
    issueTemporaryPassword(tx, c.actors.staff.id, c.actors.admin.id),
  );
async function expire() {
  const first = new Date(Date.now() - 90000000);
  await c.db
    .update(userPasswordPolicies)
    .set({ firstLoginAt: first, expiresAt: new Date(+first + 86400000) })
    .where(eq(userPasswordPolicies.userId, c.actors.staff.id));
}
it("starts the clock on correct password login only and exposes its fixed deadline", async () => {
  await issue();
  expect((await login("Wrong-TestOnly-123!")).response.ok).toBe(false);
  expect(
    (await passwordPolicyState(c.db, c.actors.staff.id)).firstLoginAt,
  ).toBeNull();
  const signed = await login();
  expect(signed.response.status).toBe(200);
  expect(signed.body.passwordPolicy).toMatchObject({
    required: true,
    blocked: false,
  });
  expect(
    Date.parse(signed.body.passwordPolicy.expiresAt) -
      Date.parse(signed.body.passwordPolicy.firstLoginAt),
  ).toBe(86400000);
  expect((await login()).body.passwordPolicy.expiresAt).toBe(
    signed.body.passwordPolicy.expiresAt,
  );
});
it("rejects an existing cookie and removes any new cookie after the temporary deadline", async () => {
  await issue();
  const signed = await login();
  await expire();
  await expect(
    actorFromHeaders(new Headers({ cookie: signed.cookie }), c.db, auth),
  ).rejects.toMatchObject({ code: "TEMPORARY_PASSWORD_EXPIRED" });
  const expired = await login();
  expect(expired.response.status).toBe(403);
  expect(expired.body.code).toBe("TEMPORARY_PASSWORD_EXPIRED");
  expect(expired.cookie).toBe("");
});
it("prevents bypassing policy tracking through the native password-change route", async () => {
  const signed = await login();
  const before = (
    await c.db
      .select()
      .from(account)
      .where(eq(account.userId, c.actors.staff.id))
  )[0].password;
  const response = await handleAuthRequest(
    new Request(origin + "/api/auth/change-password", {
      method: "POST",
      headers: {
        origin,
        cookie: signed.cookie,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        currentPassword: testPassword,
        newPassword: "Native-Change-TestOnly-123!",
      }),
    }),
    auth,
    [origin],
  );
  expect(response.status).toBe(403);
  expect((await response.json()).code).toBe("PASSWORD_CHANGE_ROUTE");
  expect(
    (
      await c.db
        .select()
        .from(account)
        .where(eq(account.userId, c.actors.staff.id))
    )[0].password,
  ).toBe(before);
});
it("keeps own password state private and rejects cross-origin and extra target fields", async () => {
  await issue();
  const signed = await login();
  const get = await handlePasswordRequest(
    new Request(origin + "/api/account/password", {
      headers: { cookie: signed.cookie },
    }),
    c.db,
    auth,
  );
  expect(get.status).toBe(200);
  expect(get.headers.get("cache-control")).toContain("no-store");
  expect(await get.json()).toMatchObject({ required: true });
  const send = (requestOrigin: string, extra = {}) =>
    handlePasswordRequest(
      new Request(origin + "/api/account/password", {
        method: "POST",
        headers: {
          origin: requestOrigin,
          cookie: signed.cookie,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          currentPassword: testPassword,
          newPassword: "Different-TestOnly-456!",
          ...extra,
        }),
      }),
      c.db,
      auth,
    );
  expect((await send("https://other.example")).status).toBe(403);
  expect((await send(origin, { userId: c.actors.admin.id })).status).toBe(400);
  await expire();
  const blocked = await send(origin);
  expect(blocked.status).toBe(403);
  expect((await blocked.json()).code).toBe("TEMPORARY_PASSWORD_EXPIRED");
});
