import Link from "next/link";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { user } from "@/db/auth-schema";
import { branches } from "@/db/branch-schema";
import { requireActor } from "@/lib/auth";
import { requireOperationalContext } from "@/modules/branches/context";
import {
  attendanceQrCodePattern,
  attendanceQrPath,
} from "@/modules/attendance/qr-link";
import { PersonalFrame } from "@/components/attendance/personal-frame";
import { AttendanceManager } from "@/components/attendance/manager";
export default async function AttendanceScanPage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string }>;
}) {
  const { code } = await searchParams;
  if (!code || !attendanceQrCodePattern.test(code))
    return (
      <main className="mx-auto max-w-md p-8">
        <h1 className="text-2xl font-bold">El QR no es válido.</h1>
        <p className="mt-4 text-muted">
          Escaneá el código actual de la PC o tablet del local.
        </p>
        <Link className="mt-6 block text-blue-600" href="/staff/attendance">
          Ver mi jornada
        </Link>
      </main>
    );
  const returnTo = attendanceQrPath(code);
  let actor: Awaited<ReturnType<typeof requireActor>>;
  try {
    actor = await requireActor();
  } catch (e) {
    if (typeof e === "object" && e && "status" in e && e.status === 401)
      redirect(`/login?returnTo=${encodeURIComponent(returnTo)}`);
    throw e;
  }
  if (actor.accountKind === "store") redirect("/staff/attendance/qr");
  const db = await getDb(),
    ctx = await requireOperationalContext(db, actor, code.split(".")[1]);
  const [[person], [branch]] = await Promise.all([
    db.select({ name: user.name }).from(user).where(eq(user.id, actor.id)),
    db
      .select({ name: branches.name })
      .from(branches)
      .where(eq(branches.id, ctx.branchId)),
  ]);
  return (
    <PersonalFrame name={person.name} branchName={branch.name}>
      <Link
        className="mb-4 inline-block text-xs font-semibold text-blue-600"
        href={`/login?returnTo=${encodeURIComponent(returnTo)}`}
      >
        Usar otra cuenta
      </Link>
      <AttendanceManager
        key={`${actor.id}:${ctx.branchId}:${code}`}
        actorId={actor.id}
        branchId={ctx.branchId}
        qrCode={code}
        personalView
      />
    </PersonalFrame>
  );
}
