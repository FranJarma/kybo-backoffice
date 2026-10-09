import { redirect } from "next/navigation";
import { requireActor } from "@/lib/auth";
import { shellActor } from "@/modules/branches/page-context";
import { AppShell } from "@/components/app-shell";
import { getDb } from "@/db/client";
import { user } from "@/db/auth-schema";
import { eq } from "drizzle-orm";
import { listAccessibleBranches } from "@/modules/branches/list";
export default async function OperationsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  let actor: Awaited<ReturnType<typeof requireActor>>;
  try {
    actor = await shellActor(await requireActor());
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "status" in error &&
      (error as { status: number }).status === 401
    )
      redirect("/login");
    throw error;
  }

  const [profile] = await (
    await getDb()
  )
    .select({ name: user.name })
    .from(user)
    .where(eq(user.id, actor.id))
    .limit(1);
  const dateLabel = new Intl.DateTimeFormat("es-AR", {
    day: "numeric",
    month: "long",
    timeZone: actor.timeZone ?? "America/Argentina/Buenos_Aires",
  }).format(new Date());
  return (
    <AppShell
      role={actor.role}
      catalogManager={actor.catalogManager}
      name={profile?.name ?? "Equipo Kybo"}
      dateLabel={dateLabel}
      branches={(await listAccessibleBranches(await getDb(), actor)).map(
        ({ id, name }) => ({ id, name }),
      )}
      selectedBranchId={actor.branchId ?? ""}
    >
      {children}
    </AppShell>
  );
}
