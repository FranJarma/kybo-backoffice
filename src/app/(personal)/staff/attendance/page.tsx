import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { getDb } from "@/db/client";
import { user } from "@/db/auth-schema";
import { branches } from "@/db/branch-schema";
import OperationsLayout from "@/app/(operations)/layout";
import { AttendanceManager } from "@/components/attendance/manager";
import { PersonalFrame } from "@/components/attendance/personal-frame";
import { requirePageActor } from "@/modules/branches/page-context";

export default async function AttendancePage() {
  let actor: Awaited<ReturnType<typeof requirePageActor>>;
  try {
    actor = await requirePageActor();
  } catch (error) {
    if (
      typeof error === "object" &&
      error &&
      "status" in error &&
      error.status === 401
    )
      redirect("/login?returnTo=/staff/attendance");
    throw error;
  }
  if (actor.accountKind === "store") redirect("/staff/attendance/qr");
  const attendance = (
    <AttendanceManager
      key={`${actor.id}:${actor.branchId}`}
      actorId={actor.id}
      branchId={actor.branchId!}
      personalView={actor.role === "staff"}
    />
  );
  if (actor.role !== "staff")
    return <OperationsLayout>{attendance}</OperationsLayout>;
  const db = await getDb();
  const [[person], [branch]] = await Promise.all([
    db.select({ name: user.name }).from(user).where(eq(user.id, actor.id)),
    db
      .select({ name: branches.name })
      .from(branches)
      .where(eq(branches.id, actor.branchId!)),
  ]);
  return (
    <PersonalFrame name={person.name} branchName={branch.name}>
      {attendance}
    </PersonalFrame>
  );
}
