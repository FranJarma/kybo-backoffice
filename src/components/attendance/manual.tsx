"use client";

import { useEffect, useState } from "react";
import { ShieldCheck, KeyRound, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  localSchedule,
  scheduleInstant,
} from "@/modules/production/schedule-time";
import { addDays, canEnterAssignment } from "@/modules/attendance/rules";
import { privateRequest } from "@/components/identity/client";
import {
  Drawer,
  Field,
  Relation,
  Badge,
  clock,
  dateLabel,
  nameOf,
  kindLabel,
  type Snapshot,
  type Command,
} from "./shared";
const statuses: Record<string, string> = {
  pending: "Pendiente de aprobación",
  approved: "Código disponible",
  rejected: "Rechazada",
  used: "Fichaje registrado",
  expired: "Código vencido",
  locked: "Código bloqueado",
};
export function ManualRequests({
  data,
  busy,
  command,
}: {
  data: Snapshot;
  busy: boolean;
  command: Command;
}) {
  const [create, setCreate] = useState(false),
    [selected, setSelected] = useState<string | null>(null);
  const rows = [...data.manualRequests].sort((a, b) =>
    b.requestedAt.localeCompare(a.requestedAt),
  );
  const current = rows.find((r) => r.id === selected);
  return (
    <>
      <div className="att-section-bar">
        <div>
          <h2>Fichajes manuales</h2>
          <p>
            Solicitá una excepción y esperá la aprobación de Administración.
          </p>
        </div>
        <Button
          className="min-h-11"
          onClick={() => setCreate(true)}
          disabled={busy}
        >
          Solicitar fichaje manual
        </Button>
      </div>
      <section className="att-panel att-no-padding">
        {rows.length ? (
          rows.map((row) => (
            <button
              className="att-request-row"
              key={row.id}
              onClick={() => setSelected(row.id)}
            >
              <ShieldCheck size={22} />
              <div>
                <strong>
                  {nameOf(data, row.userId)} ·{" "}
                  {kindLabel[row.kind as keyof typeof kindLabel]}
                </strong>
                <small>
                  {dateLabel(
                    localSchedule(row.occurredAt, data.branch.timeZone),
                  )}{" "}
                  · {clock(row.occurredAt, data.branch.timeZone)} · {row.reason}
                </small>
              </div>
              <Badge
                tone={
                  row.status === "pending"
                    ? "orange"
                    : row.status === "approved"
                      ? "blue"
                      : row.status === "used"
                        ? "green"
                        : "muted"
                }
              >
                {statuses[row.status]}
              </Badge>
            </button>
          ))
        ) : (
          <div className="att-empty">
            <ShieldCheck />
            <strong>Sin solicitudes</strong>
            <p>
              Usá este circuito si un celular no puede completar el fichaje.
            </p>
          </div>
        )}
      </section>
      {create && (
        <RequestManual
          data={data}
          command={command}
          busy={busy}
          onClose={() => setCreate(false)}
        />
      )}
      {current && (
        <ManualDetail
          data={data}
          row={current}
          command={command}
          busy={busy}
          onClose={() => setSelected(null)}
        />
      )}
    </>
  );
}
function RequestManual({
  data,
  command,
  busy,
  onClose,
}: {
  data: Snapshot;
  command: Command;
  busy: boolean;
  onClose: () => void;
}) {
  const [userId, setUser] = useState(""),
    [kind, setKind] = useState<"entry" | "pause" | "resume" | "exit">("entry"),
    [time, setTime] = useState(localSchedule(data.now, data.branch.timeZone)),
    [reason, setReason] = useState(""),
    [assignmentId, setAssignment] = useState("");
  const [lookup, setLookup] = useState<{
      key: string;
      rows: Snapshot["assignments"];
      error?: string;
    } | null>(null),
    [lookupAttempt, setLookupAttempt] = useState(0);
  const lookupKey = `${userId}:${time}:${lookupAttempt}`,
    day = time.slice(0, 10);
  useEffect(() => {
    if (
      !userId ||
      kind !== "entry" ||
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(time)
    )
      return;
    const abort = new AbortController();
    privateRequest<{ ready: boolean } & Snapshot>(
      `/api/attendance?${new URLSearchParams({ userId, from: addDays(day, -1), to: day })}`,
      data.branch.id,
      undefined,
      abort.signal,
    )
      .then((result) => {
        if (!result.ready)
          throw new Error("Asistencia todavía no está habilitada.");
        const at = new Date(scheduleInstant(time, data.branch.timeZone));
        setLookup({
          key: lookupKey,
          rows: result.assignments.filter(
            (a) => a.userId === userId && canEnterAssignment(a, day, at),
          ),
        });
      })
      .catch((e) => {
        if (!abort.signal.aborted)
          setLookup({ key: lookupKey, rows: [], error: e.message });
      });
    return () => abort.abort();
  }, [
    userId,
    kind,
    time,
    day,
    lookupKey,
    data.branch.id,
    data.branch.timeZone,
  ]);
  const assignments = lookup?.key === lookupKey ? lookup.rows : [];
  const loadingAssignments =
    kind === "entry" && !!userId && lookup?.key !== lookupKey;
  const lookupError =
    kind === "entry" && lookup?.key === lookupKey ? lookup.error : "";
  const chosenAssignment = assignments.some((a) => a.id === assignmentId)
    ? assignmentId
    : assignments.length === 1
      ? assignments[0].id
      : "";
  return (
    <Drawer
      title="Solicitar fichaje manual"
      description="La solicitud no registra una marca hasta que se apruebe y se use el código."
      onClose={onClose}
      busy={busy}
    >
      <form
        className="att-stack"
        onSubmit={(e) => {
          e.preventDefault();
          void command({
            action: "requestManual",
            userId,
            kind,
            localTime: time,
            reason,
            ...(kind === "entry" && chosenAssignment
              ? { assignmentId: chosenAssignment }
              : {}),
          })
            .then(onClose)
            .catch(() => {});
        }}
      >
        <Relation
          required
          label="Empleado"
          options={data.people.filter((p) => p.active && p.enabled)}
          value={userId}
          onChange={(id) => {
            setUser(id);
            setAssignment("");
          }}
          disabled={busy}
        />
        <Field required label="Marca a registrar">
          <select
            value={kind}
            onChange={(e) => setKind(e.target.value as typeof kind)}
          >
            {Object.entries(kindLabel).map(([id, name]) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </select>
        </Field>
        <Field
          required
          label="Fecha y hora declarada"
          hint={`Hora de la sucursal · ${data.branch.timeZone}`}
        >
          <input
            type="datetime-local"
            required
            value={time}
            max={localSchedule(data.now, data.branch.timeZone)}
            onChange={(e) => setTime(e.target.value)}
          />
        </Field>
        {kind === "entry" && assignments.length > 0 && (
          <Relation
            label="Horario asignado"
            required={assignments.length > 1}
            options={assignments.map((a) => ({
              id: a.id,
              name: `${dateLabel(a.businessDate)} · ${clock(a.startsAt, data.branch.timeZone)} – ${clock(a.endsAt, data.branch.timeZone)}`,
            }))}
            value={chosenAssignment}
            onChange={setAssignment}
          />
        )}
        {loadingAssignments && (
          <p role="status" className="att-subtle">
            Consultando horarios para esa fecha…
          </p>
        )}
        {lookupError && (
          <div className="att-error" role="alert">
            {lookupError}
            <Button
              type="button"
              variant="ghost"
              onClick={() => setLookupAttempt((n) => n + 1)}
            >
              Volver a consultar horarios
            </Button>
          </div>
        )}
        <Field required label="Motivo">
          <textarea
            required
            minLength={3}
            maxLength={1000}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Por ejemplo: celular sin batería"
          />
        </Field>
        <div className="att-info">
          <ShieldCheck />
          <p>
            Otro administrador debe aprobar esta solicitud. Después podrás usar
            un código único, con la vigencia de esta sucursal.
          </p>
        </div>
        <Button
          disabled={busy || loadingAssignments || !!lookupError}
          className="min-h-12"
        >
          Enviar a Administración
        </Button>
      </form>
    </Drawer>
  );
}
function ManualDetail({
  data,
  row,
  command,
  busy,
  onClose,
}: {
  data: Snapshot;
  row: Snapshot["manualRequests"][number];
  command: Command;
  busy: boolean;
  onClose: () => void;
}) {
  const [reason, setReason] = useState(""),
    [code, setCode] = useState("");
  const canApprove =
    data.actor.role === "admin" &&
    row.requestedBy !== data.actor.id &&
    row.status === "pending";
  return (
    <Drawer
      title={`${kindLabel[row.kind as keyof typeof kindLabel]} · ${nameOf(data, row.userId)}`}
      description="Revisá los datos exactos de la excepción antes de continuar."
      onClose={onClose}
      busy={busy}
    >
      <Badge tone={row.status === "used" ? "green" : "orange"}>
        {statuses[row.status]}
      </Badge>
      <dl className="att-detail-list">
        <div>
          <dt>Hora declarada</dt>
          <dd>
            {dateLabel(localSchedule(row.occurredAt, data.branch.timeZone))} ·{" "}
            {clock(row.occurredAt, data.branch.timeZone)}
          </dd>
        </div>
        <div>
          <dt>Motivo</dt>
          <dd>{row.reason}</dd>
        </div>
        <div>
          <dt>Solicitó</dt>
          <dd>
            {nameOf(data, row.requestedBy)} ·{" "}
            {clock(row.requestedAt, data.branch.timeZone)}
          </dd>
        </div>
        {row.approvedBy && (
          <div>
            <dt>Resolvió</dt>
            <dd>
              {nameOf(data, row.approvedBy)} ·{" "}
              {clock(row.decidedAt, data.branch.timeZone)}
            </dd>
          </div>
        )}
        {row.usedAt && (
          <div>
            <dt>Registrado</dt>
            <dd>
              {clock(row.usedAt, data.branch.timeZone)} ·{" "}
              {nameOf(data, row.usedBy)}
            </dd>
          </div>
        )}
        {row.decisionReason && (
          <div>
            <dt>Respuesta</dt>
            <dd>{row.decisionReason}</dd>
          </div>
        )}
      </dl>
      {canApprove && (
        <div className="att-stack">
          <Field
            label="Comentario"
            hint="Para rechazar es obligatorio. Para aprobar podés dejarlo vacío."
          >
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              maxLength={1000}
            />
          </Field>
          <Button
            className="min-h-12"
            disabled={busy}
            onClick={() =>
              void command({
                action: "approveManual",
                id: row.id,
                reason,
              }).catch(() => {})
            }
          >
            <Check />
            Aprobar y generar código
          </Button>
          <Button
            variant="outline"
            disabled={busy || reason.trim().length < 3}
            onClick={() =>
              void command({
                action: "rejectManual",
                id: row.id,
                reason,
              }).catch(() => {})
            }
          >
            <X />
            Rechazar solicitud
          </Button>
        </div>
      )}
      {row.status === "pending" && !canApprove && (
        <p className="att-notice">
          Pendiente de aprobación de otro administrador. Todavía no hay un
          código disponible.
        </p>
      )}
      {row.codeUnavailable && (
        <p className="att-notice">
          Este código ya no está disponible. Solicitá una nueva autorización; el
          fichaje todavía no fue registrado.
        </p>
      )}
      {row.status === "approved" &&
        row.requestedBy === data.actor.id &&
        !row.codeUnavailable && (
          <form
            className="att-stack"
            onSubmit={(e) => {
              e.preventDefault();
              void command({ action: "redeemManual", id: row.id, code })
                .then(onClose)
                .catch(() => {});
            }}
          >
            {row.code && (
              <div className="att-code">
                <KeyRound />
                <small>Código privado · un solo uso</small>
                <strong>{row.code}</strong>
                <span>
                  Vence a las {clock(row.expiresAt, data.branch.timeZone)} ·{" "}
                  {row.validityMinutes} min desde la aprobación
                </span>
              </div>
            )}
            <Field required label="Código de autorización">
              <input
                autoFocus
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9]{6}"
                maxLength={6}
                required
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
              />
            </Field>
            <Button disabled={busy || code.length !== 6} className="min-h-12">
              Registrar fichaje autorizado
            </Button>
          </form>
        )}
      {["expired", "locked", "rejected"].includes(row.status) && (
        <p className="att-notice">
          Para registrar esta marca se necesita una nueva solicitud y una nueva
          aprobación.
        </p>
      )}
    </Drawer>
  );
}
