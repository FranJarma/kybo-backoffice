import Image from "next/image";
import type { Metadata } from "next";
import { PasswordRecoveryForm } from "@/components/password-recovery-form";
import { safeLoginReturn } from "@/lib/login-return";
export const metadata: Metadata = {
  title: "Recuperar contraseña · Kybo",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};
export default async function RecoverPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ returnTo?: string }>;
}) {
  const returnTo = safeLoginReturn((await searchParams).returnTo);
  return (
    <main className="min-h-dvh bg-white px-6 py-8 sm:px-10">
      <div className="mx-auto w-full max-w-md">
        <div className="mb-12 flex items-center gap-4">
          <Image
            src="/assets/kybo-logo.png"
            width={112}
            height={60}
            alt="Kybo"
            preload
            className="h-auto w-28"
          />
          <span className="border-l border-line py-2 pl-4 text-sm font-semibold text-brand">
            Operations
          </span>
        </div>
        <h1 className="text-3xl font-extrabold tracking-tight text-brand">
          Recuperá tu acceso
        </h1>
        <p className="mb-8 mt-3 text-base leading-7 text-muted">
          Validá tu cuenta con un código por correo y elegí una contraseña
          nueva.
        </p>
        <PasswordRecoveryForm returnTo={returnTo} />
      </div>
    </main>
  );
}
