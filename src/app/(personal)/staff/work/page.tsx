import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { getDb } from "@/db/client";
import { user } from "@/db/auth-schema";
import { branches } from "@/db/branch-schema";
import { requirePageActor } from "@/modules/branches/page-context";
import { PersonalWork } from "@/components/staff-work/personal";
import { PersonalFrame } from "@/components/attendance/personal-frame";
export default async function PersonalWorkPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  let actor: Awaited<ReturnType<typeof requirePageActor>>;
  try {
    actor = await requirePageActor();
  } catch (e) {
    if (typeof e === "object" && e && "status" in e && e.status === 401)
      redirect("/login?returnTo=/staff/work");
    throw e;
  }
  if (actor.accountKind === "store") redirect("/sales");
  const db = await getDb();
  const [[person], [branch]] = await Promise.all([
    db.select({ name: user.name }).from(user).where(eq(user.id, actor.id)),
    db
      .select({ name: branches.name })
      .from(branches)
      .where(eq(branches.id, actor.branchId!)),
  ]);
  const initialTab =
    (await searchParams).tab === "production" ? "production" : "tasks";
  return (
    <PersonalFrame
      name={person.name}
      branchName={branch.name}
      active={initialTab}
    >
      <PersonalWork
        key={`${actor.id}:${actor.branchId}:${initialTab}`}
        branchId={actor.branchId!}
        actorId={actor.id}
        initialTab={initialTab}
        showTabControls={false}
      />
    </PersonalFrame>
  );
}
