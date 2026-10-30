"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Fingerprint, ArrowRight, ShieldCheck, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { OperationAlert } from "@/components/ui/operation-alert";
import { privateRequest } from "./client";
import { safeLoginReturn } from "@/lib/login-return";
type Status = {
  name: string;
  onboarding: {
    needed: boolean;
    enrollmentReady: boolean;
    branchId: string | null;
  };
};
export function GuidedOnboarding({ returnTo }: { returnTo: string }) {
  const router = useRouter(),
    destination = safeLoginReturn(returnTo);
  const [data, setData] = useState<Status | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [done, setDone] = useState(false);
  useEffect(() => {
    const abort = new AbortController();
    void privateRequest<Status>(
      "/api/invitations/onboarding",
      "",
      undefined,
      abort.signal,
    )
      .then((result) => {
        if (!abort.signal.aborted) {
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
  }, [router, destination]);
  async function enroll() {
    if (!data?.onboarding.branchId) return;
    setBusy(true);
    setError("");
    try {
      if (!window.isSecureContext || !window.PublicKeyCredential)
        throw new Error(
          "Abrí Kybo desde tu celular compatible, con una conexión HTTPS, para activar la verificación.",
        );
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
      setDone(true);
    } catch (e) {
      setError(
        e instanceof Error &&
          (e.name === "NotAllowedError" || e.name === "AbortError")
          ? "La confirmación se canceló o venció. Podés volver a intentarlo; todavía no activamos la verificación."
          : (e as Error).message,
      );
    } finally {
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
      ) : data?.onboarding.enrollmentReady ? (
        <Button
          className="h-12 w-full"
          onClick={() => void enroll()}
          disabled={busy}
        >
          {busy ? "Esperando tu confirmación…" : "Activar verificación"}
          <Fingerprint />
        </Button>
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
      {!done && (
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
        Para fichar necesitás la verificación del celular, ubicación y un QR
        vigente del local.
      </p>
    </div>
  );
}
