import { lstatSync, readFileSync, realpathSync } from "node:fs";
import {
  basename,
  dirname,
  isAbsolute,
  relative,
  resolve,
  sep,
} from "node:path";

export const markerName = "manual-day.json";
export type ManualRun = {
  kind: "kybo-manual-day";
  runId: string;
  origin: string;
  revision: string;
  secret: string;
};

export function within(root: string, target: string) {
  const path = relative(resolve(root), resolve(target));
  return (
    path !== "" &&
    !isAbsolute(path) &&
    path !== ".." &&
    !path.startsWith(`..${process.platform === "win32" ? "\\" : "/"}`)
  );
}

export function ownedPath(root: string, ...parts: string[]) {
  const target = resolve(root, ...parts);
  if (!within(root, target)) throw Error("La ruta sale del ensayo.");
  let current = resolve(root);
  for (const part of relative(root, target).split(sep)) {
    current = resolve(current, part);
    try {
      if (lstatSync(current).isSymbolicLink())
        throw Error("El ensayo contiene una redirección de carpeta o archivo.");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") break;
      throw error;
    }
  }
  return target;
}

export function readRun(root: string): ManualRun {
  const canonical = realpathSync(root);
  if (resolve(root).toLowerCase() !== canonical.toLowerCase())
    throw Error(
      "El ensayo debe estar en una carpeta propia, sin redirecciones.",
    );
  if (
    basename(dirname(root)) !== "manual-day" ||
    basename(dirname(dirname(root))) !== ".local"
  )
    throw Error("Carpeta ajena al entorno de ensayo.");
  ownedPath(root, markerName);
  ownedPath(root, "database");
  ownedPath(root, "uploads");
  const run = JSON.parse(
    readFileSync(resolve(root, markerName), "utf8"),
  ) as ManualRun;
  const url = new URL(run.origin);
  if (
    run.kind !== "kybo-manual-day" ||
    run.runId !== basename(root) ||
    !/^\d{8}-\d{6}-[a-f0-9]{8}$/.test(run.runId) ||
    !/^[a-f0-9]{40}$/.test(run.revision) ||
    !/^[a-f0-9]{64}$/.test(run.secret) ||
    url.hostname !== "127.0.0.1" ||
    url.protocol !== "http:" ||
    Number(url.port) < 3100 ||
    Number(url.port) > 3199 ||
    run.origin !== url.origin
  )
    throw Error("Marcador de ensayo inválido.");
  return run;
}

export function childEnvironment(
  root: string,
  inherited: Partial<NodeJS.ProcessEnv> = process.env,
) {
  const run = readRun(root);
  const env: Partial<NodeJS.ProcessEnv> = {};
  for (const key of [
    "PATH",
    "Path",
    "SystemRoot",
    "SYSTEMROOT",
    "WINDIR",
    "windir",
    "COMSPEC",
    "ComSpec",
    "PATHEXT",
    "TEMP",
    "TMP",
    "USERPROFILE",
    "APPDATA",
    "LOCALAPPDATA",
    "ProgramFiles",
    "ProgramData",
  ])
    if (inherited[key]) env[key] = inherited[key];
  return {
    ...env,
    NODE_ENV: "development",
    DATABASE_URL: "",
    KYBO_TEST_DATABASE_URL: "",
    KYBO_LOCAL_DB: resolve(root, "database"),
    KYBO_ALLOW_TEST_MIGRATIONS: "disposable-only",
    KYBO_MANUAL_TEST_ROOT: resolve(root),
    KYBO_MANUAL_TEST_MODE: "1",
    BETTER_AUTH_URL: run.origin,
    BETTER_AUTH_TRUSTED_ORIGINS: run.origin,
    BETTER_AUTH_SECRET: run.secret,
    NEXT_TELEMETRY_DISABLED: "1",
  } satisfies NodeJS.ProcessEnv;
}

export function requireManualRun(
  root = process.env.KYBO_MANUAL_TEST_ROOT ?? "",
) {
  const run = readRun(root);
  if (
    process.env.NODE_ENV !== "development" ||
    process.env.KYBO_MANUAL_TEST_MODE !== "1" ||
    process.env.DATABASE_URL ||
    process.env.KYBO_TEST_DATABASE_URL ||
    process.env.BLOB_READ_WRITE_TOKEN ||
    process.env.BLOB_STORE_ID ||
    process.env.BETTER_AUTH_URL !== run.origin ||
    process.env.BETTER_AUTH_SECRET !== run.secret ||
    resolve(process.env.KYBO_LOCAL_DB ?? "") !== resolve(root, "database")
  )
    throw Error("El proceso no está aislado para pruebas manuales.");
  return { root: resolve(root), run };
}
