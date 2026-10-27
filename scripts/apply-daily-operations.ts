import { config } from "dotenv";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { Pool } from "pg";

config({ quiet: true });
if (!process.env.DATABASE_URL)
  throw new Error("DATABASE_URL no está configurada.");
const target = 25;
const apply = process.argv.includes("--apply");
const entries = (
  JSON.parse(readFileSync("drizzle/meta/_journal.json", "utf8")).entries as {
    idx: number;
    when: number;
    tag: string;
  }[]
)
  .filter((entry) => entry.idx <= target)
  .map((entry) => ({
    ...entry,
    sql: readFileSync(`drizzle/${entry.tag}.sql`, "utf8"),
  }));
const hash = (value: string) =>
  createHash("sha256").update(value).digest("hex");
const addedTables = [
  "daily_operation_tasks",
  "daily_operation_task_events",
  "daily_operation_task_dependencies",
  "daily_operation_branch_settings",
];
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
      "select hash, created_at from drizzle.__drizzle_migrations order by created_at, id",
    )
  ).rows;
  if (
    ![target, target + 1].includes(history.length) ||
    entries.length !== target + 1 ||
    entries[target].tag !== "0025_daily_operations"
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
  const existingTables: string[] = (
    await client.query(
      "select tablename from pg_tables where schemaname='public' order by tablename",
    )
  ).rows
    .map((row) => row.tablename as string)
    .filter((name) => !addedTables.includes(name));
  async function fingerprints() {
    const result: Record<string, unknown> = {};
    for (const name of existingTables) {
      const quoted = '"' + name.replaceAll('"', '""') + '"';
      result[name] = (
        await client.query(
          `select count(*)::int as count, md5(coalesce(string_agg(to_jsonb(t)::text, '' order by to_jsonb(t)::text),'')) as hash from ${quoted} t`,
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
  const ready = apply || !pending;
  if (ready) {
    for (const name of addedTables)
      await client.query(`select * from "${name}" limit 0`);
    const indexes = (
      await client.query(
        "select indexname from pg_indexes where schemaname='public' and indexname=any($1::text[])",
        [["daily_operation_need", "daily_operation_document"]],
      )
    ).rows;
    if (indexes.length !== 2)
      throw new Error("Faltan las restricciones de tareas únicas.");
  }
  await client.query("COMMIT");
  console.log({
    migration: entries[target].tag,
    pending: !ready,
    applied: apply && pending,
    historyVerified: true,
    existingContentPreserved: apply ? true : "not_modified",
    existingTablesVerified: apply ? existingTables.length : 0,
    moduleReady: ready,
  });
} catch (error) {
  await client.query("ROLLBACK");
  throw error;
} finally {
  client.release();
  await pool.end();
}
