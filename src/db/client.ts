import { PGlite } from "@electric-sql/pglite";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import { drizzle as drizzlePg } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

export type AppDb = ReturnType<typeof drizzlePg<typeof schema>>;

type DatabaseState = {
  connection?: Promise<AppDb>;
  close?: () => Promise<void>;
};
const globalDb = globalThis as typeof globalThis & {
  __kyboDatabase?: DatabaseState;
};
const state = (globalDb.__kyboDatabase ??= {});

export async function getDb(): Promise<AppDb> {
  if (!state.connection)
    state.connection = connect().catch((error: unknown) => {
      state.connection = undefined;
      throw error;
    });
  return state.connection;
}

async function connect(): Promise<AppDb> {
  if (process.env.DATABASE_URL) {
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    state.close = () => pool.end();
    return drizzlePg({ client: pool, schema });
  }

  if (process.env.NODE_ENV !== "production" && process.env.KYBO_LOCAL_DB) {
    const client = new PGlite(process.env.KYBO_LOCAL_DB);
    await client.waitReady;
    state.close = () => client.close();
    // Both drivers use Drizzle's PostgreSQL query builders; PGlite is only used locally.
    return drizzlePglite({ client, schema }) as unknown as AppDb;
  }

  throw new Error(
    "DATABASE_URL is required (or explicitly configure KYBO_LOCAL_DB outside production).",
  );
}

export async function closeDb(): Promise<void> {
  if (state.connection) await state.connection;
  await state.close?.();
  state.connection = undefined;
  state.close = undefined;
}
