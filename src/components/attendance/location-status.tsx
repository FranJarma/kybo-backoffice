"use client";
import {
  CheckCircle2,
  LoaderCircle,
  MapPin,
  MapPinOff,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLocationFeedback } from "./use-location-feedback";
import type { PhoneLocationPolicy } from "./location-feedback";

function meters(value: number) {
  return value >= 1000
    ? `${(value / 1000).toLocaleString("es-AR", { maximumFractionDigits: 1 })} km`
    : `${Math.round(value).toLocaleString("es-AR")} m`;
}
const titles = {
  "not-required": "Ubicación no requerida",
  checking: "Comprobando tu ubicación…",
  unconfigured: "Ubicación del local pendiente",
  inside: "Estás dentro del radio",
  outside: "Estás fuera del radio",
  inaccurate: "Necesitamos una ubicación más precisa",
  stale: "Actualizá tu ubicación",
  unavailable: "No pudimos confirmar tu ubicación",
};
export function AttendanceLocationStatus({
  scope,
  policy,
  busy,
}: {
  scope: string;
  policy: PhoneLocationPolicy;
  busy: boolean;
}) {
  const feedback = useLocationFeedback(scope, policy, busy);
  const state = feedback.state;
  const Icon =
    state === "inside"
      ? CheckCircle2
      : state === "not-required"
        ? ShieldCheck
        : state === "checking"
          ? LoaderCircle
          : state === "unavailable"
            ? MapPinOff
            : MapPin;
  const detail =
    state === "inside"
      ? "Tu ubicación cumple con la zona permitida. Se valida de nuevo al confirmar."
      : state === "outside"
        ? "Acercate al local y volvé a comprobar tu ubicación."
        : state === "inaccurate"
          ? "Esperá una lectura más precisa o volvé a actualizar."
          : state === "stale"
            ? "Necesitamos una lectura reciente para confirmar la cercanía."
            : state === "not-required"
              ? "Podés fichar desde cualquier lugar con QR vigente y verificación del celular."
              : state === "unconfigured"
                ? "Administración debe configurar el punto del local."
                : state === "checking"
                  ? "Permití el acceso a la ubicación para comprobar la cercanía."
                  : feedback.message ||
                    "Permití la ubicación y volvé a intentar.";
  return (
    <section
      className="att-location-status"
      data-state={state}
      aria-label="Ubicación al fichar"
    >
      <Icon
        size={22}
        aria-hidden="true"
        className={
          state === "checking"
            ? "animate-spin motion-reduce:animate-none"
            : undefined
        }
      />
      <div
        className="att-location-body"
        role="status"
        aria-live="polite"
        aria-atomic="true"
      >
        <strong>
          {state === "outside" &&
          feedback.distanceMeters !== null &&
          feedback.distanceMeters <= policy.radiusMeters
            ? "No podemos confirmar que estés dentro del radio"
            : titles[state]}
        </strong>
        {(state === "inside" || state === "outside") &&
          feedback.distanceMeters !== null && (
            <p className="att-location-distance">
              Aprox. {meters(feedback.distanceMeters)} del local · Radio
              permitido: {meters(policy.radiusMeters)}
            </p>
          )}
        {state === "inaccurate" && feedback.accuracyMeters !== null && (
          <p className="att-location-distance">
            Precisión: ±{meters(feedback.accuracyMeters)} · Máxima permitida:{" "}
            {meters(policy.maxAccuracyMeters)}
          </p>
        )}
        <p className="att-location-detail">{detail}</p>
      </div>
      {state !== "not-required" && state !== "unconfigured" && (
        <Button
          type="button"
          variant="outline"
          className="att-location-refresh"
          disabled={busy || feedback.pending}
          onClick={feedback.refresh}
        >
          <RefreshCw size={16} aria-hidden="true" />
          {feedback.pending ? "Actualizando…" : "Actualizar ubicación"}
        </Button>
      )}
    </section>
  );
}
