import { mkdirSync, writeFileSync, symlinkSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { resolve } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import {
  childEnvironment,
  readRun,
  requireManualRun,
  within,
} from "../scripts/manual-day/environment";
import { photoStorage } from "../scripts/manual-day/photo-storage";

function fixture() {
  const id = `20261105-120000-${randomBytes(4).toString("hex")}`;
  const root = resolve(".local/manual-day", id);
  mkdirSync(root, { recursive: true });
  const run = {
    kind: "kybo-manual-day",
    runId: id,
    origin: "http://127.0.0.1:3100",
    secret: randomBytes(32).toString("hex"),
    revision: "a".repeat(40),
  };
  writeFileSync(resolve(root, "manual-day.json"), JSON.stringify(run));
  return { root, run };
}
afterEach(() => vi.unstubAllEnvs());

it("constructs a clean child environment without inherited provider credentials or Node options", () => {
  const { root } = fixture();
  const env = childEnvironment(root, {
    PATH: "node",
    DATABASE_URL: "postgres://forbidden.invalid/real",
    BLOB_READ_WRITE_TOKEN: "forbidden",
    VERCEL_OIDC_TOKEN: "forbidden",
    NODE_OPTIONS: "--env-file=forbidden.env",
    KYBO_GEOCODER_URL: "https://forbidden.invalid",
    HTTP_PROXY: "forbidden",
  });
  expect(env.DATABASE_URL).toBe("");
  expect(env.KYBO_LOCAL_DB).toBe(resolve(root, "database"));
  for (const key of [
    "BLOB_READ_WRITE_TOKEN",
    "VERCEL_OIDC_TOKEN",
    "NODE_OPTIONS",
    "KYBO_GEOCODER_URL",
    "HTTP_PROXY",
  ])
    expect(env).not.toHaveProperty(key);
});

it("refuses non-loopback URLs and missing ownership markers", () => {
  const { root, run } = fixture();
  writeFileSync(
    resolve(root, "manual-day.json"),
    JSON.stringify({ ...run, origin: "https://production.invalid" }),
  );
  expect(() => readRun(root)).toThrow();
  expect(() => readRun(resolve(root, "absent"))).toThrow();
  expect(within(root, resolve(root, "../another"))).toBe(false);
});

it("rejects a database directory redirected outside its run", () => {
  const { root } = fixture();
  const external = resolve(
    ".local/manual-day",
    `outside-${randomBytes(4).toString("hex")}`,
  );
  mkdirSync(external);
  symlinkSync(external, resolve(root, "database"), "junction");
  expect(() => childEnvironment(root)).toThrow(/redireccion|ensayo/i);
});

it("revalidates database and runtime identity before allowing file storage", async () => {
  const { root } = fixture();
  for (const [key, value] of Object.entries(childEnvironment(root)))
    vi.stubEnv(key, value);
  requireManualRun(root);
  const store = photoStorage();
  const key = "cash/branch/session/test.webp";
  await store.put(key, Buffer.from("synthetic receipt"));
  expect(await new Response(await store.get(key)).text()).toBe(
    "synthetic receipt",
  );
  await expect(store.put(key, Buffer.from("replacement"))).rejects.toThrow();
  await expect(
    store.put("../../outside.webp", Buffer.from("no")),
  ).rejects.toThrow();
  vi.stubEnv("DATABASE_URL", "postgres://forbidden.invalid/real");
  await expect(store.get(key)).rejects.toThrow(/aislado/);
  vi.stubEnv("DATABASE_URL", "");
  vi.stubEnv("NODE_ENV", "production");
  expect(() => photoStorage()).toThrow(/aislado/);
});
