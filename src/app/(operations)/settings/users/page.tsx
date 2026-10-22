import { redirect } from "next/navigation";
import { requireActor } from "@/lib/auth";
import { getDb } from "@/db/client";
import { listUsers } from "@/modules/users/service";
import { UsersManager } from "@/components/users/manager";
export default async function UsersPage() {
  const actor = await requireActor();
  if (actor.role !== "admin") redirect("/sales");
  return <UsersManager initial={await listUsers(await getDb(), actor)} />;
}
