import { afterAll, beforeAll, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createDataModelTestContext } from "./helpers/data-model-database";
let ctx: Awaited<ReturnType<typeof createDataModelTestContext>>;
beforeAll(async () => {
  ctx = await createDataModelTestContext({ legacyDailyOperations: true });
}, 60000);
afterAll(async () => {
  await ctx?.close();
});
it("migration is transactional and enforces active need uniqueness and branch locations", async () => {
  const migration = await readFile("drizzle/0025_daily_operations.sql", "utf8");
  await ctx.client.exec("begin");
  await ctx.client.exec(migration);
  await ctx.client.exec("rollback");
  expect(
    (await ctx.client.query("select to_regclass('daily_operation_tasks') as t"))
      .rows,
  ).toEqual([{ t: null }]);
  await ctx.client.exec(migration);
  const b = ctx.mapping.initialBranch.id;
  await ctx.client.query(
    "insert into daily_operation_tasks(branch_id,kind,title,need_key) values($1,'transfer','Reponer','same')",
    [b],
  );
  await expect(
    ctx.client.query(
      "insert into daily_operation_tasks(branch_id,kind,title,need_key) values($1,'transfer','Reponer','same')",
      [b],
    ),
  ).rejects.toThrow();
  await expect(
    ctx.client.query(
      "insert into daily_operation_tasks(branch_id,kind,title,location_id) values($1,'transfer','Reponer',$2)",
      [b, randomUUID()],
    ),
  ).rejects.toThrow();
});
