import { afterAll, beforeAll, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import { createDataModelTestContext } from "./helpers/data-model-database";
let c: Awaited<ReturnType<typeof createDataModelTestContext>>;
beforeAll(async () => {
  c = await createDataModelTestContext();
  await c.client.exec(
    await readFile("drizzle/0030_staff_attendance.sql", "utf8"),
  );
}, 60000);
afterAll(() => c?.close());
it("adds attendance and public-key structures without activating a branch or creating punches", async () => {
  const tables = await c.client.query<{ name: string }>(
    "select tablename as name from pg_tables where tablename like 'attendance_%' or tablename like 'identity_%'",
  );
  expect(tables.rows.map((r) => r.name)).toEqual(
    expect.arrayContaining([
      "attendance_settings",
      "attendance_participants",
      "attendance_shifts",
      "attendance_assignments",
      "attendance_events",
      "attendance_corrections",
      "attendance_manual_requests",
      "attendance_operations",
      "identity_credentials",
      "identity_challenges",
      "identity_confirmations",
    ]),
  );
  expect(
    (await c.client.query("select * from attendance_settings")).rows,
  ).toHaveLength(0);
  expect(
    (await c.client.query("select * from attendance_events")).rows,
  ).toHaveLength(0);
});
it("rejects invalid branch policies at database level", async () => {
  await expect(
    c.client.query(
      "insert into attendance_settings(branch_id, code_validity_minutes) values($1,0)",
      [c.mapping.initialBranch.id],
    ),
  ).rejects.toThrow();
  await expect(
    c.client.query(
      "insert into attendance_settings(branch_id, enabled) values($1,true)",
      [c.mapping.initialBranch.id],
    ),
  ).rejects.toThrow();
});
