import Image from "next/image";
import { redirect } from "next/navigation";
import { requireActor } from "@/lib/auth";
import { safeLoginReturn } from "@/lib/login-return";
import { GuidedOnboarding } from "@/components/identity/guided-onboarding";
import { getDb } from "@/db/client";
import { requireOperationalContext } from "@/modules/branches/context";
import { ATTENDANCE_QR_PATH } from "@/modules/attendance/qr-link";
export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: Promise<{ returnTo?: string }>;
}) {
  const returnTo = safeLoginReturn((await searchParams).returnTo);
  let actor: Awaited<ReturnType<typeof requireActor>>;
  try {
    actor = await requireActor();
    if (actor.accountKind === "store") redirect("/sales");
  } catch (error) {
    if (
      typeof error === "object" &&
      error &&
      "status" in error &&
      error.status === 401
    )
      redirect(`/login?returnTo=${encodeURIComponent(returnTo)}`);
    throw error;
  }
  const destination = new URL(returnTo, "https://kybo.invalid");
  const attendanceBranchId =
    destination.pathname === ATTENDANCE_QR_PATH
      ? (
          await requireOperationalContext(
            await getDb(),
            actor,
            destination.searchParams.get("code")!.split(".")[1],
          )
        ).branchId
      : undefined;
  return (
    <main className="min-h-dvh bg-surface px-5 py-8 sm:py-12">
      <div className="mx-auto max-w-md rounded-2xl border border-line bg-white p-6 sm:p-9">
        <Image
          src="/assets/kybo-logo.png"
          alt="Kybo"
          width={112}
          height={60}
          className="mb-8 h-auto"
          priority
        />
        <GuidedOnboarding
          returnTo={returnTo}
          attendanceBranchId={attendanceBranchId}
        />
      </div>
    </main>
  );
}
