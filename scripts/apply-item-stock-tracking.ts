// Apply only the additive stock-tracking migration; validate all preceding history.
import { config } from "dotenv";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { Pool } from "pg";
config({ quiet: true });
if (!process.env.DATABASE_URL)
  throw new Error("DATABASE_URL no está configurada.");
const apply = process.argv.includes("--apply");
const entries = (
  JSON.parse(readFileSync("drizzle/meta/_journal.json", "utf8")) as {
    entries: { idx: number; when: number; tag: string }[];
  }
).entries.filter((e) => e.idx <= 13);
const files = entries.map((e) => ({
  ...e,
  sql: readFileSync(`drizzle/${e.tag}.sql`, "utf8"),
}));
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
    throw new Error("Transición anterior pendiente.");
  const history = (
    await client.query(
      "select hash,created_at from drizzle.__drizzle_migrations order by created_at",
    )
  ).rows;
  if (
    ![13, 14].includes(history.length) ||
    files.length !== 14 ||
    files[13].tag !== "0013_item_stock_tracking"
  )
    throw new Error("Historial de migraciones inesperado.");
  history.forEach((h, i) => {
    if (
      String(h.created_at) !== String(files[i].when) ||
      h.hash !== hash(files[i].sql)
    )
      throw new Error(`Difiere la migración ${i}.`);
  });
  const pending = history.length === 13;
  const column = () =>
    client.query(
      "select is_nullable,data_type,column_default from information_schema.columns where table_schema='public' and table_name='items' and column_name='stock_tracked'",
    );
  if (pending && (await column()).rowCount)
    throw new Error("El campo existe sin historial.");
  if (apply && pending) {
    for (const statement of files[13].sql.split("--> statement-breakpoint"))
      if (statement.trim()) await client.query(statement);
    await client.query(
      "insert into drizzle.__drizzle_migrations(hash,created_at) values($1,$2)",
      [hash(files[13].sql), files[13].when],
    );
  }
  if (apply || !pending) {
    const c = (await column()).rows[0];
    if (
      c?.data_type !== "boolean" ||
      c.is_nullable !== "NO" ||
      c.column_default !== "true"
    )
      throw new Error("La columna no coincide con el esquema esperado.");
  }
  await client.query("COMMIT");
  console.log(
    JSON.stringify({
      mode: apply ? "apply" : "preflight",
      migration: "0013_item_stock_tracking",
      pending: pending && !apply,
      historyVerified: true,
    }),
  );
} catch (error) {
  await client.query("ROLLBACK").catch(() => {});
  throw error;
} finally {
  client.release();
  await pool.end();
}
