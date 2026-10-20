import { config } from "dotenv";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { Pool } from "pg";
config({ quiet: true });
if (!process.env.DATABASE_URL) throw Error("DATABASE_URL no está configurada.");
const apply = process.argv.includes("--apply"),
  target = 23;
const entries = (
  JSON.parse(readFileSync("drizzle/meta/_journal.json", "utf8")).entries as {
    idx: number;
    when: number;
    tag: string;
  }[]
)
  .filter((e) => e.idx <= target)
  .map((e) => ({ ...e, sql: readFileSync(`drizzle/${e.tag}.sql`, "utf8") }));
const hash = (text: string) => createHash("sha256").update(text).digest("hex");
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  connectionTimeoutMillis: 15000,
});
const client = await pool.connect();
const tables = [
  "products",
  "product_prices",
  "payment_methods",
  "sales",
  "sale_orders",
  "sale_lines",
  "sale_payments",
  "recipes",
  "recipe_versions",
  "recipe_modifier_option_prices",
  "combo_options",
  "stock_movements",
  "expense_periods",
  "expense_closures",
] as const;
async function fingerprints() {
  const result: Record<string, unknown> = {};
  for (const table of tables) {
    result[table] = (
      await client.query(
        `select count(*)::int as count, md5(coalesce(string_agg((to_jsonb(t) - 'iibb_rate')::text, '' order by id),'')) as hash from "${table}" t`,
      )
    ).rows[0];
  }
  return result;
}
try {
  await client.query(apply ? "BEGIN" : "BEGIN READ ONLY");
  await client.query("SET LOCAL lock_timeout='10s'");
  await client.query("SET LOCAL statement_timeout='60s'");
  if (apply) await client.query("select pg_advisory_xact_lock(7269260)");
  if (
    (await client.query("select status from data_model_state where id=1"))
      .rows[0]?.status !== "ready"
  )
    throw Error("Transición pendiente.");
  const history = (
    await client.query(
      "select hash,created_at from drizzle.__drizzle_migrations order by created_at",
    )
  ).rows;
  if (
    ![target, target + 1].includes(history.length) ||
    entries.length !== target + 1 ||
    entries[target].tag !== "0023_costing_iibb"
  )
    throw Error("Historial inesperado.");
  history.forEach((h, i) => {
    if (
      h.hash !== hash(entries[i].sql) ||
      String(h.created_at) !== String(entries[i].when)
    )
      throw Error(`Difiere la migración ${i}.`);
  });
  const before = await fingerprints();
  if (apply && history.length === target) {
    await client.query(entries[target].sql);
    await client.query(
      "insert into drizzle.__drizzle_migrations(hash,created_at) values($1,$2)",
      [hash(entries[target].sql), entries[target].when],
    );
  }
  if (JSON.stringify(await fingerprints()) !== JSON.stringify(before))
    throw Error("Cambió el contenido previo: se revierte la migración.");
  const ready = apply || history.length > target;
  await client.query("COMMIT");
  console.log({
    migration: entries[target].tag,
    pending: !ready,
    historyVerified: true,
    existingContentPreserved: true,
    tablesVerified: tables.length,
    moduleReady: ready,
  });
} catch (error) {
  await client.query("ROLLBACK");
  throw error;
} finally {
  client.release();
  await pool.end();
}
