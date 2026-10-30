import { redirect } from "next/navigation";
import { AttendanceManager } from "@/components/attendance/manager";
import { requirePageActor } from "@/modules/branches/page-context";
export default async function SchedulePage() {
  const actor = await requirePageActor();
  if (actor.role === "staff") redirect("/staff/attendance");
  return (
    <AttendanceManager
      key={`${actor.id}:${actor.branchId}`}
      mode="planning"
      actorId={actor.id}
      branchId={actor.branchId!}
    />
  );
}
