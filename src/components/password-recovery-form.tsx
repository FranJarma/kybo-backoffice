"use client";
import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  ArrowLeft,
  ArrowRight,
  CircleCheck,
  Eye,
  EyeOff,
  LoaderCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { recoveryInput } from "@/modules/password-recovery/validation";
import { safeLoginReturn } from "@/lib/login-return";

type Phase = "account" | "code" | "password" | "done";
function NewPassword({
  id,
  label,
  value,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="space-y-2">
      <Label htmlFor={id} required>
        {label}
      </Label>
      <div className="relative">
        <Input
          id={id}
          type={visible ? "text" : "password"}
          autoComplete="new-password"
          minLength={8}
          maxLength={128}
          required
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="h-12 pr-14"
        />
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={`${visible ? "Ocultar" : "Mostrar"} ${label.toLowerCase()}`}
          aria-pressed={visible}
          aria-controls={id}
          className="absolute right-0.5 top-1/2 -translate-y-1/2 text-muted"
          onClick={() => setVisible((v) => !v)}
        >
          {visible ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
        </Button>
      </div>
    </div>
  );
}
export function PasswordRecoveryForm({
  returnTo = "/",
}: {
  returnTo?: string;
}) {
  const [available, setAvailable] = useState<
    "loading" | "yes" | "no" | "error"
  >("loading");
  const [phase, setPhase] = useState<Phase>("account"),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [identifier, setIdentifier] = useState(""),
    [challengeId, setChallengeId] = useState(""),
    [code, setCode] = useState(""),
    [token, setToken] = useState("");
  const [password, setPassword] = useState(""),
    [confirmation, setConfirmation] = useState("");
  const [retryAt, setRetryAt] = useState(0),
    [expiresAt, setExpiresAt] = useState(0),
    [clock, setClock] = useState(0);
  const [availabilityRevision, setAvailabilityRevision] = useState(0);
  const form = useRef<HTMLFormElement>(null);
  const inFlight = useRef(false);
  const loginHref = `/login?returnTo=${encodeURIComponent(safeLoginReturn(returnTo))}`;
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/account/recovery", {
      signal: controller.signal,
      cache: "no-store",
    })
      .then(async (response) => {
        if (!response.ok) throw new Error();
        const data = await response.json();
        if (!controller.signal.aborted)
          setAvailable(data.available === true ? "yes" : "no");
      })
      .catch(() => {
        if (!controller.signal.aborted) setAvailable("error");
      });
    return () => controller.abort();
  }, [availabilityRevision]);
  useEffect(() => {
    if (phase !== "code" && phase !== "password" && retryAt <= Date.now())
      return;
    const timer = window.setInterval(() => setClock(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [phase, retryAt]);
  useEffect(() => {
    if (available === "yes")
      form.current?.querySelector<HTMLInputElement>("input")?.focus();
  }, [phase, available]);
  const retryIn = Math.max(0, Math.ceil((retryAt - clock) / 1000)),
    expired = expiresAt > 0 && clock >= expiresAt;
  const restart = () => {
    setPhase("account");
    setCode("");
    setToken("");
    setPassword("");
    setConfirmation("");
    setExpiresAt(0);
    setClock(Date.now());
    setError("");
  };
  async function submit(event?: FormEvent, resend = false) {
    event?.preventDefault();
    if (inFlight.current) return;
    const input =
      phase === "account" || resend
        ? { action: "request", identifier }
        : phase === "code"
          ? { action: "verify", challengeId, code }
          : {
              action: "reset",
              challengeId,
              token,
              newPassword: password,
              confirmPassword: confirmation,
            };
    const parsed = recoveryInput.safeParse(input);
    if (!parsed.success) {
      setError(parsed.error.issues[0].message);
      return;
    }
    inFlight.current = true;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/account/recovery", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsed.data),
      });
      const data = await response.json();
      if (!response.ok)
        throw new Error(
          response.status === 429
            ? "Se realizaron muchos intentos. Esperá 15 minutos y volvé a probar."
            : (data.error ?? "No pudimos continuar. Volvé a intentar."),
        );
      const at = Date.now();
      setClock(at);
      if (parsed.data.action === "request") {
        setChallengeId(data.challengeId);
        setCode("");
        setToken("");
        setRetryAt(at + data.retryAfter * 1000);
        setExpiresAt(at + data.expiresIn * 1000);
        setPhase("code");
      } else if (parsed.data.action === "verify") {
        setToken(data.token);
        setCode("");
        setExpiresAt(at + data.expiresIn * 1000);
        setPhase("password");
      } else {
        setToken("");
        setCode("");
        setPassword("");
        setConfirmation("");
        setChallengeId("");
        setPhase("done");
      }
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "No hay conexión. Volvé a intentar.",
      );
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }
  if (phase === "done")
    return (
      <div className="space-y-6">
        <div role="status" className="space-y-3">
          <CircleCheck
            size={32}
            className="text-emerald-700"
            aria-hidden="true"
          />
          <h2 className="text-xl font-bold text-brand">
            Contraseña actualizada
          </h2>
          <p className="text-sm leading-6 text-muted">
            Cerramos las sesiones anteriores. Ya podés ingresar con tu
            contraseña nueva.
          </p>
        </div>
        <Button asChild className="w-full">
          <Link href={loginHref}>
            Volver a ingresar <ArrowRight aria-hidden="true" />
          </Link>
        </Button>
      </div>
    );
  return (
    <div className="space-y-6">
      {available === "loading" ? (
        <p role="status" className="flex items-center gap-2 text-sm text-muted">
          <LoaderCircle
            size={18}
            className="motion-safe:animate-spin"
            aria-hidden="true"
          />
          Comprobando disponibilidad…
        </p>
      ) : available !== "yes" ? (
        <div className="space-y-3 rounded-xl border border-line bg-surface p-4">
          <p role="status" className="text-sm leading-6 text-brand">
            {available === "no"
              ? "La recuperación por correo todavía no está habilitada. Por ahora, pedí a Administración una contraseña temporal."
              : "No pudimos comprobar la conexión. Volvé a intentar o contactá a Administración."}
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              setAvailable("loading");
              setAvailabilityRevision((v) => v + 1);
            }}
          >
            Volver a comprobar
          </Button>
        </div>
      ) : null}
      {available === "yes" && (
        <ol
          aria-label="Pasos de recuperación"
          className="flex flex-wrap gap-x-5 gap-y-2 text-xs font-semibold"
        >
          {(
            [
              ["account", "Cuenta"],
              ["code", "Código"],
              ["password", "Nueva contraseña"],
            ] as const
          ).map(([step, label], i) => (
            <li
              key={step}
              aria-current={phase === step ? "step" : undefined}
              className={phase === step ? "text-blue" : "text-muted"}
            >
              {i + 1}. {label}
            </li>
          ))}
        </ol>
      )}
      <form ref={form} onSubmit={submit} aria-busy={busy} className="space-y-6">
        <fieldset disabled={busy || available !== "yes"} className="space-y-6">
          {phase === "account" ? (
            <div className="space-y-2">
              <Label htmlFor="recovery-identifier" required>
                Usuario o correo
              </Label>
              <Input
                id="recovery-identifier"
                autoComplete="username"
                autoCapitalize="none"
                spellCheck={false}
                required
                maxLength={254}
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                className="h-12"
              />
              <p className="text-sm leading-6 text-muted">
                Usá los mismos datos con los que ingresás a Kybo.
              </p>
            </div>
          ) : phase === "code" ? (
            <div className="space-y-4">
              <p className="text-sm leading-6 text-muted">
                Si tu cuenta tiene un correo de recuperación habilitado,
                recibirás un código. Puede demorar unos momentos.
              </p>
              <div className="space-y-2">
                <Label htmlFor="recovery-code" required>
                  Código de seis dígitos
                </Label>
                <Input
                  id="recovery-code"
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  pattern="[0-9]{6}"
                  maxLength={6}
                  required
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                  className="h-12 text-center text-xl tracking-widest tabular-nums"
                />
                <p className="text-sm text-muted">
                  El código vence en 5 minutos. No lo compartas.
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-5">
              <NewPassword
                id="recovery-password"
                label="Nueva contraseña"
                value={password}
                onChange={setPassword}
              />
              <p className="text-sm text-muted">
                Usá al menos 8 caracteres y una contraseña distinta de la
                anterior.
              </p>
              <NewPassword
                id="recovery-confirmation"
                label="Confirmar contraseña"
                value={confirmation}
                onChange={setConfirmation}
              />
            </div>
          )}
          {expired && (
            <p role="status" className="text-sm leading-6 text-amber-900">
              {phase === "code"
                ? "El código venció. Solicitá uno nuevo."
                : "El permiso venció. Volvé a solicitar un código."}
            </p>
          )}
          {error && (
            <p
              role="alert"
              className="rounded-lg bg-red-50 p-3 text-sm leading-6 text-red-800"
            >
              {error}
            </p>
          )}
          <Button
            type="submit"
            className="h-12 w-full"
            disabled={expired || (phase === "account" && retryIn > 0)}
          >
            {busy ? (
              <>
                <LoaderCircle
                  aria-hidden="true"
                  className="motion-safe:animate-spin"
                />
                Procesando…
              </>
            ) : (
              <>
                {phase === "account"
                  ? retryIn > 0
                    ? `Solicitar otro código en ${retryIn} s`
                    : "Solicitar código por correo"
                  : phase === "code"
                    ? "Verificar código"
                    : "Guardar contraseña"}
                <ArrowRight aria-hidden="true" />
              </>
            )}
          </Button>
        </fieldset>
        {phase === "code" && (
          <div className="space-y-3">
            <Button
              type="button"
              variant="outline"
              className="w-full"
              disabled={busy || retryIn > 0}
              onClick={() => void submit(undefined, true)}
            >
              {retryIn > 0
                ? `Solicitar otro código en ${retryIn} s`
                : "Solicitar otro código"}
            </Button>
            <p className="text-sm leading-6 text-muted">
              Si no llega, comprobá tu usuario. Administración puede revisar el
              teléfono configurado o darte una contraseña temporal.
            </p>
          </div>
        )}
        {phase !== "account" && (
          <Button
            type="button"
            variant="link"
            disabled={busy}
            onClick={restart}
          >
            Volver a solicitar con mi usuario
          </Button>
        )}
      </form>
      <Link
        href={loginHref}
        className="inline-flex min-h-11 items-center gap-2 rounded text-sm font-semibold text-blue focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      >
        <ArrowLeft size={16} aria-hidden="true" />
        Volver al ingreso
      </Link>
    </div>
  );
}
