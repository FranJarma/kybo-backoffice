import { eq } from "drizzle-orm";
import type { AppDb } from "@/db/client";
import type { Tx } from "@/db/types";
import { attendanceSettings } from "@/db/attendance-schema";
import { identitySchemaReady } from "./availability";
/** Installation alone must not activate new restrictions on existing cash/production. */
export async function identityRequired(db: AppDb | Tx, branchId: string) {
  if (!(await identitySchemaReady(db))) return false;
  const [policy] = await db
    .select({ required: attendanceSettings.requireStepUp })
    .from(attendanceSettings)
    .where(eq(attendanceSettings.branchId, branchId))
    .for("share");
  return policy?.required === true;
}
