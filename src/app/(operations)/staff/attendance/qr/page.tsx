import { eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { branches } from "@/db/branch-schema";
import { requirePageActor } from "@/modules/branches/page-context";
import { requireStoreAccount } from "@/modules/workplace/access";
import { AttendanceQrScreen } from "@/components/attendance/qr-screen";
export default async function AttendanceQrPage() {
  const actor = await requirePageActor(),
    db = await getDb();
  const profile = await requireStoreAccount(db, actor);
  const [branch] = await db
    .select({ name: branches.name })
    .from(branches)
    .where(eq(branches.id, profile.branchId));
  return (
    <AttendanceQrScreen branchId={profile.branchId} branchName={branch.name} />
  );
}
