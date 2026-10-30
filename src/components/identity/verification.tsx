"use client";

import { useEffect, useState } from "react";
import { Fingerprint, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Drawer, Field } from "@/components/attendance/shared";
import { enrollIdentity, privateRequest } from "./client";
type Credential = {
  id: string;
  name: string;
  createdAt: string;
  lastUsedAt: string | null;
};
export function IdentityDevices({
  branchId,
  onClose,
}: {
  branchId: string;
  onClose: () => void;
}) {
  const [rows, setRows] = useState<Credential[]>([]),
    [name, setName] = useState("Mi celular"),
    [password, setPassword] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function load() {
    const result = await privateRequest<{ credentials: Credential[] }>(
      "/api/identity",
      branchId,
    );
    setRows(result.credentials);
  }
  useEffect(() => {
    const abort = new AbortController();
    privateRequest<{ credentials: Credential[] }>(
      "/api/identity",
      branchId,
      undefined,
      abort.signal,
    )
      .then((r) => setRows(r.credentials))
      .catch((e) => {
        if (!abort.signal.aborted) setError(e.message);
      });
    return () => abort.abort();
  }, [branchId]);
  async function register(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await enrollIdentity(branchId, password, name);
      setPassword("");
      await load();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "No pudimos registrar el dispositivo.",
      );
    } finally {
      setPassword("");
      setBusy(false);
    }
  }
  async function revoke(id: string) {
    setBusy(true);
    setError("");
    try {
      await privateRequest("/api/identity", branchId, {
        action: "revoke",
        credentialId: id,
      });
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Drawer
      title="Mi dispositivo"
      description="Configurá tu cuenta personal para verificar las operaciones."
      onClose={onClose}
      busy={busy}
    >
      <div className="att-info">
        <Fingerprint />
        <p>
          Kybo guarda una clave pública. Tu rostro, huella y código de
          desbloqueo permanecen en el dispositivo. Usá tu propia cuenta y un
          celular personal.
        </p>
      </div>
      {error && (
        <p role="alert" className="att-error">
          {error}
        </p>
      )}
      <h3>Credenciales activas</h3>
      {rows.length ? (
        rows.map((row) => (
          <div className="att-device" key={row.id}>
            <div>
              <strong>{row.name}</strong>
              <small>
                {row.lastUsedAt
                  ? `Último uso: ${new Date(row.lastUsedAt).toLocaleDateString("es-AR")}`
                  : "Sin usos todavía"}
              </small>
            </div>
            <Button
              variant="ghost"
              disabled={busy}
              onClick={() => void revoke(row.id)}
              aria-label={`Revocar ${row.name}`}
            >
              <Trash2 />
            </Button>
          </div>
        ))
      ) : (
        <p className="att-subtle">Todavía no registraste una credencial.</p>
      )}
      <form onSubmit={register} className="att-stack">
        <h3>Registrar este dispositivo</h3>
        <Field label="Nombre del dispositivo" required>
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            maxLength={60}
            disabled={busy}
          />
        </Field>
        <Field
          label="Contraseña de tu cuenta"
          required
          hint="Se pide una sola vez para autorizar el registro."
        >
          <input
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            disabled={busy}
          />
        </Field>
        <Button className="min-h-12" disabled={busy}>
          <Plus />
          {busy ? "Esperando al dispositivo…" : "Configurar Face ID o huella"}
        </Button>
      </form>
    </Drawer>
  );
}
