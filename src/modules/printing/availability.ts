import { sql } from "drizzle-orm";
import type { AppDb } from "@/db/client";
import type { Tx } from "@/db/types";
export async function printingAvailable(db: AppDb | Tx) {
  const result = await db.execute(
    sql`select to_regclass('public.printing_settings') is not null and to_regclass('public.print_jobs') is not null and to_regclass('public.printing_requests') is not null as ready`,
  );
  return result.rows[0]?.ready === true;
}
