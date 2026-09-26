import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { AppShell } from "@/components/app-shell";
import { requireActor } from "@/lib/auth";
import { getDb } from "@/db/client";
import { user } from "@/db/auth-schema";
export default async function SellingLayout({
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
      name={profile?.name ?? "Equipo Kybo"}
      dateLabel={new Intl.DateTimeFormat("es-AR", {
        day: "numeric",
        month: "long",
        timeZone: "America/Argentina/Salta",
      }).format(new Date())}
    >
      {children}
    </AppShell>
  );
}
