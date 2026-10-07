import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "../../src/db/schema";
import {
  prepareEmptyTestDatabase,
  requireMigrationTestPermission,
} from "./data-model-fixture";
export async function createDedicatedTestContext() {
  requireMigrationTestPermission();
  const connectionString = process.env.KYBO_TEST_DATABASE_URL;
  if (!connectionString)
    throw new Error(
      "Falta KYBO_TEST_DATABASE_URL; no se usa DATABASE_URL como alternativa.",
    );
  const url = new URL(connectionString);
  if (
    !/^\/kybo_test_[a-z0-9_]+$/i.test(url.pathname) ||
    connectionString === process.env.DATABASE_URL
  )
    throw new Error(
      "El destino debe ser una base vacía y exclusiva con prefijo kybo_test_.",
    );
  const pool = new Pool({ connectionString, max: 3 }),
    client = await pool.connect();
  try {
    const fixture = await prepareEmptyTestDatabase(client);
    client.release();
    return {
      ...fixture,
      db: drizzle({ client: pool, schema }),
      secondDb: drizzle({ client: pool, schema }),
      close: () => pool.end(),
    };
  } catch (error) {
    client.release();
    await pool.end();
    throw error;
  }
}
