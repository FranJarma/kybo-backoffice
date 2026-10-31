import Image from "next/image";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getDb } from "@/db/client";
import { getAuth } from "@/lib/auth";
import { safeLoginReturn } from "@/lib/login-return";
import { passwordActor } from "@/modules/password-policy/http";
import { passwordPolicyState } from "@/modules/password-policy/service";
import { PasswordForm } from "@/components/account/password-form";
export default async function PasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ returnTo?: string; onboarding?: string }>;
}) {
  const [db, auth, params, requestHeaders] = await Promise.all([
    getDb(),
    getAuth(),
    searchParams,
    headers(),
  ]);
  let actor;
  try {
    actor = await passwordActor(db, auth, requestHeaders);
  } catch (error) {
    if (
      typeof error === "object" &&
      error &&
      "status" in error &&
      error.status === 401
    )
      redirect("/login?returnTo=/account/password");
    if (
      typeof error === "object" &&
      error &&
      "status" in error &&
      error.status === 403
    )
      redirect("/sales");
    throw error;
  }
  return (
    <main className="flex min-h-dvh items-center justify-center bg-surface px-4 py-8">
      <div className="w-full max-w-lg rounded-2xl border border-line bg-white p-6 shadow-sm sm:p-9">
        <Image
          src="/assets/kybo-logo.png"
          width={112}
          height={60}
          alt="Kybo"
          className="mb-7 h-auto w-24"
          priority
        />
        <PasswordForm
          initial={await passwordPolicyState(db, actor.id)}
          returnTo={safeLoginReturn(params.returnTo)}
          onboarding={params.onboarding === "1"}
        />
      </div>
    </main>
  );
}
