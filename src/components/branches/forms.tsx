"use client";

import { useState, type FormEvent, type ReactNode } from "react";
import { ArrowRight, MapPin, Store, Archive } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FieldCaption } from "@/components/ui/field-caption";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

async function send(url: string, method: string, body: unknown) {
  const response = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const result = await response.json();
  if (!response.ok)
    throw new Error(
      result.error ?? "No pudimos guardar el cambio. Volvé a intentar.",
    );
  return result;
}

export function FormDialog({
  title,
  description,
  busy,
  onClose,
  children,
}: {
  title: string;
  description: string;
  busy: boolean;
  onClose: () => void;
  children: ReactNode;
}) {
  const [opener] = useState<HTMLElement | null>(() =>
    typeof document === "undefined"
      ? null
      : (document.activeElement as HTMLElement | null),
  );
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !busy) onClose();
      }}
    >
      <DialogContent
        className="branches-dialog"
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          const target = opener?.isConnected
            ? opener
            : document.querySelector<HTMLElement>(
                ".branches-tab[data-state='active']",
              );
          target?.focus();
        }}
        onEscapeKeyDown={(event) => {
          if (busy) event.preventDefault();
        }}
        onInteractOutside={(event) => {
          if (busy) event.preventDefault();
        }}
      >
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        {children}
      </DialogContent>
    </Dialog>
  );
}

export function CreateBranchDialog({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [timeZone, setTimeZone] = useState("America/Argentina/Buenos_Aires");
  const [location, setLocation] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const result = await send("/api/branches", "POST", {
        name,
        code,
        timeZone,
        locations: [{ name: location }],
      });
      onCreated(result.id);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "No pudimos crear la sucursal.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <FormDialog
      title="Crear sucursal"
      description="Dale un nombre al local y agregá su primera ubicación de inventario."
      busy={busy}
      onClose={onClose}
    >
      <form onSubmit={submit} className="branches-form">
        <fieldset disabled={busy}>
          <label>
            <FieldCaption required>Nombre de la sucursal</FieldCaption>
            <Input
              autoFocus
              required
              maxLength={160}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Por ejemplo, Kalú Gamezone — Peatonal Alberdi"
            />
          </label>
          <label>
            <FieldCaption required>Código interno</FieldCaption>
            <Input
              required
              maxLength={64}
              pattern="[A-Za-z0-9][A-Za-z0-9._-]*"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="Por ejemplo, ALBERDI"
            />
            <small>Sin espacios. Sirve para identificar la sucursal.</small>
          </label>
          <label>
            <FieldCaption required>Zona horaria</FieldCaption>
            <Input
              required
              value={timeZone}
              onChange={(e) => setTimeZone(e.target.value)}
            />
            <small>
              Se usa para los horarios de ventas, caja y asistencia.
            </small>
          </label>
          <div className="branches-form-section">
            <MapPin aria-hidden="true" />
            <div>
              <strong>Primera ubicación</strong>
              <p>Un espacio donde guardás o utilizás mercadería.</p>
            </div>
          </div>
          <label>
            <FieldCaption required>Nombre de la ubicación</FieldCaption>
            <Input
              required
              maxLength={160}
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="Por ejemplo, Depósito principal"
            />
          </label>
        </fieldset>
        {error && (
          <p role="alert" className="branches-error">
            {error}
          </p>
        )}
        <div className="branches-form-footer">
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={onClose}
          >
            Cancelar
          </Button>
          <Button type="submit" disabled={busy}>
            <Store />
            {busy ? "Creando…" : "Crear sucursal"}
          </Button>
        </div>
      </form>
    </FormDialog>
  );
}

export function CreateLocationDialog({
  branchId,
  branchName,
  onClose,
  onCreated,
}: {
  branchId: string;
  branchName: string;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await send(`/api/branches/${branchId}/locations`, "POST", { name });
      onCreated();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "No pudimos agregar la ubicación.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <FormDialog
      title="Agregar ubicación"
      description={`Esta ubicación pertenecerá a ${branchName}. Sus existencias se controlan por separado.`}
      busy={busy}
      onClose={onClose}
    >
      <form onSubmit={submit} className="branches-form">
        <fieldset disabled={busy}>
          <label>
            <FieldCaption required>Nombre de la ubicación</FieldCaption>
            <Input
              autoFocus
              required
              maxLength={160}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Por ejemplo, Barra, Cocina o Depósito"
            />
          </label>
        </fieldset>
        {error && (
          <p role="alert" className="branches-error">
            {error}
          </p>
        )}
        <div className="branches-form-footer">
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={onClose}
          >
            Cancelar
          </Button>
          <Button type="submit" disabled={busy}>
            {busy ? "Agregando…" : "Agregar ubicación"}
            <ArrowRight />
          </Button>
        </div>
      </form>
    </FormDialog>
  );
}

export function ArchiveDialog({
  name,
  branch,
  onClose,
  onConfirm,
}: {
  name: string;
  branch: boolean;
  onClose: () => void;
  onConfirm: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <FormDialog
      title={`Archivar ${branch ? "sucursal" : "ubicación"}`}
      description={`Vas a archivar ${name}. Se conserva todo su historial.`}
      busy={busy}
      onClose={onClose}
    >
      <p className="branches-note">
        {branch
          ? "Solo se puede archivar una sucursal sin existencias ni operaciones pendientes."
          : "La ubicación debe estar vacía y sin operaciones, productos o puntos de preparación vinculados. Si hay algo pendiente, te indicaremos qué resolver."}
      </p>
      {error && (
        <p role="alert" className="branches-error">
          {error}
        </p>
      )}
      <div className="branches-form-footer">
        <Button variant="outline" disabled={busy} onClick={onClose}>
          Cancelar
        </Button>
        <Button
          variant="destructive"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            setError("");
            try {
              await onConfirm();
            } catch (e) {
              setError(e instanceof Error ? e.message : "No pudimos archivar.");
            } finally {
              setBusy(false);
            }
          }}
        >
          <Archive />
          {busy ? "Archivando…" : "Confirmar archivado"}
        </Button>
      </div>
    </FormDialog>
  );
}
