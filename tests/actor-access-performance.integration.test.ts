import { beforeAll, afterAll, expect, it } from "vitest";
import { drizzle } from "drizzle-orm/pglite";
import type { AppDb } from "@/db/client";
import * as schema from "@/db/schema";
import { createAttendanceContext, testPassword } from "./helpers/attendance";
import { createAuth, handleAuthRequest, actorFromHeaders } from "@/lib/auth";
import { issueTemporaryPassword } from "@/modules/password-policy/service";
let c: Awaited<ReturnType<typeof createAttendanceContext>>;
beforeAll(async () => {
  c = await createAttendanceContext(undefined, {
    attendanceAccess: true,
    passwordPolicy: true,
  });
}, 60000);
afterAll(async () => {
  await c?.close();
});
it("authenticates a live session with bounded round trips including all access-policy checks", async () => {
  const queries: string[] = [];
  const db = drizzle({
    client: c.client,
    schema,
    logger: { logQuery: (query: string) => queries.push(query) },
  }) as unknown as AppDb;
  await db.transaction((tx) =>
    issueTemporaryPassword(tx, c.actors.staff.id, c.actors.admin.id),
  );
  const origin = "https://kybo.example",
    auth = createAuth(db, {
      baseURL: origin,
      secret: "actor-performance-test-only-secret-at-least-32-characters",
    });
  const signed = await handleAuthRequest(
    new Request(origin + "/api/auth/sign-in/email", {
      method: "POST",
      headers: { origin, "content-type": "application/json" },
      body: JSON.stringify({
        email: "att-staff@test.local",
        password: testPassword,
      }),
    }),
    auth,
    [origin],
  );
  expect(signed.status).toBe(200);
  const cookie = signed.headers.get("set-cookie")!.split(";")[0];
  queries.length = 0;
  expect(
    await actorFromHeaders(new Headers({ cookie }), db, auth),
  ).toMatchObject({ id: c.actors.staff.id, accountKind: "personal" });
  expect(queries.length).toBeLessThanOrEqual(5);
});
