import { sql } from "drizzle-orm";
import type { AppDb } from "@/db/client";
import type { Tx } from "@/db/types";
export async function identitySchemaReady(db: AppDb | Tx) {
  const result = await db.execute(
    sql`select to_regclass('public.identity_credentials') is not null and to_regclass('public.attendance_settings') is not null as ready`,
  );
  return result.rows[0]?.ready === true;
}
