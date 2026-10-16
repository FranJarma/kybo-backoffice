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
).entries.filter((e) => e.idx <= 16);
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
    ![16, 17].includes(history.length) ||
    files.length !== 17 ||
    files[16].tag !== "0016_production_result_review"
  )
    throw new Error("Historial de migraciones inesperado.");
  history.forEach((h, i) => {
    if (
      String(h.created_at) !== String(files[i].when) ||
      h.hash !== hash(files[i].sql)
    )
      throw new Error(`Difiere la migración ${i}.`);
  });
  const pending = history.length === 16;
  const constraint = async () =>
    (
      await client.query(
        "select pg_get_constraintdef(oid) as definition from pg_constraint where conrelid='stock_movements'::regclass and conname='stock_movement_nonzero'",
      )
    ).rows[0]?.definition as string | undefined;
  const before = await constraint();
  if (!before || (pending && before.includes("production_review")))
    throw new Error("Restricción inesperada o cambio sin historial.");
  if (apply && pending) {
    await client.query(files[16].sql);
    await client.query(
      "insert into drizzle.__drizzle_migrations(hash,created_at) values($1,$2)",
      [hash(files[16].sql), files[16].when],
    );
  }
  if (
    (apply || !pending) &&
    !(await constraint())?.includes("production_review")
  )
    throw new Error("Falta la restricción de revisión de costo.");
  if (apply || !pending) {
    const definition = (
      await client.query(
        "select pg_get_functiondef('kybo_validate_movement_origin()'::regprocedure) as definition",
      )
    ).rows[0]?.definition as string;
    if (
      !definition.includes("production_review") ||
      !definition.includes("Invalid production valuation correction")
    )
      throw new Error("Falta la validación del origen de la revisión.");
  }
  await client.query("COMMIT");
  console.log(
    JSON.stringify({
      mode: apply ? "apply" : "preflight",
      migration: "0016_production_result_review",
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
