"use client";
import {
  useState,
  useSyncExternalStore,
  useTransition,
  type FormEvent,
} from "react";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  CircleCheck,
  LoaderCircle,
  LockKeyhole,
  Mail,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { OperationAlert } from "@/components/ui/operation-alert";
import { safeLoginReturn } from "@/lib/login-return";
import { passwordChangeLocation } from "@/modules/password-policy/validation";
const subscribe = () => () => {};
export function LoginForm({
  returnTo = "/",
  invitationToken,
}: { returnTo?: string; invitationToken?: string } = {}) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [phase, setPhase] = useState<"idle" | "verifying" | "opening">("idle");
  const [navigating, startNavigation] = useTransition();
  const busy = phase !== "idle" || navigating;
  const hydrated = useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setError("");
    setPhase("verifying");
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
        setPhase("idle");
        setError(
          response.status === 429
            ? "Demasiados intentos. Probá de nuevo más tarde."
            : result.code === "TEMPORARY_PASSWORD_EXPIRED" ||
                result.code === "PASSWORD_POLICY_STALE"
              ? result.error
              : result.code === "INVITATION_INVALID"
                ? "La invitación no está vigente o la cuenta no está habilitada. Pedí una nueva invitación a Administración."
                : "No pudimos iniciar sesión. Revisá el usuario o correo y la contraseña.",
        );
        return;
      }
      setPassword("");
      setPhase("opening");
      const destination = safeLoginReturn(returnTo);
      const nextPage = result.passwordPolicy?.required
        ? passwordChangeLocation(
            destination,
            result.onboarding?.needed === true,
          )
        : result.onboarding?.needed
          ? `/onboarding?returnTo=${encodeURIComponent(destination)}`
          : destination;
      startNavigation(() => {
        router.replace(nextPage);
        // The cookie was set by a fetch, so invalidate any pre-login route data.
        router.refresh();
      });
    } catch {
      setError("No hay conexión. Probá de nuevo.");
      setPhase("idle");
    }
  }
  return (
    <form onSubmit={submit} aria-busy={busy} aria-describedby="login-progress">
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
        <Button
          type="submit"
          disabled={busy}
          className="h-12 w-full disabled:opacity-100"
        >
          {phase === "opening"
            ? "Abriendo Kybo…"
            : busy
              ? "Verificando acceso…"
              : "Ingresar"}
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
      <p
        id="login-progress"
        role="status"
        aria-live="polite"
        className="mt-4 flex min-h-5 items-start gap-2 text-xs leading-5 text-muted"
      >
        {phase === "opening" ? (
          <>
            <CircleCheck
              size={16}
              aria-hidden="true"
              className="mt-0.5 shrink-0 text-emerald-600"
            />
            <span>Acceso confirmado. Estamos abriendo tu espacio.</span>
          </>
        ) : phase === "verifying" ? (
          "Estamos verificando tu acceso."
        ) : null}
      </p>
    </form>
  );
}
