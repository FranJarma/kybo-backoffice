// Targeted additive migration after the reviewed multi-branch transition.
// Read-only preflight by default; --apply executes only 0011 in one transaction.
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
).entries.filter((e) => e.idx <= 11);
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
  const state = (
    await client.query("select status from data_model_state where id=1")
  ).rows[0]?.status;
  if (state !== "ready")
    throw new Error("Precondición: la transición anterior no está lista.");
  const history = (
    await client.query(
      "select hash,created_at from drizzle.__drizzle_migrations order by created_at",
    )
  ).rows;
  if (
    ![11, 12].includes(history.length) ||
    files.length !== 12 ||
    files[11].tag !== "0011_item_sourcing"
  )
    throw new Error("Precondición: historial de migraciones inesperado.");
  history.forEach((h, i) => {
    if (
      String(h.created_at) !== String(files[i].when) ||
      h.hash !== hash(files[i].sql)
    )
      throw new Error(`Precondición: difiere la migración ${i}.`);
  });
  const pending = history.length === 11;
  const tables = ["item_suppliers", "supplier_quotes"];
  if (pending) {
    const existing = (
      await client.query(
        "select tablename from pg_tables where schemaname='public' and tablename=any($1)",
        [tables],
      )
    ).rows;
    if (existing.length)
      throw new Error(
        "Precondición: las tablas nuevas ya existen sin historial confirmado.",
      );
  }
  if (apply && pending) {
    for (const statement of files[11].sql.split("--> statement-breakpoint"))
      if (statement.trim()) await client.query(statement);
    await client.query(
      "insert into drizzle.__drizzle_migrations(hash,created_at) values($1,$2)",
      [hash(files[11].sql), files[11].when],
    );
  }
  if (apply || !pending) {
    const existing = (
      await client.query(
        "select tablename from pg_tables where schemaname='public' and tablename=any($1)",
        [tables],
      )
    ).rows;
    if (existing.length !== 2)
      throw new Error("Precondición: faltan tablas de proveedores.");
    const constraints = (
      await client.query(
        "select conname from pg_constraint where convalidated and conname=any($1)",
        [
          [
            "supplier_quote_quantity",
            "supplier_quote_price",
            "supplier_quote_unit",
            "supplier_quote_validity",
            "supplier_quote_lead_time",
            "supplier_quote_minimum",
          ],
        ],
      )
    ).rows;
    if (constraints.length !== 6)
      throw new Error("Precondición: faltan restricciones de cotizaciones.");
  }
  await client.query("COMMIT");
  console.log(
    JSON.stringify({
      mode: apply ? "apply" : "preflight",
      migration: "0011_item_sourcing",
      pending: pending && !apply,
      historyVerified: true,
    }),
  );
} catch (error) {
  await client.query("ROLLBACK").catch(() => {});
  console.error(
    error instanceof Error && error.message.startsWith("Precondición:")
      ? error.message
      : "No se confirmó la migración. Se revirtió la transacción si estaba abierta.",
  );
  process.exitCode = 1;
} finally {
  client.release();
  await pool.end();
}
