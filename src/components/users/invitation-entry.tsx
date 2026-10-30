"use client";
import Image from "next/image";
import { useSyncExternalStore } from "react";
import { LoginForm } from "@/components/login-form";
const subscribe = (refresh: () => void) => {
  window.addEventListener("hashchange", refresh);
  return () => window.removeEventListener("hashchange", refresh);
};
export function InvitationEntry() {
  const token = useSyncExternalStore(
    subscribe,
    () => window.location.hash.slice(1),
    () => "",
  );
  const valid = /^[A-Za-z0-9_-]{32,256}$/.test(token);
  return (
    <main className="flex min-h-dvh items-center justify-center bg-surface px-5 py-8">
      <section className="w-full max-w-md rounded-2xl border border-line bg-white p-7 sm:p-9">
        <Image
          src="/assets/kybo-logo.png"
          alt="Kybo"
          width={112}
          height={60}
          className="mb-7 h-auto"
          priority
        />
        <p className="text-xs font-bold uppercase tracking-[.15em] text-blue-600">
          BIENVENIDA AL EQUIPO
        </p>
        <h1 className="mt-3 text-3xl font-extrabold tracking-tight text-brand">
          Tu acceso a Kybo.
        </h1>
        <p className="mb-7 mt-3 leading-7 text-muted">
          Ingresá con el usuario y la contraseña del mensaje. Después te
          ayudamos a activar la verificación de tu celular.
        </p>
        {valid ? (
          <LoginForm returnTo="/staff/attendance" invitationToken={token} />
        ) : (
          <p
            role="alert"
            className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-950"
          >
            Abrí el enlace completo que te compartió Administración. Si no lo
            tenés, pedí una nueva invitación.
          </p>
        )}
      </section>
    </main>
  );
}
