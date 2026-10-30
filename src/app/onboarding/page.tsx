import Image from "next/image";
import { redirect } from "next/navigation";
import { requireActor } from "@/lib/auth";
import { safeLoginReturn } from "@/lib/login-return";
import { GuidedOnboarding } from "@/components/identity/guided-onboarding";
export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: Promise<{ returnTo?: string }>;
}) {
  const returnTo = safeLoginReturn((await searchParams).returnTo);
  try {
    const actor = await requireActor();
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
        <GuidedOnboarding returnTo={returnTo} />
      </div>
    </main>
  );
}
