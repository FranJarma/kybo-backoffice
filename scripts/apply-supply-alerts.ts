import { config } from "dotenv";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { Pool } from "pg";
config({ quiet: true });
if (!process.env.DATABASE_URL)
  throw new Error("DATABASE_URL no está configurada.");
const target = 26,
  apply = process.argv.includes("--apply");
const entries = (
  JSON.parse(readFileSync("drizzle/meta/_journal.json", "utf8")).entries as {
    idx: number;
    when: number;
    tag: string;
  }[]
)
  .filter((e) => e.idx <= target)
  .map((e) => ({ ...e, sql: readFileSync(`drizzle/${e.tag}.sql`, "utf8") }));
const hash = (value: string) =>
  createHash("sha256").update(value).digest("hex");
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  connectionTimeoutMillis: 15000,
});
const client = await pool.connect();
try {
  await client.query(
    apply ? "BEGIN ISOLATION LEVEL REPEATABLE READ" : "BEGIN READ ONLY",
  );
  await client.query("SET LOCAL lock_timeout='10s'");
  await client.query("SET LOCAL statement_timeout='60s'");
  if (apply) await client.query("select pg_advisory_xact_lock(7269260)");
  if (
    (await client.query("select status from data_model_state where id=1"))
      .rows[0]?.status !== "ready"
  )
    throw new Error("La transición de inventario está pendiente.");
  const history = (
    await client.query(
      "select hash,created_at from drizzle.__drizzle_migrations order by created_at,id",
    )
  ).rows;
  if (
    ![target, target + 1].includes(history.length) ||
    entries.length !== target + 1 ||
    entries[target].tag !== "0026_supply_alerts"
  )
    throw new Error("Historial inesperado; no se aplica ninguna migración.");
  history.forEach((row, i) => {
    if (
      entries[i].idx !== i ||
      row.hash !== hash(entries[i].sql) ||
      String(row.created_at) !== String(entries[i].when)
    )
      throw new Error(`Difiere la migración ${i}; no se modifica la base.`);
  });
  const tables = (
    await client.query(
      "select tablename from pg_tables where schemaname='public' and tablename<>'supply_alert_policies' order by tablename",
    )
  ).rows.map((r) => r.tablename as string);
  async function fingerprints() {
    const result: Record<string, unknown> = {};
    for (const table of tables) {
      const quoted = '"' + table.replaceAll('"', '""') + '"';
      result[table] = (
        await client.query(
          `select count(*)::int as count,md5(coalesce(string_agg(to_jsonb(t)::text,'' order by to_jsonb(t)::text),'')) as hash from ${quoted} t`,
        )
      ).rows[0];
    }
    return result;
  }
  const before = apply ? await fingerprints() : null;
  const pending = history.length === target;
  if (apply && pending) {
    await client.query(entries[target].sql);
    await client.query(
      "insert into drizzle.__drizzle_migrations(hash,created_at) values($1,$2)",
      [hash(entries[target].sql), entries[target].when],
    );
  }
  if (apply && JSON.stringify(await fingerprints()) !== JSON.stringify(before))
    throw new Error("Cambió contenido previo; se revierte la migración.");
  if (apply || !pending) {
    await client.query(
      "select id,branch_id,item_id,daily_consumption,lead_days,safety_days,target_days,enabled,revision,updated_by,updated_at from supply_alert_policies limit 0",
    );
    const index = await client.query(
      "select indexname from pg_indexes where schemaname='public' and indexname='supply_alert_branch_item'",
    );
    if (index.rows.length !== 1)
      throw new Error(
        "Falta la restricción de regla única por sucursal e insumo.",
      );
  }
  await client.query("COMMIT");
  console.log({
    migration: entries[target].tag,
    pending: pending && !apply,
    applied: pending && apply,
    historyVerified: true,
    existingContentPreserved: apply ? true : "not_modified",
    moduleReady: apply || !pending,
  });
} catch (error) {
  await client.query("ROLLBACK");
  // Provider errors may include connection or query details; keep them out of output.
  console.error(
    error instanceof Error && error.constructor === Error
      ? error.message
      : "No se pudo verificar o aplicar la migración0026.",
  );
  process.exitCode = 1;
} finally {
  client.release();
  await pool.end();
}
