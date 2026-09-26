import "dotenv/config";
import { PGlite } from "@electric-sql/pglite";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import { migrate as migratePglite } from "drizzle-orm/pglite/migrator";
import { drizzle as drizzlePg } from "drizzle-orm/node-postgres";
import { migrate as migratePg } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";

const migrationsFolder = "./drizzle";

if (process.env.DATABASE_URL) {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    await migratePg(drizzlePg({ client: pool }), { migrationsFolder });
  } finally {
    await pool.end();
  }
} else if (process.env.NODE_ENV !== "production" && process.env.KYBO_LOCAL_DB) {
  const client = new PGlite(process.env.KYBO_LOCAL_DB);
  try {
    await migratePglite(drizzlePglite({ client }), { migrationsFolder });
  } finally {
    await client.close();
  }
} else {
  throw new Error(
    "Set DATABASE_URL or explicit KYBO_LOCAL_DB (development only).",
  );
}

console.log("Migrations applied.");
