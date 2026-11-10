import { readdir, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { resolve } from "node:path";
import { childEnvironment, readRun } from "./environment";

const root = resolve(process.argv[2] ?? ".."),
  run = readRun(root),
  app = resolve(root, "app");
if (resolve(process.cwd()) !== app)
  throw Error("Arrancá desde la instantánea del ensayo.");
if (
  (await readdir(app)).some(
    (name) => name.startsWith(".env") && name !== ".env.example",
  )
)
  throw Error(
    "Se encontró un archivo .env en la copia de pruebas. No se inicia.",
  );
const port = new URL(run.origin).port;
await new Promise<void>((done, fail) => {
  const probe = createServer();
  probe.once("error", () =>
    fail(
      Error(
        `El puerto ${port} está ocupado; no se detiene ni reemplaza su proceso.`,
      ),
    ),
  );
  probe.listen(Number(port), "127.0.0.1", () => probe.close(() => done()));
});
const child = spawn(
  process.execPath,
  [
    resolve(app, "node_modules/next/dist/bin/next"),
    "dev",
    app,
    "--turbopack",
    "--hostname",
    "127.0.0.1",
    "--port",
    port,
  ],
  {
    cwd: app,
    env: childEnvironment(root),
    stdio: "inherit",
    windowsHide: true,
  },
);
child.on("error", (error) => {
  console.error(error.message);
  process.exitCode = 1;
});
if (child.pid)
  await writeFile(
    resolve(root, "processes.json"),
    JSON.stringify(
      {
        runId: run.runId,
        wrapper: process.pid,
        child: child.pid,
        startedAt: new Date().toISOString(),
      },
      null,
      2,
    ),
  );
child.on("exit", (code) => {
  process.exitCode = code ?? 1;
});
process.on("SIGTERM", () => child.kill());
process.on("SIGINT", () => child.kill());
