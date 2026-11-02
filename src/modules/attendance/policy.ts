import { getTableColumns, sql } from "drizzle-orm";
import type { AppDb } from "@/db/client";
import type { Tx } from "@/db/types";
import { attendanceSettings } from "@/db/attendance-schema";

// Whole-row extraction also works before 0034; absence must keep proximity on.
export const attendancePolicyFields = {
  ...getTableColumns(attendanceSettings),
  requireLocation: sql<boolean>`coalesce((to_jsonb(${attendanceSettings})->>'require_location')::boolean, true)`,
};

export async function attendanceLocationSchemaReady(db: AppDb | Tx) {
  const result = await db.execute(sql`select exists (
    select 1 from pg_attribute
    where attrelid = to_regclass('public.attendance_settings')
      and attname = 'require_location' and not attisdropped
  ) as ready`);
  return result.rows[0]?.ready === true;
}
