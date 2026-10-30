"use client";
import { useState, useSyncExternalStore, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, LoaderCircle, LockKeyhole, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { OperationAlert } from "@/components/ui/operation-alert";
import { safeLoginReturn } from "@/lib/login-return";
const subscribe = () => () => {};
export function LoginForm({
  returnTo = "/",
  invitationToken,
}: { returnTo?: string; invitationToken?: string } = {}) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const hydrated = useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    setBusy(true);
    try {
      const identifier = email.trim().toLowerCase();
      const isEmail = identifier.includes("@");
      const response = await fetch(
        `/api/auth/sign-in/${isEmail ? "email" : "username"}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(invitationToken
              ? { "X-Kybo-Invitation": invitationToken }
              : {}),
          },
          body: JSON.stringify({
            [isEmail ? "email" : "username"]: identifier,
            password,
          }),
        },
      );
      const result = await response.json();
      if (!response.ok) {
        setError(
          response.status === 429
            ? "Demasiados intentos. Probá de nuevo más tarde."
            : result.code === "INVITATION_INVALID"
              ? "La invitación no está vigente o la cuenta no está habilitada. Pedí una nueva invitación a Administración."
              : "No pudimos iniciar sesión. Revisá el usuario o correo y la contraseña.",
        );
        return;
      }
      setPassword("");
      const destination = safeLoginReturn(returnTo);
      router.replace(
        result.onboarding?.needed
          ? `/onboarding?returnTo=${encodeURIComponent(destination)}`
          : destination,
      );
      router.refresh();
    } catch {
      setError("No hay conexión. Probá de nuevo.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <form onSubmit={submit}>
      <fieldset disabled={!hydrated || busy} className="space-y-6">
        <div>
          <Label htmlFor="email" required>
            Usuario o correo
          </Label>
          <div className="relative">
            <Mail
              size={18}
              aria-hidden="true"
              className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted"
            />
            <Input
              id="email"
              autoComplete="username"
              type="text"
              autoCapitalize="none"
              spellCheck={false}
              placeholder="Tu usuario o correo"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="h-12 pl-11"
            />
          </div>
        </div>
        <div>
          <Label htmlFor="password" required>
            Contraseña
          </Label>
          <div className="relative">
            <LockKeyhole
              size={18}
              aria-hidden="true"
              className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted"
            />
            <Input
              id="password"
              autoComplete="current-password"
              type="password"
              placeholder="Ingresá tu contraseña"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="h-12 pl-11"
            />
          </div>
        </div>
        <OperationAlert
          title="No pudimos iniciar sesión"
          message={error}
          tone="error"
        />
        <Button type="submit" disabled={busy} className="h-12 w-full">
          {busy ? "Ingresando…" : "Ingresar"}
          {busy ? (
            <LoaderCircle
              size={18}
              aria-hidden="true"
              className="motion-safe:animate-spin"
            />
          ) : (
            <ArrowRight size={18} aria-hidden="true" />
          )}
        </Button>
      </fieldset>
    </form>
  );
}
