import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { AppShell } from "@/components/app-shell";
import { requireActor } from "@/lib/auth";
import { shellActor } from "@/modules/branches/page-context";
import { getDb } from "@/db/client";
import { user } from "@/db/auth-schema";
import { listAccessibleBranches } from "@/modules/branches/list";
export default async function SellingLayout({
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
      error &&
      "status" in error &&
      error.status === 401
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
  return (
    <AppShell
      role={actor.role}
      catalogManager={actor.catalogManager}
      name={profile?.name ?? "Equipo Kybo"}
      branches={(await listAccessibleBranches(await getDb(), actor)).map(
        ({ id, name }) => ({ id, name }),
      )}
      selectedBranchId={actor.branchId ?? ""}
      dateLabel={new Intl.DateTimeFormat("es-AR", {
        day: "numeric",
        month: "long",
        timeZone: actor.timeZone ?? "America/Argentina/Buenos_Aires",
      }).format(new Date())}
    >
      {children}
    </AppShell>
  );
}
