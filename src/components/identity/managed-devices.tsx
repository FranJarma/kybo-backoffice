"use client";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Drawer } from "@/components/attendance/shared";
import { privateRequest } from "./client";
type Credential = {
  id: string;
  name: string;
  createdAt: string;
  lastUsedAt: string | null;
};
export function ManagedDevices({
  branchId,
  userId,
  name,
  onClose,
}: {
  branchId: string;
  userId: string;
  name: string;
  onClose: () => void;
}) {
  const [rows, setRows] = useState<Credential[]>([]),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    const abort = new AbortController();
    privateRequest<{ credentials: Credential[] }>(
      `/api/identity?userId=${encodeURIComponent(userId)}`,
      branchId,
      undefined,
      abort.signal,
    )
      .then((r) => setRows(r.credentials))
      .catch((e) => {
        if (!abort.signal.aborted) setError(e.message);
      });
    return () => abort.abort();
  }, [branchId, userId]);
  async function revoke(id: string) {
    setBusy(true);
    setError("");
    try {
      await privateRequest("/api/identity", branchId, {
        action: "revoke",
        credentialId: id,
      });
      setRows((old) => old.filter((r) => r.id !== id));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Drawer
      title={`Dispositivos · ${name}`}
      description="Podés revocar una credencial perdida. Cada persona registra sus propias credenciales desde su cuenta."
      busy={busy}
      onClose={onClose}
    >
      {error && (
        <p role="alert" className="att-error">
          {error}
        </p>
      )}
      {rows.map((row) => (
        <div className="att-device" key={row.id}>
          <div>
            <strong>{row.name}</strong>
            <small>
              Registrado el{" "}
              {new Date(row.createdAt).toLocaleDateString("es-AR")}
            </small>
          </div>
          <Button
            variant="outline"
            disabled={busy}
            onClick={() => void revoke(row.id)}
          >
            Revocar
          </Button>
        </div>
      ))}
      {!rows.length && (
        <p className="att-subtle">
          No hay credenciales activas para este sitio.
        </p>
      )}
    </Drawer>
  );
}
