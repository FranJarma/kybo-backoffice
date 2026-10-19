import { config } from "dotenv";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { Pool } from "pg";
config({ quiet: true });
if (!process.env.DATABASE_URL) throw Error("DATABASE_URL no está configurada.");
const apply = process.argv.includes("--apply"),
  target = 18;
const entries = (
  JSON.parse(readFileSync("drizzle/meta/_journal.json", "utf8")).entries as {
    idx: number;
    when: number;
    tag: string;
  }[]
)
  .filter((e) => e.idx <= target)
  .map((e) => ({ ...e, sql: readFileSync(`drizzle/${e.tag}.sql`, "utf8") }));
const hash = (s: string) => createHash("sha256").update(s).digest("hex");
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  connectionTimeoutMillis: 15000,
});
const client = await pool.connect();
try {
  await client.query(apply ? "BEGIN" : "BEGIN READ ONLY");
  await client.query("SET LOCAL lock_timeout='10s'");
  await client.query("SET LOCAL statement_timeout='60s'");
  if (apply) await client.query("select pg_advisory_xact_lock(7269260)");
  if (
    (await client.query("select status from data_model_state where id=1"))
      .rows[0]?.status !== "ready"
  )
    throw Error("Transición de inventario pendiente.");
  const history = (
    await client.query(
      "select hash,created_at from drizzle.__drizzle_migrations order by created_at",
    )
  ).rows;
  if (
    ![target, target + 1].includes(history.length) ||
    entries.length !== target + 1 ||
    entries[target].tag !== "0018_product_combos"
  )
    throw Error("Historial inesperado.");
  history.forEach((h, i) => {
    if (
      h.hash !== hash(entries[i].sql) ||
      String(h.created_at) !== String(entries[i].when)
    )
      throw Error(`Difiere la migración ${i}.`);
  });
  const before = (
    await client.query(
      "select (select count(*) from products)::int as products,(select count(*) from sales)::int as sales",
    )
  ).rows[0];
  if (apply && history.length === target) {
    await client.query(entries[target].sql);
    await client.query(
      "insert into drizzle.__drizzle_migrations(hash,created_at) values($1,$2)",
      [hash(entries[target].sql), entries[target].when],
    );
  }
  const after = (
    await client.query(
      "select (select count(*) from products)::int as products,(select count(*) from sales)::int as sales",
    )
  ).rows[0];
  if (JSON.stringify(before) !== JSON.stringify(after))
    throw Error("Los conteos cambiaron durante la migración.");
  await client.query("COMMIT");
  console.log({
    migration: entries[target].tag,
    pending: history.length === target && !apply,
    historyVerified: true,
    preserved: after,
  });
} catch (e) {
  await client.query("ROLLBACK");
  throw e;
} finally {
  client.release();
  await pool.end();
}
