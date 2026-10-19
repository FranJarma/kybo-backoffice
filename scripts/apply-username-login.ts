import { config } from "dotenv";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { Pool } from "pg";
config({ quiet: true });
if (!process.env.DATABASE_URL)
  throw new Error("DATABASE_URL no está configurada.");
const apply = process.argv.includes("--apply");
const entries = JSON.parse(readFileSync("drizzle/meta/_journal.json", "utf8"))
  .entries as { idx: number; when: number; tag: string }[];
const files = entries
  .filter((e) => e.idx <= 17)
  .map((e) => ({ ...e, sql: readFileSync(`drizzle/${e.tag}.sql`, "utf8") }));
const hash = (text: string) => createHash("sha256").update(text).digest("hex");
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
  const history = (
    await client.query(
      "select hash,created_at from drizzle.__drizzle_migrations order by created_at",
    )
  ).rows;
  if (
    ![17, 18].includes(history.length) ||
    files.length !== 18 ||
    files[17].tag !== "0017_username_login"
  )
    throw new Error("Historial inesperado.");
  history.forEach((h, i) => {
    if (
      String(h.created_at) !== String(files[i].when) ||
      h.hash !== hash(files[i].sql)
    )
      throw new Error(`Difiere la migración ${i}.`);
  });
  if (apply && history.length === 17) {
    await client.query(files[17].sql);
    await client.query(
      "insert into drizzle.__drizzle_migrations(hash,created_at) values($1,$2)",
      [hash(files[17].sql), files[17].when],
    );
  }
  await client.query("COMMIT");
  console.log({
    migration: "0017_username_login",
    pending: history.length === 17 && !apply,
    historyVerified: true,
  });
} catch (error) {
  await client.query("ROLLBACK");
  throw error;
} finally {
  client.release();
  await pool.end();
}
