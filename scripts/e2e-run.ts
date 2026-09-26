import { mkdtemp, rm, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, basename } from "node:path";
import { randomBytes } from "node:crypto";
import { spawn } from "node:child_process";

// Every run uses its own temporary PostgreSQL database and user. Never test against production.
const directory = await mkdtemp(join(tmpdir(), "kybo-e2e-"));
// A run owns its compiled manifests too; never reuse a previous dev server's output.
const buildDirectory = join(".next-e2e", basename(directory));
const nextEnv = await readFile("next-env.d.ts", "utf8");
const tsConfig = await readFile("tsconfig.json", "utf8");
const password = randomBytes(24).toString("hex");
const baseURL = "http://127.0.0.1:3017";
const env: NodeJS.ProcessEnv = {
  ...process.env,
  DATABASE_URL: "",
  NODE_ENV: "development",
  KYBO_LOCAL_DB: join(directory, "db"),
  BETTER_AUTH_URL: baseURL,
  BETTER_AUTH_SECRET: randomBytes(32).toString("hex"),
  E2E_EMAIL: "owner@kybo.example",
  E2E_STAFF_EMAIL: "staff@kybo.example",
  E2E_SESSION_FILE: join(directory, "admin-session.json"),
  E2E_PASSWORD: password,
  KYBO_NEW_USER_PASSWORD: password,
  E2E_MANAGED: "1",
  E2E_BUILD_DIR: buildDirectory,
};
delete env.PLAYWRIGHT_BASE_URL;

async function run(args: string[]) {
  const child = spawn(process.execPath, args, { stdio: "inherit", env });
  const code = await new Promise<number>((resolve, reject) => {
    child.on("error", reject);
    child.on("exit", (code) => resolve(code ?? 1));
  });
  if (code !== 0) throw new Error(`E2E process failed (${code}).`);
}

try {
  await run(["--import", "tsx", "scripts/migrate.ts"]);
  await run([
    "--import",
    "tsx",
    "scripts/create-user.ts",
    "Kybo Test",
    "owner@kybo.example",
    "admin",
  ]);
  await run([
    "--import",
    "tsx",
    "scripts/create-user.ts",
    "Personal Test",
    "staff@kybo.example",
    "staff",
  ]);
  await run([
    "node_modules/@playwright/test/cli.js",
    "test",
    ...process.argv.slice(2),
  ]);
} catch (error) {
  console.error(error instanceof Error ? error.message : "E2E failed.");
  process.exitCode = 1;
} finally {
  await rm(directory, { recursive: true, force: true });
  await rm(buildDirectory, { recursive: true, force: true });
  await writeFile("next-env.d.ts", nextEnv);
  await writeFile("tsconfig.json", tsConfig);
}
