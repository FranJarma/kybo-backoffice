import { config } from "dotenv";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { Pool } from "pg";
config({ quiet: true });
if (!process.env.DATABASE_URL)
  throw new Error("DATABASE_URL no está configurada.");
const apply = process.argv.includes("--apply");
if (apply && process.env.KYBO_ALLOW_CASH_MIGRATIONS !== "0028-and-0029")
  throw new Error(
    "Aplicar 0028/0029 requiere autorización explícita y KYBO_ALLOW_CASH_MIGRATIONS=0028-and-0029.",
  );
const entries = (
  JSON.parse(readFileSync("drizzle/meta/_journal.json", "utf8")).entries as {
    idx: number;
    when: number;
    tag: string;
  }[]
)
  .filter((entry) => entry.idx <= 29)
  .map((entry) => ({
    ...entry,
    sql: readFileSync(`drizzle/${entry.tag}.sql`, "utf8"),
  }));
if (
  entries.length !== 30 ||
  entries[28].tag !== "0028_cash_register" ||
  entries[29].tag !== "0029_purchase_advances"
)
  throw new Error("El paquete no corresponde a las migraciones autorizadas.");
const hash = (sql: string) => createHash("sha256").update(sql).digest("hex");
const quote = (name: string) => `"${name.replaceAll('"', '""')}"`;
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
  if (apply) await client.query("select pg_advisory_xact_lock(7269289)");
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
  if (![28, 29, 30].includes(history.length))
    throw new Error("Historial inesperado; no se modifica la base.");
  history.forEach((row, index) => {
    if (
      entries[index].idx !== index ||
      row.hash !== hash(entries[index].sql) ||
      String(row.created_at) !== String(entries[index].when)
    )
      throw new Error(`Difiere la migración ${index}; no se modifica la base.`);
  });
  const pending = entries.slice(history.length);
  const schema = (
    await client.query(
      "select to_regclass('public.cash_sessions') as cash,to_regclass('public.purchase_advances') as advances",
    )
  ).rows[0];
  if (
    (history.length < 29 && schema.cash) ||
    (history.length < 30 && schema.advances)
  )
    throw new Error(
      "Hay estructuras nuevas sin su registro de migración. Se requiere revisión.",
    );
  const existing = (
    await client.query(
      "select table_name,column_name from information_schema.columns where table_schema='public' order by table_name,ordinal_position",
    )
  ).rows as { table_name: string; column_name: string }[];
  const projections = new Map<string, string[]>();
  for (const row of existing)
    projections.set(row.table_name, [
      ...(projections.get(row.table_name) ?? []),
      row.column_name,
    ]);
  async function fingerprint() {
    const result: Record<string, unknown> = {};
    // Project precisely the columns that existed before DDL: adding nullable source
    // is permitted, but changing any historical financial value is not.
    for (const [table, columns] of projections)
      result[table] = (
        await client.query(
          `select count(*)::int as count,md5(coalesce(string_agg(to_jsonb(t)::text,'' order by to_jsonb(t)::text),'')) as hash from (select ${columns.map(quote).join(",")} from ${quote(table)}) t`,
        )
      ).rows[0];
    return result;
  }
  const before = apply ? await fingerprint() : null;
  if (apply)
    for (const entry of pending) {
      await client.query(entry.sql);
      await client.query(
        "insert into drizzle.__drizzle_migrations(hash,created_at) values($1,$2)",
        [hash(entry.sql), entry.when],
      );
    }
  if (apply && JSON.stringify(await fingerprint()) !== JSON.stringify(before))
    throw new Error(
      "Cambió contenido histórico; se revierte el paquete completo.",
    );
  if (apply || pending.length === 0) {
    await client.query(
      "select id,branch_id,state,counted,posnet from cash_sessions limit 0",
    );
    await client.query(
      "select id,amount,applied_amount,source from purchase_advances limit 0",
    );
    await client.query("select source from purchase_payments limit 0");
    const index = (
      await client.query(
        "select indexname from pg_indexes where schemaname='public' and indexname='cash_one_open'",
      )
    ).rows;
    if (index.length !== 1)
      throw new Error(
        "Falta la protección de una sola caja abierta por sucursal.",
      );
  }
  await client.query("COMMIT");
  console.log({
    migrations: ["0028_cash_register", "0029_purchase_advances"],
    pending: apply ? [] : pending.map((entry) => entry.tag),
    applied: apply ? pending.map((entry) => entry.tag) : [],
    historyVerified: true,
    existingContentPreserved: apply ? true : "not_modified",
    moduleReady: apply || pending.length === 0,
  });
} catch (error) {
  await client.query("ROLLBACK");
  console.error(
    error instanceof Error && error.constructor === Error
      ? error.message
      : "No se pudo verificar o aplicar Caja y anticipos. No se confirmó ningún cambio.",
  );
  process.exitCode = 1;
} finally {
  client.release();
  await pool.end();
}
