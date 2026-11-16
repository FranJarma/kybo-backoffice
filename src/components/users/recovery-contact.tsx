"use client";
import { useEffect, useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  recoveryContactInput,
  type RecoveryContactState,
} from "@/modules/password-recovery/validation";
export function RecoveryContact({ userId }: { userId: string }) {
  const id = useId();
  const [state, setState] = useState<RecoveryContactState | null>(null),
    [phone, setPhone] = useState(""),
    [enabled, setEnabled] = useState(false),
    [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [saved, setSaved] = useState(false),
    [revision, setRevision] = useState(0);
  useEffect(() => {
    const abort = new AbortController();
    fetch(`/api/settings/users/${encodeURIComponent(userId)}/recovery`, {
      signal: abort.signal,
      cache: "no-store",
    })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok)
          throw new Error(data.error ?? "No pudimos consultar el contacto.");
        if (!abort.signal.aborted) {
          setState(data);
          setPhone(data.phone ?? "");
          setEnabled(data.enabled);
          setConfirmed(data.confirmed);
          setError("");
        }
      })
      .catch((cause) => {
        if (!abort.signal.aborted)
          setError(
            cause instanceof Error
              ? cause.message
              : "No pudimos consultar el contacto.",
          );
      });
    return () => abort.abort();
  }, [userId, revision]);
  async function save() {
    if (busy || !state?.ready) return;
    const parsed = recoveryContactInput.safeParse({
      phone,
      enabled,
      confirmed,
      version: state.version,
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0].message);
      return;
    }
    setBusy(true);
    setError("");
    setSaved(false);
    try {
      const response = await fetch(
        `/api/settings/users/${encodeURIComponent(userId)}/recovery`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(parsed.data),
        },
      );
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.error ?? "No pudimos guardar el contacto.");
      setState(data);
      setPhone(data.phone ?? "");
      setEnabled(data.enabled);
      setConfirmed(data.confirmed);
      setSaved(true);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "No hay conexión. Volvé a intentar.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <section
      className="space-y-4 border-t border-line pt-6"
      aria-labelledby={`${id}-title`}
      onKeyDown={(e) => {
        if (
          e.key === "Enter" &&
          e.target instanceof HTMLInputElement &&
          e.target.type === "tel"
        ) {
          e.preventDefault();
          void save();
        }
      }}
    >
      <div>
        <h3 id={`${id}-title`} className="font-semibold">
          Recuperación por WhatsApp
        </h3>
        <p className="mt-2 text-sm leading-6 text-muted">
          Contacto privado para recuperar el acceso. Se guarda por separado de
          los datos de la cuenta.
        </p>
      </div>
      {state && !state.ready ? (
        <p className="rounded-lg bg-surface p-3 text-sm leading-6 text-brand">
          Falta habilitar la recuperación en el sistema. Todavía podés emitir
          una contraseña temporal.
        </p>
      ) : !state && !error ? (
        <p role="status" className="text-sm text-muted">
          Consultando contacto…
        </p>
      ) : state?.ready ? (
        <fieldset disabled={busy} className="space-y-4">
          <div className="space-y-2">
            <Label
              htmlFor={`${id}-phone`}
              required={enabled}
              optional={!enabled}
            >
              WhatsApp de recuperación
            </Label>
            <Input
              id={`${id}-phone`}
              type="tel"
              autoComplete="off"
              aria-required={enabled}
              value={phone}
              maxLength={60}
              placeholder="+54 9…"
              onChange={(e) => {
                setPhone(e.target.value);
                setConfirmed(false);
                setSaved(false);
              }}
              className="h-12"
            />
            <p className="text-xs leading-5 text-muted">
              Incluí + y el código de país. Cada cuenta personal debe tener su
              propio número.
            </p>
          </div>
          <label className="flex min-h-11 items-start gap-3 text-sm leading-6">
            <input
              type="checkbox"
              checked={enabled}
              className="mt-1 size-4"
              onChange={(e) => {
                setEnabled(e.target.checked);
                setSaved(false);
              }}
            />
            Habilitar recuperación por WhatsApp
          </label>
          {enabled && (
            <label className="flex min-h-11 items-start gap-3 text-sm leading-6">
              <input
                type="checkbox"
                checked={confirmed}
                aria-required="true"
                className="mt-1 size-4"
                onChange={(e) => {
                  setConfirmed(e.target.checked);
                  setSaved(false);
                }}
              />
              Confirmé que este número pertenece a esta persona y autorizó
              recibir códigos de acceso.
            </label>
          )}
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={() => void save()}
          >
            {busy ? "Guardando contacto…" : "Guardar contacto de recuperación"}
          </Button>
        </fieldset>
      ) : null}
      {saved && (
        <p role="status" className="text-sm text-emerald-800">
          Contacto guardado. El envío requiere que la conexión con WhatsApp esté
          activa.
        </p>
      )}
      {error && (
        <div className="space-y-2">
          <p role="alert" className="text-sm leading-6 text-red-800">
            {error}
          </p>
          <Button
            type="button"
            variant="link"
            disabled={busy}
            onClick={() => {
              setSaved(false);
              setRevision((v) => v + 1);
            }}
          >
            Actualizar contacto
          </Button>
        </div>
      )}
    </section>
  );
}
