import { afterAll, beforeAll, expect, it } from "vitest";
import { drizzle } from "drizzle-orm/pglite";
import type { AppDb } from "@/db/client";
import * as schema from "@/db/schema";
import { createAttendanceContext, testPassword } from "./helpers/attendance";
import { createAuth, handleAuthRequest } from "@/lib/auth";
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
it.each([
  { temporary: false, maxQueries: 14 },
  { temporary: true, maxQueries: 16 },
])(
  "bounds the complete password login, including activation and policy checks ($temporary)",
  async ({ temporary, maxQueries }) => {
    const queries: string[] = [];
    const db = drizzle({
      client: c.client,
      schema,
      logger: { logQuery: (query) => queries.push(query) },
    }) as unknown as AppDb;
    const actor = temporary ? c.actors.staff : c.actors.admin;
    if (temporary)
      await db.transaction((tx) =>
        issueTemporaryPassword(tx, actor.id, c.actors.admin.id),
      );
    const origin = "https://kybo.example";
    const auth = createAuth(db, {
      baseURL: origin,
      secret: "login-performance-test-only-secret-at-least-32-characters",
    });
    queries.length = 0;
    const response = await handleAuthRequest(
      new Request(origin + "/api/auth/sign-in/email", {
        method: "POST",
        headers: {
          origin,
          "content-type": "application/json",
          "x-forwarded-for": "127.0.0.1",
        },
        body: JSON.stringify({
          email: actor.id + "@test.local",
          password: testPassword,
        }),
      }),
      auth,
      [origin],
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("set-cookie")).toContain("session_token");
    const result = await response.json();
    expect(result.passwordPolicy.required).toBe(temporary);
    if (temporary)
      expect(
        new Date(result.passwordPolicy.expiresAt).getTime() -
          new Date(result.passwordPolicy.firstLoginAt).getTime(),
      ).toBe(86400000);
    expect(queries.length).toBeLessThanOrEqual(maxQueries);
  },
);
