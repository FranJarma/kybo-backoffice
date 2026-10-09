import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
import { drizzle } from "drizzle-orm/pglite";
import type { PoolClient } from "pg";
import type { AppDb } from "../../src/db/client";
import * as schema from "../../src/db/schema";
import {
  prepareEmptyTestDatabase,
  requireMigrationTestPermission,
} from "./data-model-fixture";
export async function createDataModelTestContext(
  options: { legacyCatalog?: boolean } = {},
) {
  requireMigrationTestPermission();
  const client = new PGlite();
  try {
    const fixture = await prepareEmptyTestDatabase(
      client as unknown as PoolClient,
    );
    if (!options.legacyCatalog) {
      await client.exec(
        await readFile("drizzle/0009_product_catalog.sql", "utf8"),
      );
    }
    return {
      ...fixture,
      client,
      db: drizzle({ client, schema }) as unknown as AppDb,
      close: () => client.close(),
    };
  } catch (error) {
    await client.close();
    throw error;
  }
}
