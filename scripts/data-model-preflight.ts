import { readFileSync, writeFileSync } from "node:fs";
import { Pool } from "pg";
import { transitionMappingSchema } from "../src/modules/transition/mapping";
import { preflight } from "../src/modules/transition/preflight";
export async function runPreflight(args: string[] = process.argv.slice(2)) {
  const option = (name: string) => {
    const index = args.indexOf(name);
    return index < 0 ? undefined : args[index + 1];
  };
  const connectionString = process.env.KYBO_TRANSITION_DATABASE_URL;
  if (!connectionString)
    throw new Error(
      "Set KYBO_TRANSITION_DATABASE_URL explicitly. No fallback to the application database.",
    );
  const mappingPath = option("--mapping"),
    output = option("--output");
  const mapping = mappingPath
    ? transitionMappingSchema.parse(
        JSON.parse(readFileSync(mappingPath, "utf8")),
      )
    : undefined;
  const pool = new Pool({ connectionString });
  try {
    const client = await pool.connect();
    try {
      await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
      const report = await preflight(client, mapping);
      await client.query("ROLLBACK");
      if (output) writeFileSync(output, JSON.stringify(report, null, 2) + "\n");
      console.log(
        JSON.stringify(
          {
            ready: report.ready,
            blockers: report.blockers,
            counts: report.counts,
            reportFile: output ?? null,
          },
          null,
          2,
        ),
      );
      if (!report.ready) process.exitCode = 2;
    } finally {
      client.release();
    }
  } catch {
    console.error(
      "No se pudo completar el informe. No se aplicaron cambios; revisá conexión y permisos sin publicar credenciales.",
    );
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}
if (import.meta.main) await runPreflight();
