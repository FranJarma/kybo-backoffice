import { redirect } from "next/navigation";
import { requireActor } from "@/lib/auth";
import { AppShell } from "@/components/app-shell";
import { getDb } from "@/db/client";
import { user } from "@/db/auth-schema";
import { eq } from "drizzle-orm";
export default async function OperationsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  let actor: Awaited<ReturnType<typeof requireActor>>;
  try {
    actor = await requireActor();
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
  if (actor.role === "staff") redirect("/sales");
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
    timeZone: "America/Argentina/Salta",
  }).format(new Date());
  return (
    <AppShell
      role={actor.role}
      name={profile?.name ?? "Equipo Kybo"}
      dateLabel={dateLabel}
    >
      {children}
    </AppShell>
  );
}
