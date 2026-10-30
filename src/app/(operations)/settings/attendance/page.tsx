import { redirect } from "next/navigation";
import { AttendanceManager } from "@/components/attendance/manager";
import { requirePageActor } from "@/modules/branches/page-context";
export default async function SettingsPage() {
  const actor = await requirePageActor();
  if (actor.role !== "admin") redirect("/staff/attendance");
  return (
    <AttendanceManager
      key={`${actor.id}:${actor.branchId}`}
      mode="settings"
      actorId={actor.id}
      branchId={actor.branchId!}
    />
  );
}
