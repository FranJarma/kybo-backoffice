"use client";
import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { LockKeyhole } from "lucide-react";
import type { PasswordPolicyState } from "@/modules/password-policy/types";
import { passwordChangeLocation } from "@/modules/password-policy/validation";
import { passwordDeadline } from "@/modules/password-policy/presentation";
export function PasswordReminder({
  state,
  returnTo = "/",
}: {
  state: PasswordPolicyState;
  returnTo?: string;
}) {
  if (!state.required) return null;
  return (
    <aside
      role="status"
      className="mx-auto mb-4 flex max-w-[1400px] flex-wrap items-center gap-3 rounded-xl border border-orange-200 bg-orange-50 p-4 text-sm text-brand"
    >
      <LockKeyhole size={20} className="shrink-0 text-accent" />
      <div className="min-w-0 flex-1">
        <strong className="block">Cambiá tu contraseña temporal</strong>
        <p className="mt-1 text-xs leading-5 text-muted">
          {state.expiresAt
            ? `El acceso vence el ${passwordDeadline(state.expiresAt)} si no la cambiás.`
            : "Tenés 24 horas desde tu primer ingreso."}
        </p>
      </div>
      <Link
        href={passwordChangeLocation(returnTo)}
        className="inline-flex min-h-11 items-center rounded-lg border border-orange-300 bg-white px-4 font-bold text-brand hover:bg-orange-100"
      >
        Cambiar contraseña
      </Link>
    </aside>
  );
}
export function PasswordNotice() {
  const [state, setState] = useState<PasswordPolicyState | null>(null);
  const pathname = usePathname(),
    router = useRouter();
  useEffect(() => {
    const abort = new AbortController();
    let pending = false;
    let timer: ReturnType<typeof setInterval> | undefined;
    async function refresh() {
      if (
        pending ||
        document.visibilityState === "hidden" ||
        abort.signal.aborted
      )
        return;
      pending = true;
      try {
        const response = await fetch("/api/account/password", {
          credentials: "same-origin",
          cache: "no-store",
          signal: abort.signal,
        });
        if (!response.ok) return;
        const value = (await response.json()) as PasswordPolicyState;
        if (abort.signal.aborted) return;
        setState(value);
        if (!value.required && timer) {
          clearInterval(timer);
          timer = undefined;
        }
        if (value.blocked) {
          router.replace("/account/password");
          router.refresh();
        }
      } catch {
        /* The live server gate remains authoritative while offline. */
      } finally {
        pending = false;
      }
    }
    const resume = () => {
      void refresh();
    };
    void refresh();
    timer = setInterval(resume, 20000);
    window.addEventListener("focus", resume);
    document.addEventListener("visibilitychange", resume);
    return () => {
      abort.abort();
      clearInterval(timer);
      window.removeEventListener("focus", resume);
      document.removeEventListener("visibilitychange", resume);
    };
  }, [router]);
  return state ? <PasswordReminder state={state} returnTo={pathname} /> : null;
}
