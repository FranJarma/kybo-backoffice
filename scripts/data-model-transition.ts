import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { Pool } from "pg";
import { transitionMappingSchema } from "../src/modules/transition/mapping";
import { preflight } from "../src/modules/transition/preflight";
import { backfill, reconcileCutover } from "../src/modules/transition/backfill";

import { runPreflight } from "./data-model-preflight";
// No dotenv import: the target must be explicitly selected by the operator.
export async function runTransition(args: string[] = process.argv.slice(2)) {
  if (!args.includes("--apply")) return runPreflight(args);
  const mappingIndex = args.indexOf("--mapping");
  if (!args.includes("--apply") || mappingIndex < 0 || !args[mappingIndex + 1])
    throw new Error(
      "Use the read-only preflight first. Applying requires --apply --mapping <reviewed.json>.",
    );
  const connectionString = process.env.KYBO_TRANSITION_DATABASE_URL;
  if (!connectionString)
    throw new Error("Set KYBO_TRANSITION_DATABASE_URL explicitly.");
  const mapping = transitionMappingSchema.parse(
    JSON.parse(readFileSync(args[mappingIndex + 1], "utf8")),
  );
  const hash = (text: string) =>
    createHash("sha256").update(text).digest("hex");
  const journal = JSON.parse(
    readFileSync("drizzle/meta/_journal.json", "utf8"),
  ) as { entries: { idx: number; when: number; tag: string }[] };
  const legacy = journal.entries.filter((e) => e.idx <= 6);
  const expansion = readFileSync("drizzle/0007_data_model_expand.sql", "utf8");
  const finalize = readFileSync("drizzle/0008_data_model_finalize.sql", "utf8");
  const pool = new Pool({ connectionString });
  try {
    const client = await pool.connect();
    try {
      await client.query("BEGIN ISOLATION LEVEL SERIALIZABLE");
      await client.query("SET LOCAL lock_timeout = '10s'");
      await client.query("select pg_advisory_xact_lock(7269260)");
      const applied = await client.query<{ hash: string; created_at: string }>(
        "select hash,created_at from drizzle.__drizzle_migrations order by created_at",
      );
      if (
        applied.rows.length !== legacy.length ||
        legacy.some(
          (e, i) =>
            String(e.when) !== String(applied.rows[i].created_at) ||
            hash(readFileSync(`drizzle/${e.tag}.sql`, "utf8")) !==
              applied.rows[i].hash,
        )
      )
        throw new Error(
          "The existing migration history does not exactly match 0000–0006.",
        );
      // Maintenance mode must stop the old app. Locks also reject racing writers.
      const tables = await client.query<{ tablename: string }>(
        "select tablename from pg_tables where schemaname='public' order by tablename",
      );
      for (const row of tables.rows)
        await client.query(
          `LOCK TABLE public."${row.tablename.replaceAll('"', '""')}" IN ACCESS EXCLUSIVE MODE`,
        );
      const report = await preflight(client, mapping);
      if (!report.ready) throw new Error(report.blockers.join(" "));
      for (const statement of expansion.split("--> statement-breakpoint"))
        if (statement.trim()) await client.query(statement);
      await backfill(client, mapping, hash(JSON.stringify(mapping)));
      await reconcileCutover(client, mapping);
      for (const statement of finalize.split("--> statement-breakpoint"))
        if (statement.trim()) await client.query(statement);
      for (const [idx, sql] of [
        [7, expansion],
        [8, finalize],
      ] as const) {
        const entry = journal.entries.find((e) => e.idx === idx);
        if (!entry) throw new Error("Missing transition journal entry.");
        await client.query(
          "insert into drizzle.__drizzle_migrations(hash,created_at) values($1,$2)",
          [hash(sql), entry.when],
        );
      }
      await client.query(
        "update data_model_state set status='ready' where id=1",
      );
      await client.query("COMMIT");
      console.log(
        "Transition committed after reconciliation. Configure products before reopening sales.",
      );
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  } catch {
    console.error(
      "Transition not confirmed. Verify the read-only report and database status; do not publish connection details.",
    );
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}
if (import.meta.main) await runTransition();
