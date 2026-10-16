// Add assigned production orders after verifying the entire migration history.
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
).entries.filter((e) => e.idx <= 15);
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
    ![15, 16].includes(history.length) ||
    files.length !== 16 ||
    files[15].tag !== "0015_production_assignments"
  )
    throw new Error("Historial de migraciones inesperado.");
  history.forEach((h, i) => {
    if (
      String(h.created_at) !== String(files[i].when) ||
      h.hash !== hash(files[i].sql)
    )
      throw new Error(`Difiere la migración ${i}.`);
  });
  const pending = history.length === 15;
  const columns = () =>
    client.query(
      "select column_name,data_type,is_nullable from information_schema.columns where table_schema='public' and table_name='production_orders' and column_name in ('assigned_to','created_by','started_by','completed_by','created_at','scheduled_for','started_at','completed_at','notes')",
    );
  if (pending && (await columns()).rowCount)
    throw new Error("Existen campos sin historial de migración.");
  if (apply && pending) {
    for (const statement of files[15].sql.split("--> statement-breakpoint"))
      if (statement.trim()) await client.query(statement);
    await client.query(
      "insert into drizzle.__drizzle_migrations(hash,created_at) values($1,$2)",
      [hash(files[15].sql), files[15].when],
    );
  }
  if (apply || !pending) {
    const fields = (await columns()).rows;
    if (
      fields.length !== 9 ||
      fields.some(
        (c) =>
          c.is_nullable !== "YES" ||
          c.data_type !==
            (c.column_name.endsWith("_at") || c.column_name === "scheduled_for"
              ? "timestamp with time zone"
              : "text"),
      )
    )
      throw new Error("Los campos no coinciden con el esquema esperado.");
    const check = await client.query(
      "select pg_get_constraintdef(oid) as definition from pg_constraint where conrelid='production_orders'::regclass and conname='production_order_state'",
    );
    if (!check.rows[0]?.definition.includes("planned"))
      throw new Error("Falta el estado planificado.");
  }
  await client.query("COMMIT");
  console.log(
    JSON.stringify({
      mode: apply ? "apply" : "preflight",
      migration: "0015_production_assignments",
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
