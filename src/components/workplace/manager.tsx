"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { Plus, ShieldCheck, Trash2, Users, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FieldCaption } from "@/components/ui/field-caption";
import { SearchCombobox } from "@/components/ui/search-combobox";
import { localSchedule } from "@/modules/production/schedule-time";
import type { ManagementSnapshot } from "@/modules/workplace/service";

type Snapshot = Omit<ManagementSnapshot, "manualRequests"> & {
  manualRequests: (Omit<
    ManagementSnapshot["manualRequests"][number],
    "occurredAt" | "expiresAt"
  > & { occurredAt: string; expiresAt: string | null })[];
};
type DraftRow = {
  key: string;
  userId: string;
  assignmentId?: string;
  shiftId?: string;
  stationId: string | null;
};
const kindLabels = {
  entry: "Entrada",
  pause: "Inicio de pausa",
  resume: "Fin de pausa",
  exit: "Salida",
};
const statusLabels: Record<string, string> = {
  pending: "Pendiente de Administración",
  approved: "Aprobada · ingresá el código",
  rejected: "Rechazada",
  used: "Fichaje registrado",
  locked: "Código bloqueado",
};

export function WorkplaceManager({
  branchId,
  onClose,
}: {
  branchId: string;
  onClose?: () => void;
}) {
  const [identifier, setIdentifier] = useState(""),
    [password, setPassword] = useState("");
  const [date, setDate] = useState(() =>
    localSchedule(
      new Date().toISOString(),
      "America/Argentina/Buenos_Aires",
    ).slice(0, 10),
  );
  const [data, setData] = useState<Snapshot | null>(null),
    [rows, setRows] = useState<DraftRow[]>([]);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState("");
  const [manualUser, setManualUser] = useState(""),
    [manualKind, setManualKind] = useState<keyof typeof kindLabels>("entry"),
    [manualTime, setManualTime] = useState(""),
    [reason, setReason] = useState("");
  const [codes, setCodes] = useState<Record<string, string>>({});
  const token = useRef("");
  const submission = useRef<{ fingerprint: string; requestId: string } | null>(
    null,
  );
  const loadSequence = useRef(0);

  async function request<T>(
    payload?: Record<string, unknown>,
    selectedDate = date,
  ): Promise<T> {
    const response = await fetch(
      `/api/workplace${payload ? "" : `?date=${encodeURIComponent(selectedDate)}`}`,
      {
        method: payload ? "POST" : "GET",
        cache: "no-store",
        headers: {
          "Content-Type": "application/json",
          "X-Kybo-Branch-Id": branchId,
          ...(token.current ? { "X-Kybo-Management": token.current } : {}),
        },
        ...(payload ? { body: JSON.stringify(payload) } : {}),
      },
    );
    const result = await response.json();
    if (!response.ok) {
      if (response.status === 403) {
        token.current = "";
        setData(null);
      }
      throw new Error(
        result.error ?? "No pudimos completar la gestión. Probá de nuevo.",
      );
    }
    return result as T;
  }
  async function load(selectedDate = date) {
    const sequence = ++loadSequence.current;
    const snapshot = await request<Snapshot>(undefined, selectedDate);
    if (sequence !== loadSequence.current) return;
    setData(snapshot);
    setRows(snapshot.rows.map((r, index) => ({ ...r, key: `saved-${index}` })));
  }
  useEffect(
    () => () => {
      if (!token.current) return;
      void fetch("/api/workplace", {
        method: "POST",
        keepalive: true,
        headers: {
          "Content-Type": "application/json",
          "X-Kybo-Branch-Id": branchId,
          "X-Kybo-Management": token.current,
        },
        body: JSON.stringify({ action: "exit" }),
      }).catch(() => {});
      token.current = "";
    },
    [branchId],
  );
  useEffect(() => {
    if (!data) return;
    const remaining = new Date(data.expiresAt).getTime() - Date.now();
    const id = window.setTimeout(
      () => {
        token.current = "";
        setData(null);
        setError(
          "La autorización terminó. Volvé a ingresar para gestionar el turno.",
        );
      },
      Math.max(0, remaining),
    );
    return () => window.clearTimeout(id);
  }, [data]);
  function operationId(payload: Record<string, unknown>) {
    const fingerprint = JSON.stringify(payload);
    if (submission.current?.fingerprint !== fingerprint)
      submission.current = { fingerprint, requestId: crypto.randomUUID() };
    return submission.current.requestId;
  }
  async function login(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");
    const suppliedPassword = password;
    setPassword("");
    try {
      const grant = await request<{ token: string }>({
        action: "authorize",
        identifier,
        password: suppliedPassword,
      });
      token.current = grant.token;
      await load();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "No hay conexión. Probá de nuevo.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function exit() {
    setBusy(true);
    setError("");
    try {
      if (token.current) await request({ action: "exit" });
      token.current = "";
      setData(null);
      onClose?.();
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "No pudimos cerrar la gestión. Reintentá.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function save(event: FormEvent) {
    event.preventDefault();
    if (!data) return;
    setBusy(true);
    setError("");
    const payload = {
      action: "save",
      businessDate: date,
      expectedRevision: data.revision,
      rows: rows.map((r) => ({
        userId: r.userId,
        assignmentId: r.assignmentId,
        shiftId: r.shiftId,
        stationId: r.stationId,
      })),
    };
    try {
      await request({ ...payload, requestId: operationId(payload) });
      token.current = "";
      setData(null);
      setMessage("Puestos guardados. Volviste a la atención habitual.");
      window.dispatchEvent(
        new CustomEvent("kybo:workplace-changed", { detail: { branchId } }),
      );
      onClose?.();
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "No hay conexión. Reintentá para confirmar el mismo guardado.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function manual(payload: Record<string, unknown>) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await request({ ...payload, requestId: operationId(payload) });
      setReason("");
      setCodes({});
      setMessage(
        payload.action === "requestManual"
          ? "Solicitud enviada a Administración. Ingresá el código cuando la aprueben."
          : "Fichaje manual registrado.",
      );
      await load();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "No hay conexión. Probá de nuevo.",
      );
    } finally {
      setBusy(false);
    }
  }
  const alert = error ? (
    <p
      role="alert"
      className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
    >
      {error}
    </p>
  ) : null;
  if (!data)
    return (
      <section className="space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <span className="mb-3 flex size-12 items-center justify-center rounded-2xl bg-blue-50 text-brand">
              <ShieldCheck size={24} />
            </span>
            <h2 className="text-2xl font-semibold tracking-tight text-brand">
              Gestionar turno
            </h2>
            <p className="mt-2 max-w-lg text-sm leading-relaxed text-muted">
              Autorizá con tu cuenta personal para organizar los puestos o
              solicitar una excepción.
            </p>
          </div>
          {onClose && (
            <Button
              variant="ghost"
              size="icon"
              aria-label="Volver al pedido"
              onClick={() => void exit()}
              disabled={busy}
            >
              <X />
            </Button>
          )}
        </div>
        <div className="rounded-xl border border-line bg-surface px-4 py-3 text-sm leading-relaxed text-muted">
          El pedido que estás tomando se conserva. Al guardar o salir volvés a
          la cuenta del local.
        </div>
        {message && (
          <p role="status" className="text-sm text-emerald-700">
            {message}
          </p>
        )}
        {alert}
        <form onSubmit={login} className="space-y-5">
          <fieldset disabled={busy} className="space-y-5">
            <div>
              <Label htmlFor="workplace-identifier" required>
                Usuario o correo personal
              </Label>
              <Input
                id="workplace-identifier"
                className="mt-2 h-11"
                autoComplete="username"
                autoCapitalize="none"
                spellCheck={false}
                required
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="workplace-password" required>
                Contraseña
              </Label>
              <Input
                id="workplace-password"
                className="mt-2 h-11"
                autoComplete="current-password"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            <div className="flex justify-end gap-3">
              <Button
                variant="outline"
                type="button"
                onClick={() => void exit()}
              >
                Volver al pedido
              </Button>
              <Button className="min-h-11" type="submit">
                {busy ? "Autorizando…" : "Autorizar gestión"}
                <ShieldCheck size={17} />
              </Button>
            </div>
          </fieldset>
        </form>
      </section>
    );
  const update = (key: string, patch: Partial<DraftRow>) =>
    setRows((current) =>
      current.map((r) => (r.key === key ? { ...r, ...patch } : r)),
    );
  const stations = [{ id: "sales", name: "Punto de venta" }, ...data.stations];
  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted">
            Gestión del turno
          </p>
          <h2 className="text-2xl font-semibold tracking-tight text-brand">
            Organizá los puestos
          </h2>
        </div>
        <Button variant="outline" disabled={busy} onClick={() => void exit()}>
          Salir de la gestión
          <X size={16} />
        </Button>
      </div>
      <div className="flex items-center gap-3 rounded-xl border border-blue-100 bg-blue-50/70 px-4 py-3">
        <ShieldCheck className="shrink-0 text-brand" size={22} />
        <div>
          <strong className="block text-sm text-brand">
            Estás gestionando como {data.managerName}
          </strong>
          <span className="text-xs text-muted">
            La autorización termina al guardar o salir. Solo organiza este
            turno.
          </span>
        </div>
      </div>
      {alert}
      {message && (
        <p role="status" className="text-sm text-emerald-700">
          {message}
        </p>
      )}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Label htmlFor="workplace-date" required>
            Fecha del turno
          </Label>
          <Input
            id="workplace-date"
            className="mt-2 w-auto"
            type="date"
            value={date}
            disabled={busy}
            onChange={(e) => {
              const selected = e.target.value;
              if (!selected) return;
              setDate(selected);
              setBusy(true);
              setError("");
              void load(selected)
                .catch((e) => setError(e.message))
                .finally(() => setBusy(false));
            }}
          />
        </div>
        <p className="max-w-sm text-xs leading-relaxed text-muted">
          Los horarios y pausas son los configurados en la planificación. Cada
          responsable conserva sus permisos personales.
        </p>
      </div>
      <form onSubmit={save} className="space-y-4">
        <fieldset disabled={busy} className="space-y-3">
          <div className="hidden grid-cols-[1fr_1fr_1fr_2rem] gap-3 px-4 text-xs font-semibold text-muted md:grid">
            <FieldCaption required>Responsable</FieldCaption>
            <FieldCaption required>Horario</FieldCaption>
            <FieldCaption required>Puesto</FieldCaption>
            <span />
          </div>
          {rows.map((r) => {
            const schedules = data.schedules.filter(
              (s) => s.userId === r.userId,
            );
            const scheduleOptions = [
              ...schedules.map((s) => ({
                id: s.id,
                name: `${s.name} · ${localSchedule(s.startsAt, data.timeZone).slice(11, 16)}–${localSchedule(s.endsAt, data.timeZone).slice(11, 16)}`,
              })),
              ...data.shifts
                .filter((s) => !schedules.some((a) => a.shiftId === s.id))
                .map((s) => ({
                  id: `shift:${s.id}`,
                  name: `${s.name} · ${s.start}–${s.end}${s.overnight ? " (+1 día)" : ""}`,
                })),
            ];
            const scheduleValue =
              r.assignmentId ?? (r.shiftId ? `shift:${r.shiftId}` : "");
            return (
              <div
                key={r.key}
                className="grid gap-3 rounded-xl border border-line bg-white p-4 md:grid-cols-[1fr_1fr_1fr_2rem] md:items-center"
              >
                <div className="space-y-2 md:space-y-0">
                  <Label
                    htmlFor={`worker-${r.key}`}
                    required
                    className="md:sr-only"
                  >
                    Responsable
                  </Label>
                  <SearchCombobox
                    id={`worker-${r.key}`}
                    label="Responsable"
                    value={r.userId}
                    selectedLabel={
                      data.people.find((p) => p.id === r.userId)?.name ?? ""
                    }
                    options={data.people}
                    required
                    disabled={busy}
                    onSearch={() => {}}
                    onChange={(id) =>
                      update(r.key, {
                        userId: id,
                        assignmentId: undefined,
                        shiftId: undefined,
                      })
                    }
                    placeholder="Elegir responsable…"
                  />
                </div>
                <div className="space-y-2 md:space-y-0">
                  <Label
                    htmlFor={`schedule-${r.key}`}
                    required
                    className="md:sr-only"
                  >
                    Horario
                  </Label>
                  <SearchCombobox
                    id={`schedule-${r.key}`}
                    label="Horario"
                    value={scheduleValue}
                    selectedLabel={
                      scheduleOptions.find((s) => s.id === scheduleValue)
                        ?.name ?? ""
                    }
                    options={scheduleOptions}
                    required
                    disabled={busy || !r.userId}
                    onSearch={() => {}}
                    onChange={(id) =>
                      update(
                        r.key,
                        id.startsWith("shift:")
                          ? { assignmentId: undefined, shiftId: id.slice(6) }
                          : {
                              assignmentId: id || undefined,
                              shiftId:
                                schedules.find((s) => s.id === id)?.shiftId ??
                                undefined,
                            },
                      )
                    }
                    placeholder="Elegir horario…"
                  />
                </div>
                <div className="space-y-2 md:space-y-0">
                  <Label
                    htmlFor={`station-${r.key}`}
                    required
                    className="md:sr-only"
                  >
                    Puesto
                  </Label>
                  <SearchCombobox
                    id={`station-${r.key}`}
                    label="Puesto"
                    value={r.stationId ?? "sales"}
                    selectedLabel={
                      stations.find((s) => s.id === (r.stationId ?? "sales"))
                        ?.name ?? ""
                    }
                    options={stations}
                    required
                    disabled={busy}
                    onSearch={() => {}}
                    onChange={(id) =>
                      update(r.key, {
                        stationId: id === "sales" || !id ? null : id,
                      })
                    }
                  />
                </div>
                <Button
                  variant="ghost"
                  type="button"
                  size="icon"
                  aria-label="Quitar asignación"
                  onClick={() =>
                    setRows((current) =>
                      current.filter((row) => row.key !== r.key),
                    )
                  }
                >
                  <Trash2 size={17} />
                </Button>
              </div>
            );
          })}
          {!rows.length && (
            <div className="rounded-xl border border-dashed border-line px-5 py-7 text-center text-sm text-muted">
              <Users className="mx-auto mb-2" size={24} />
              Agregá las responsables de esta jornada.
            </div>
          )}
          <Button
            variant="outline"
            type="button"
            onClick={() =>
              setRows((current) => [
                ...current,
                { key: crypto.randomUUID(), userId: "", stationId: null },
              ])
            }
          >
            <Plus size={16} />
            Agregar responsable
          </Button>
          <p className="pt-2 text-xs leading-relaxed text-muted">
            La responsable asignada organiza el trabajo. Las ventas siguen
            registrándose con la cuenta del local.
          </p>
          <div className="flex justify-end border-t border-line pt-4">
            <Button type="submit" className="min-h-11">
              {busy ? "Guardando…" : "Guardar y volver al pedido"}
            </Button>
          </div>
        </fieldset>
      </form>
      <details className="border-t border-line pt-5">
        <summary className="cursor-pointer text-sm font-semibold text-brand">
          Solicitar un fichaje manual
        </summary>
        <p className="mt-3 text-xs leading-relaxed text-muted">
          Usalo si la persona no puede fichar con su celular. Administración
          debe aprobar la solicitud y compartir el código de un solo uso.
        </p>
        <form
          className="mt-4 space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            void manual({
              action: "requestManual",
              userId: manualUser,
              kind: manualKind,
              localTime: manualTime,
              reason,
            });
          }}
        >
          <fieldset className="grid gap-4 sm:grid-cols-2" disabled={busy}>
            <div className="sm:col-span-2">
              <Label htmlFor="manual-person" required>
                Persona
              </Label>
              <div className="mt-2">
                <SearchCombobox
                  id="manual-person"
                  label="Persona"
                  value={manualUser}
                  selectedLabel={
                    data.people.find((p) => p.id === manualUser)?.name ?? ""
                  }
                  options={data.people}
                  required
                  onSearch={() => {}}
                  onChange={setManualUser}
                />
              </div>
            </div>
            <div>
              <Label htmlFor="manual-kind" required>
                Marca
              </Label>
              <select
                id="manual-kind"
                className="form-control mt-2"
                value={manualKind}
                onChange={(e) =>
                  setManualKind(e.target.value as keyof typeof kindLabels)
                }
              >
                {Object.entries(kindLabels).map(([id, name]) => (
                  <option key={id} value={id}>
                    {name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label htmlFor="manual-time" required>
                Fecha y hora declarada
              </Label>
              <Input
                id="manual-time"
                className="mt-2"
                required
                type="datetime-local"
                value={manualTime}
                onChange={(e) => setManualTime(e.target.value)}
              />
            </div>
            <div className="sm:col-span-2">
              <Label htmlFor="manual-reason" required>
                Motivo
              </Label>
              <Input
                id="manual-reason"
                className="mt-2"
                required
                minLength={3}
                maxLength={1000}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </div>
            <div className="sm:col-span-2">
              <Button type="submit" variant="outline">
                Solicitar aprobación
              </Button>
            </div>
          </fieldset>
        </form>
        <div className="mt-5 space-y-3">
          {data.manualRequests.map((r) => (
            <article
              key={r.id}
              className="rounded-xl border border-line p-4 text-sm"
            >
              <strong>
                {data.people.find((p) => p.id === r.userId)?.name ?? "Persona"}{" "}
                · {kindLabels[r.kind]}
              </strong>
              <p className="mt-1 text-xs text-muted">
                {localSchedule(r.occurredAt, data.timeZone).replace("T", " ")} ·{" "}
                {statusLabels[r.status] ?? r.status}
              </p>
              {r.status === "approved" && (
                <form
                  className="mt-3 flex flex-wrap gap-3"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void manual({
                      action: "redeemManual",
                      id: r.id,
                      code: codes[r.id] ?? "",
                    });
                  }}
                >
                  <Input
                    aria-label="Código de aprobación"
                    className="max-w-40"
                    autoComplete="one-time-code"
                    inputMode="numeric"
                    pattern="[0-9]{6}"
                    required
                    maxLength={6}
                    value={codes[r.id] ?? ""}
                    onChange={(e) =>
                      setCodes((current) => ({
                        ...current,
                        [r.id]: e.target.value,
                      }))
                    }
                  />
                  <Button type="submit" disabled={busy} variant="outline">
                    Registrar fichaje
                  </Button>
                </form>
              )}
            </article>
          ))}
        </div>
        <Button
          className="mt-3"
          variant="ghost"
          disabled={busy}
          onClick={() => {
            setBusy(true);
            void load()
              .catch((e) => setError(e.message))
              .finally(() => setBusy(false));
          }}
        >
          Actualizar solicitudes
        </Button>
      </details>
    </section>
  );
}
