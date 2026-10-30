import { sql } from "drizzle-orm";
import type { AppDb } from "@/db/client";
import type { Tx } from "@/db/types";
export async function invitationsSchemaReady(db: AppDb | Tx) {
  const result = await db.execute(
    sql`select to_regclass('public.user_invitations') is not null as ready`,
  );
  return result.rows[0]?.ready === true;
}
