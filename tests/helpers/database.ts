import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import type { AppDb } from "../../src/db/client";
import * as schema from "../../src/db/schema";

export async function createTestDb(
  logger?: import("drizzle-orm").Logger,
): Promise<{
  db: AppDb;
  close: () => Promise<void>;
}> {
  const client = new PGlite();
  const localDb = drizzle({ client, schema, logger });
  await migrate(localDb, { migrationsFolder: "./drizzle" });
  return { db: localDb as unknown as AppDb, close: () => client.close() };
}
