"use client";
import { useRef, useState, type FormEvent } from "react";
import { Copy, MessageCircle, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SearchCombobox } from "@/components/ui/search-combobox";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import type { ManagedUser, UsersSnapshot } from "@/modules/users/types";
import type { InvitationMessage } from "@/modules/invitations/types";
export function UserInvitation({
  snapshot,
  onSaved,
  user,
  onClose,
}: {
  snapshot: UsersSnapshot;
  onSaved: (snapshot: UsersSnapshot) => void;
  user?: ManagedUser;
  onClose?: () => void;
}) {
  const [open, setOpen] = useState(!!user),
    [name, setName] = useState(""),
    [role, setRole] = useState("staff"),
    [branchId, setBranchId] = useState(""),
    [attendanceEnabled, setAttendanceEnabled] = useState(true),
    [validityHours, setValidityHours] = useState(72);
  const [message, setMessage] = useState<InvitationMessage | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const retry = useRef<{ body: string; requestId: string } | null>(null);
  function close() {
    if (busy) return;
    setOpen(false);
    setMessage(null);
    setError("");
    setNotice("");
    retry.current = null;
    onClose?.();
  }
  async function command(
    action: "invite-create" | "invite-renew" | "invite-reveal",
  ) {
    setBusy(true);
    setError("");
    setNotice("");
    const body =
      action === "invite-create"
        ? { action, name, role, branchId, attendanceEnabled, validityHours }
        : {
            action,
            userId: user?.id,
            ...(action === "invite-renew" ? { validityHours } : {}),
          };
    const serialized = JSON.stringify(body);
    if (retry.current?.body !== serialized)
      retry.current = { body: serialized, requestId: crypto.randomUUID() };
    try {
      const response = await fetch("/api/settings/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...body,
          ...(action !== "invite-reveal"
            ? { requestId: retry.current.requestId }
            : {}),
        }),
      });
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.error ?? "No pudimos preparar la invitación.");
      setMessage(result.invitation ?? null);
      onSaved(result.snapshot);
      if (!result.invitation)
        setNotice(
          "El mensaje ya no está disponible. Solo se recupera mientras la invitación está pendiente y vigente.",
        );
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function copy() {
    if (!message) return;
    try {
      await navigator.clipboard.writeText(message.message);
      setNotice("Mensaje copiado.");
    } catch {
      setError(
        "No pudimos copiar. Seleccioná el mensaje y copialo manualmente.",
      );
    }
  }
  async function share() {
    if (!message) return;
    try {
      if (navigator.share)
        await navigator.share({
          title: "Invitación a Kybo",
          text: message.message,
        });
      else
        window.open(
          "https://wa.me/?text=" + encodeURIComponent(message.message),
          "_blank",
          "noopener,noreferrer",
        );
    } catch (error) {
      if (!(error instanceof Error && error.name === "AbortError"))
        setError(
          "No pudimos abrir las opciones para compartir. Podés copiar el mensaje.",
        );
    }
  }
  function submit(event: FormEvent) {
    event.preventDefault();
    void command("invite-create");
  }
  return (
    <>
      {!user && (
        <Button
          onClick={() => {
            setOpen(true);
            setName("");
            setBranchId("");
            setMessage(null);
            setNotice("");
            setError("");
            retry.current = null;
          }}
        >
          <UserPlus size={17} />
          Invitar persona
        </Button>
      )}
      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (!next) close();
        }}
      >
        <DialogContent
          className="max-h-[90dvh] overflow-y-auto sm:max-w-xl"
          onInteractOutside={(event) => {
            if (busy) event.preventDefault();
          }}
          onEscapeKeyDown={(event) => {
            if (busy) event.preventDefault();
          }}
        >
          <DialogTitle>
            {user ? `Invitación · ${user.name}` : "Invitar a una persona"}
          </DialogTitle>
          <DialogDescription>
            Kybo prepara el acceso. Vos elegís a quién compartir el mensaje; no
            se envía automáticamente.
          </DialogDescription>
          {!user && !message && (
            <form onSubmit={submit} className="space-y-5">
              <fieldset disabled={busy} className="space-y-5">
                <div>
                  <Label htmlFor="invite-name" required>
                    Nombre
                  </Label>
                  <Input
                    id="invite-name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                    maxLength={120}
                  />
                </div>
                <div>
                  <Label htmlFor="invite-role" required>
                    Rol
                  </Label>
                  <select
                    id="invite-role"
                    className="form-control"
                    value={role}
                    onChange={(e) => setRole(e.target.value)}
                  >
                    <option value="staff">Personal</option>
                    <option value="manager">Encargado</option>
                  </select>
                </div>
                <div>
                  <Label htmlFor="invite-branch" required>
                    Sucursal
                  </Label>
                  <SearchCombobox
                    id="invite-branch"
                    label="Sucursal"
                    value={branchId}
                    selectedLabel={
                      snapshot.branches.find((b) => b.id === branchId)?.name ??
                      ""
                    }
                    options={snapshot.branches}
                    onChange={setBranchId}
                    onSearch={() => {}}
                    required
                  />
                </div>
                <label className="flex items-start gap-3 text-sm">
                  <input
                    type="checkbox"
                    checked={attendanceEnabled}
                    onChange={(e) => setAttendanceEnabled(e.target.checked)}
                  />
                  Habilitar participación en Asistencia
                </label>
                <p className="text-xs text-muted">
                  Los horarios se asignan desde la planificación. El usuario y
                  la contraseña inicial se generan al preparar la invitación.
                </p>
                <Validity value={validityHours} onChange={setValidityHours} />
                <Button type="submit" disabled={busy || !branchId}>
                  {busy ? "Preparando…" : "Preparar invitación"}
                </Button>
              </fieldset>
            </form>
          )}
          {user && !message && (
            <div className="space-y-4">
              <Validity value={validityHours} onChange={setValidityHours} />
              <div className="flex flex-wrap gap-3">
                <Button
                  variant="outline"
                  disabled={busy || user.invitation?.status !== "pending"}
                  onClick={() => void command("invite-reveal")}
                >
                  Recuperar mensaje
                </Button>
                <Button
                  disabled={
                    busy ||
                    user.invitation?.status === "activated" ||
                    user.disabled
                  }
                  onClick={() => void command("invite-renew")}
                >
                  {busy ? "Preparando…" : "Renovar invitación"}
                </Button>
              </div>
              <p className="text-xs text-muted">
                Renovar conserva el usuario y reemplaza el enlace y la
                contraseña inicial anteriores.
              </p>
            </div>
          )}
          {message && (
            <div className="space-y-4">
              <Label htmlFor="invite-message">Mensaje para compartir</Label>
              <textarea
                id="invite-message"
                className="form-control min-h-64 resize-y text-sm"
                readOnly
                value={message.message}
              />
              <p className="text-xs text-muted">
                La contraseña inicial sigue sirviendo después de activar la
                cuenta, hasta que Administración la restablezca. No se puede
                recuperar este mensaje después de la activación.
              </p>
              <div className="flex flex-wrap gap-3">
                <Button variant="outline" onClick={() => void copy()}>
                  <Copy size={16} />
                  Copiar mensaje
                </Button>
                <Button onClick={() => void share()}>
                  <MessageCircle size={16} />
                  Compartir
                </Button>
              </div>
            </div>
          )}
          {error && (
            <p role="alert" className="text-sm text-red-700">
              {error}
            </p>
          )}
          {notice && (
            <p role="status" className="text-sm text-muted">
              {notice}
            </p>
          )}
          <Button variant="outline" disabled={busy} onClick={close}>
            Cerrar
          </Button>
        </DialogContent>
      </Dialog>
    </>
  );
}
function Validity({
  value,
  onChange,
}: {
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <div>
      <Label htmlFor="invite-validity">Vigencia de la invitación</Label>
      <select
        id="invite-validity"
        className="form-control"
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      >
        <option value={24}>24 horas</option>
        <option value={48}>48 horas</option>
        <option value={72}>3 días</option>
        <option value={168}>7 días</option>
      </select>
    </div>
  );
}
