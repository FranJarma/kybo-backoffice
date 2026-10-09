// Additive migration only; never replay the multi-branch transition.
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
).entries.filter((e) => e.idx <= 12);
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
    throw new Error("Precondición: transición anterior pendiente.");
  const history = (
    await client.query(
      "select hash,created_at from drizzle.__drizzle_migrations order by created_at",
    )
  ).rows;
  if (
    ![12, 13].includes(history.length) ||
    files.length !== 13 ||
    files[12].tag !== "0012_purchase_shipping"
  )
    throw new Error("Precondición: historial inesperado.");
  history.forEach((h, i) => {
    if (
      String(h.created_at) !== String(files[i].when) ||
      h.hash !== hash(files[i].sql)
    )
      throw new Error(`Precondición: difiere la migración ${i}.`);
  });
  const pending = history.length === 12;
  const columns = await client.query(
    "select column_name from information_schema.columns where table_schema='public' and table_name='purchase_receipts' and column_name='shipping_amount'",
  );
  if (pending && columns.rowCount)
    throw new Error("Precondición: campos de envío existentes sin historial.");
  if (apply && pending) {
    for (const statement of files[12].sql.split("--> statement-breakpoint"))
      if (statement.trim()) await client.query(statement);
    await client.query(
      "insert into drizzle.__drizzle_migrations(hash,created_at) values($1,$2)",
      [hash(files[12].sql), files[12].when],
    );
  }
  if (apply || !pending) {
    const checks = (
      await client.query(
        "select conname from pg_constraint where convalidated and conname=any($1)",
        [
          [
            "receipt_shipping_valid",
            "receipt_shipping_paid_limit",
            "receipt_line_shipping_valid",
            "payment_target_valid",
            "purchase_receipts_shipping_supplier_id_suppliers_id_fk",
          ],
        ],
      )
    ).rows;
    if (checks.length !== 5)
      throw new Error("Precondición: faltan restricciones de envío.");
  }
  await client.query("COMMIT");
  console.log(
    JSON.stringify({
      mode: apply ? "apply" : "preflight",
      migration: "0012_purchase_shipping",
      pending: pending && !apply,
      historyVerified: true,
    }),
  );
} catch (error) {
  await client.query("ROLLBACK").catch(() => {});
  console.error(
    error instanceof Error && error.message.startsWith("Precondición:")
      ? error.message
      : "No se confirmó la migración. La transacción fue revertida si estaba abierta.",
  );
  process.exitCode = 1;
} finally {
  client.release();
  await pool.end();
}
