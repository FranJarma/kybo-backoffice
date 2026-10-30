import { afterAll, beforeAll, expect, it } from "vitest";
import { createAttendanceContext } from "./helpers/attendance";
import {
  createAuth,
  handleAuthRequest,
  actorFromHeaders,
  provisionUser,
} from "@/lib/auth";
import { requireUserAdministrator } from "@/modules/users/service";

const origin = "https://kybo.example";
const secret = "onboarding-test-secret-only-at-least-32-characters";
let c: Awaited<ReturnType<typeof createAttendanceContext>>;
beforeAll(async () => {
  c = await createAttendanceContext(undefined, { attendanceAccess: true });
});
afterAll(async () => {
  await c?.close();
});

it("does not expose an authenticated operational session before invitation activation", async () => {
  await c.client.exec(`CREATE TABLE IF NOT EXISTS user_invitations (
    user_id text PRIMARY KEY REFERENCES "user"(id), token_hash text NOT NULL UNIQUE,
    generation uuid NOT NULL, branch_id uuid NOT NULL REFERENCES branches(id),
    expires_at timestamptz NOT NULL, activated_at timestamptz,
    message_ciphertext text, created_by text NOT NULL REFERENCES "user"(id),
    created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
  )`);
  const id = await provisionUser(c.db, {
    name: "Pending",
    username: "pending.login",
    password: "Initial-Password-123!",
    role: "staff",
    branchId: c.branchId,
  });
  await c.client.query(
    `INSERT INTO user_invitations(user_id,token_hash,generation,branch_id,expires_at,created_by) VALUES($1,$2,$3,$4,$5,$6)`,
    [
      id,
      "pending-hash",
      crypto.randomUUID(),
      c.branchId,
      new Date(Date.now() + 86400000),
      c.actors.admin.id,
    ],
  );
  const auth = createAuth(c.db, { baseURL: origin, secret });
  const response = await handleAuthRequest(
    new Request(origin + "/api/auth/sign-in/username", {
      method: "POST",
      headers: { origin, "content-type": "application/json" },
      body: JSON.stringify({
        username: "pending.login",
        password: "Initial-Password-123!",
      }),
    }),
    auth,
    [origin],
  );
  expect(response.ok).toBe(false);
  expect(response.headers.get("set-cookie") ?? "").not.toContain(
    "session_token",
  );
  const direct = await auth.handler(
    new Request(origin + "/api/auth/sign-in/username", {
      method: "POST",
      headers: { origin, "content-type": "application/json" },
      body: JSON.stringify({
        username: "pending.login",
        password: "Initial-Password-123!",
      }),
    }),
  );
  const cookie = direct.headers.get("set-cookie")?.split(";")[0] ?? "";
  expect(
    await actorFromHeaders(new Headers({ cookie }), c.db, auth),
  ).toBeNull();
});
it("rejects a persistent store marker even if its operational row was wrongly promoted", async () => {
  await c.client
    .exec(`CREATE TABLE IF NOT EXISTS workplace_store_accounts(user_id text PRIMARY KEY REFERENCES "user"(id),branch_id uuid NOT NULL REFERENCES branches(id),enabled boolean NOT NULL DEFAULT true,created_by text NOT NULL REFERENCES "user"(id));
 CREATE TABLE IF NOT EXISTS workplace_management_authorizations(id uuid PRIMARY KEY);
 CREATE TABLE IF NOT EXISTS workplace_station_assignments(assignment_id uuid PRIMARY KEY);`);
  const id = await provisionUser(c.db, {
    name: "Store",
    username: "promoted.store",
    password: "Store-Password-123!",
    role: "admin",
  });
  await c.client.query(
    "INSERT INTO workplace_store_accounts(user_id,branch_id,created_by) VALUES($1,$2,$3)",
    [id, c.branchId, c.actors.admin.id],
  );
  await expect(
    requireUserAdministrator(c.db, { id, role: "admin" }),
  ).rejects.toMatchObject({ status: 403 });
});
