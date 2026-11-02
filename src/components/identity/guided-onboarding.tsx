"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Fingerprint, ArrowRight, ShieldCheck, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { OperationAlert } from "@/components/ui/operation-alert";
import { enrollIdentity, privateRequest } from "./client";
import { safeLoginReturn } from "@/lib/login-return";
type Status = {
  name: string;
  onboarding: {
    needed: boolean;
    enrollmentReady: boolean;
    branchId: string | null;
  };
};
export function GuidedOnboarding({
  returnTo,
  attendanceBranchId,
}: {
  returnTo: string;
  attendanceBranchId?: string;
}) {
  const router = useRouter(),
    destination = safeLoginReturn(returnTo);
  const [data, setData] = useState<Status | null>(null),
    [error, setError] = useState(""),
    [password, setPassword] = useState(""),
    [busy, setBusy] = useState(false),
    [done, setDone] = useState(false);
  useEffect(() => {
    const abort = new AbortController();
    void Promise.all([
      privateRequest<Status>(
        "/api/invitations/onboarding",
        "",
        undefined,
        abort.signal,
      ),
      attendanceBranchId
        ? privateRequest<{ ready: boolean; credentials: { id: string }[] }>(
            "/api/identity",
            attendanceBranchId,
            undefined,
            abort.signal,
          )
        : Promise.resolve(null),
    ])
      .then(([status, identity]) => {
        if (!abort.signal.aborted) {
          if (identity && !identity.ready)
            throw new Error(
              "Administración debe habilitar la verificación del celular antes de fichar.",
            );
          const result = identity
            ? {
                ...status,
                onboarding: {
                  needed: identity.credentials.length === 0,
                  enrollmentReady:
                    status.onboarding.enrollmentReady &&
                    status.onboarding.branchId === attendanceBranchId,
                  branchId: attendanceBranchId!,
                },
              }
            : status;
          setData(result);
          if (!result.onboarding.needed) {
            router.replace(
              destination === "/" ? "/staff/attendance" : destination,
            );
            router.refresh();
          }
        }
      })
      .catch((e) => {
        if (!abort.signal.aborted) setError(e.message);
      });
    return () => abort.abort();
  }, [router, destination, attendanceBranchId]);
  const needsPassword =
    !!attendanceBranchId &&
    data?.onboarding.needed &&
    !data.onboarding.enrollmentReady;
  async function enroll() {
    if (!data?.onboarding.branchId) return;
    setBusy(true);
    setError("");
    try {
      if (!window.isSecureContext || !window.PublicKeyCredential)
        throw new Error(
          "Abrí Kybo desde tu celular compatible, con una conexión HTTPS, para activar la verificación.",
        );
      if (needsPassword) {
        await enrollIdentity(data.onboarding.branchId, password, "Mi celular");
      } else {
        const api = await import("@simplewebauthn/browser");
        const options = await privateRequest<{
          challengeId: string;
          options: Parameters<typeof api.startRegistration>[0]["optionsJSON"];
        }>("/api/identity", data.onboarding.branchId, {
          action: "guided-register-options",
        });
        const response = await api.startRegistration({
          optionsJSON: options.options,
        });
        await privateRequest("/api/identity", data.onboarding.branchId, {
          action: "register-response",
          challengeId: options.challengeId,
          response,
        });
      }
      setDone(true);
    } catch (e) {
      setError(
        e instanceof Error &&
          (e.name === "NotAllowedError" || e.name === "AbortError")
          ? "La confirmación se canceló o venció. Podés volver a intentarlo; todavía no activamos la verificación."
          : (e as Error).message,
      );
    } finally {
      setPassword("");
      setBusy(false);
    }
  }
  const continueToWork = () => {
    router.replace(destination === "/" ? "/staff/attendance" : destination);
    router.refresh();
  };
  return (
    <div className="space-y-6">
      <span className="inline-flex size-14 items-center justify-center rounded-2xl bg-blue-50 text-blue-600">
        {done ? <ShieldCheck size={30} /> : <Fingerprint size={30} />}
      </span>
      <div>
        <p className="text-xs font-bold uppercase tracking-[.15em] text-muted">
          TU CUENTA PERSONAL
        </p>
        <h1 className="mt-3 text-3xl font-extrabold tracking-tight text-brand">
          {done
            ? "Tu celular está preparado."
            : "Activá la verificación de tu celular."}
        </h1>
        <p className="mt-3 leading-7 text-muted">
          {done
            ? "Ya podés continuar con tus asignaciones y fichar junto al local."
            : `${data?.name ? data.name.split(" ")[0] + ", " : ""}confirmá con Face ID, huella o el desbloqueo compatible de tu teléfono. No hace falta completar un registro de dispositivo.`}
        </p>
      </div>
      <OperationAlert
        title="No pudimos activar la verificación"
        message={error}
        tone="error"
      />
      {done ? (
        <Button className="h-12 w-full" onClick={continueToWork}>
          Continuar
          <ArrowRight />
        </Button>
      ) : data?.onboarding.enrollmentReady || needsPassword ? (
        <form
          className="space-y-5"
          onSubmit={(event) => {
            event.preventDefault();
            void enroll();
          }}
        >
          {needsPassword && (
            <div>
              <Label htmlFor="phone-account-password" required>
                Contraseña de tu cuenta
              </Label>
              <Input
                id="phone-account-password"
                type="password"
                autoComplete="current-password"
                autoFocus
                required
                maxLength={128}
                className="mt-2 h-12"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                disabled={busy}
              />
              <p className="mt-2 text-xs leading-6 text-muted">
                Se pide una sola vez para autorizar la verificación.
              </p>
            </div>
          )}
          <Button type="submit" className="h-12 w-full" disabled={busy}>
            {busy ? "Esperando tu confirmación…" : "Activar verificación"}
            <Fingerprint />
          </Button>
        </form>
      ) : data ? (
        <div className="rounded-xl border border-line bg-surface p-4 text-sm leading-6">
          <p>
            Para activar la verificación necesitás un ingreso reciente con tu
            contraseña.
          </p>
          <Button asChild variant="outline" className="mt-3 w-full">
            <a href={`/login?returnTo=${encodeURIComponent(destination)}`}>
              Volver a ingresar
            </a>
          </Button>
        </div>
      ) : (
        <p role="status" className="text-muted">
          Preparando tu cuenta…
        </p>
      )}
      {!done && !attendanceBranchId && (
        <Button
          variant="ghost"
          className="w-full"
          onClick={continueToWork}
          disabled={busy}
        >
          Continuar y activar después
          <ArrowRight />
        </Button>
      )}
      <p className="flex gap-3 text-xs leading-6 text-muted">
        <Smartphone className="mt-1 size-5 shrink-0" />
        Podés usar Kybo desde el navegador o agregarlo a la pantalla de inicio.
        Para fichar necesitás la verificación del celular y un QR vigente del
        local. La sucursal define si además exige ubicación.
      </p>
    </div>
  );
}
