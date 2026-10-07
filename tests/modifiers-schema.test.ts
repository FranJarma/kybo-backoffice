import { afterAll, beforeAll, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { createTestDb } from "./helpers/database";
let ctx: Awaited<ReturnType<typeof createTestDb>>;
beforeAll(async () => {
  ctx = await createTestDb();
});
afterAll(async () => {
  await ctx?.close();
});
it("stores reusable groups and restricts duplicate version numbers", async () => {
  await ctx.db.execute(
    sql`insert into modifier_groups(id,name) values ('00000000-0000-4000-8000-000000000001','Perlas')`,
  );
  const rows = await ctx.db.execute(
    sql`select name, revision from modifier_groups`,
  );
  expect(rows.rows[0]).toMatchObject({ name: "Perlas", revision: 1 });
});
it("marks old composition explicitly instead of inventing items", async () => {
  const cols = await ctx.db.execute(
    sql`select column_default from information_schema.columns where table_name='sale_lines' and column_name='composition_status'`,
  );
  expect(cols.rows[0]?.column_default).toContain("legacy_unknown");
});
it("upgrades a populated 0005 database without rewriting historical sales", async () => {
  const { PGlite } = await import("@electric-sql/pglite");
  const { readFile } = await import("node:fs/promises");
  const client = new PGlite();
  try {
    const journal = JSON.parse(
      await readFile("drizzle/meta/_journal.json", "utf8"),
    );
    for (const entry of journal.entries.filter(
      (e: { idx: number }) => e.idx <= 5,
    ))
      await client.exec(await readFile(`drizzle/${entry.tag}.sql`, "utf8"));
    await client.exec(`insert into "user"(id,name,email,email_verified,created_at,updated_at) values ('old-owner','Owner','old@test.local',true,now(),now());
 insert into products(id,name) values ('10000000-0000-4000-8000-000000000001','Original');
 insert into recipes(id,kind,product_id) values ('10000000-0000-4000-8000-000000000002','product','10000000-0000-4000-8000-000000000001');
 insert into recipe_versions(id,recipe_id,version,output_name,output_unit,yield_quantity,actor_id) values ('10000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000002',1,'Original','unit',1,'old-owner');
 insert into sales(id,origin,channel,fulfillment,status,total_amount,paid_amount,business_date,actor_id) values ('10000000-0000-4000-8000-000000000004','counter','counter','takeaway','closed',7000,7000,'2026-09-01','old-owner');
 insert into sale_orders(id,sale_id,sequence,total_amount,actor_id) values ('10000000-0000-4000-8000-000000000005','10000000-0000-4000-8000-000000000004',1,7000,'old-owner');
 insert into sale_lines(order_id,position,product_id,name,quantity,unit_price,line_total,recipe_version_id) values ('10000000-0000-4000-8000-000000000005',0,'10000000-0000-4000-8000-000000000001','Original',1,7000,7000,'10000000-0000-4000-8000-000000000003');`);
    for (const entry of journal.entries.filter(
      (e: { idx: number }) => e.idx > 5,
    ))
      await client.exec(await readFile(`drizzle/${entry.tag}.sql`, "utf8"));
    expect(
      (
        await client.query(
          "select composition_status,line_total from sale_lines",
        )
      ).rows[0],
    ).toEqual({ composition_status: "legacy_unknown", line_total: "7000.00" });
    expect(
      (await client.query("select composition_model from recipe_versions"))
        .rows[0],
    ).toEqual({ composition_model: "legacy" });
    expect(
      (await client.query("select * from sale_line_components")).rows,
    ).toHaveLength(0);
  } finally {
    await client.close();
  }
});
