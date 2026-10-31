"use client";
import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowRight, LockKeyhole, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { safeLoginReturn } from "@/lib/login-return";
import { passwordChangeFields } from "@/modules/password-policy/validation";
import type { PasswordPolicyState } from "@/modules/password-policy/types";
import { passwordDeadline } from "@/modules/password-policy/presentation";

export function PasswordForm({
  initial,
  returnTo = "/",
  onboarding = false,
}: {
  initial: PasswordPolicyState;
  returnTo?: string;
  onboarding?: boolean;
}) {
  const router = useRouter();
  const [currentPassword, setCurrent] = useState(""),
    [newPassword, setNew] = useState(""),
    [confirmPassword, setConfirm] = useState("");
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [blocked, setBlocked] = useState(initial.blocked);
  const destination = safeLoginReturn(returnTo);
  const next = onboarding
    ? `/onboarding?returnTo=${encodeURIComponent(destination)}`
    : destination;
  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    const parsed = passwordChangeFields.safeParse({
      currentPassword,
      newPassword,
      confirmPassword,
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0].message);
      return;
    }
    setBusy(true);
    try {
      const response = await fetch("/api/account/password", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          currentPassword: parsed.data.currentPassword,
          newPassword: parsed.data.newPassword,
        }),
      });
      const result = await response.json();
      if (!response.ok) {
        if (result.code === "TEMPORARY_PASSWORD_EXPIRED") setBlocked(true);
        throw new Error(result.error ?? "No pudimos cambiar la contraseña.");
      }
      setCurrent("");
      setNew("");
      setConfirm("");
      router.replace(next);
      router.refresh();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "No hay conexión. Volvé a intentar.",
      );
    } finally {
      setBusy(false);
    }
  }
  if (blocked)
    return (
      <section className="space-y-5" aria-labelledby="password-expired">
        <ShieldAlert className="text-amber-700" size={32} />
        <h1
          id="password-expired"
          className="text-2xl font-extrabold tracking-tight"
        >
          Tu contraseña temporal venció
        </h1>
        <p className="text-sm leading-6 text-muted">
          Pasaron las 24 horas del primer ingreso. Pedí a Administración una
          nueva contraseña temporal para volver a acceder.
        </p>
        <Button asChild variant="outline">
          <Link href="/login">Volver al ingreso</Link>
        </Button>
      </section>
    );
  return (
    <section className="space-y-6">
      <header>
        <span className="mb-4 inline-flex size-12 items-center justify-center rounded-xl bg-blue-50 text-blue">
          <LockKeyhole size={24} />
        </span>
        <p className="text-xs font-bold uppercase tracking-widest text-muted">
          Tu cuenta
        </p>
        <h1 className="mt-2 text-3xl font-extrabold tracking-tight">
          {initial.required ? "Elegí tu nueva contraseña" : "Mi contraseña"}
        </h1>
        <p className="mt-3 text-sm leading-6 text-muted">
          Usá una contraseña que solo conozcas vos. Al cambiarla, se cierran tus
          otras sesiones.
        </p>
      </header>
      {initial.required && (
        <div className="rounded-xl border border-orange-200 bg-orange-50 p-4 text-sm leading-6">
          <strong className="block">
            Estás usando una contraseña temporal
          </strong>
          {initial.expiresAt ? (
            <p>
              Tenés hasta el{" "}
              <strong>{passwordDeadline(initial.expiresAt)}</strong> para
              cambiarla.
            </p>
          ) : (
            <p>El plazo de 24 horas empieza con tu primer ingreso.</p>
          )}
        </div>
      )}
      {!initial.ready ? (
        <p role="alert" className="text-sm text-muted">
          El cambio de contraseña todavía no está habilitado. Consultá con
          Administración.
        </p>
      ) : (
        <form onSubmit={submit} className="space-y-5">
          <fieldset disabled={busy} className="space-y-5">
            <div>
              <Label htmlFor="own-current-password" required>
                Contraseña actual
              </Label>
              <Input
                id="own-current-password"
                className="mt-2 h-12"
                type="password"
                required
                maxLength={128}
                autoComplete="current-password"
                autoFocus
                value={currentPassword}
                onChange={(e) => setCurrent(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="own-new-password" required>
                Nueva contraseña
              </Label>
              <Input
                id="own-new-password"
                className="mt-2 h-12"
                type="password"
                required
                minLength={8}
                maxLength={128}
                autoComplete="new-password"
                value={newPassword}
                onChange={(e) => setNew(e.target.value)}
              />
              <p className="mt-2 text-xs text-muted">
                Al menos 8 caracteres y diferente de la actual.
              </p>
            </div>
            <div>
              <Label htmlFor="own-confirm-password" required>
                Confirmá la nueva contraseña
              </Label>
              <Input
                id="own-confirm-password"
                className="mt-2 h-12"
                type="password"
                required
                minLength={8}
                maxLength={128}
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(e) => setConfirm(e.target.value)}
              />
            </div>
            {error && (
              <p
                role="alert"
                className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800"
              >
                {error}
              </p>
            )}
            <Button type="submit" className="h-12 w-full" disabled={busy}>
              {busy ? "Guardando…" : "Guardar nueva contraseña"}
              <ArrowRight size={17} />
            </Button>
          </fieldset>
        </form>
      )}
      <Button asChild variant="ghost" className="h-11 w-full">
        <Link
          href={next}
          aria-disabled={busy}
          onClick={(e) => {
            if (busy) e.preventDefault();
          }}
        >
          {initial.required ? "Continuar por ahora" : "Volver a Kybo"}
        </Link>
      </Button>
    </section>
  );
}
