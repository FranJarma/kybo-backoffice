"use client";

import { useState } from "react";
import { MapPin, ShieldCheck, Timer } from "lucide-react";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { useBranchAddress } from "@/components/branches/use-address";
import { ManagedDevices } from "@/components/identity/managed-devices";
import { Field, type Snapshot, type Command } from "./shared";
export function AttendanceSettings({
  data,
  busy,
  command,
}: {
  data: Snapshot;
  busy: boolean;
  command: Command;
}) {
  if (data.actor.role !== "admin")
    return <p>Solo Administración puede configurar Asistencia.</p>;
  return (
    <SettingsForm
      key={`${data.branch.id}:${data.settings?.revision ?? 0}`}
      data={data}
      busy={busy}
      command={command}
    />
  );
}
function SettingsForm({
  data,
  busy,
  command,
}: {
  data: Snapshot;
  busy: boolean;
  command: Command;
}) {
  const policy = data.settings;
  const location = useBranchAddress(data.branch.id);
  const latitude = location.data?.address?.latitude ?? policy?.latitude ?? null;
  const longitude =
    location.data?.address?.longitude ?? policy?.longitude ?? null;
  const [deviceUser, setDeviceUser] = useState<string | null>(null);
  const [radius, setRadius] = useState(policy?.radiusMeters ?? 100),
    [accuracy, setAccuracy] = useState(policy?.maxAccuracyMeters ?? 40),
    [ttl, setTtl] = useState(policy?.codeValidityMinutes ?? 10),
    [enabled, setEnabled] = useState(policy?.enabled ?? false),
    [stepUp, setStepUp] = useState(policy?.requireStepUp ?? false);
  return (
    <>
      <form
        className="att-settings-grid"
        onSubmit={(event) => {
          event.preventDefault();
          void command({
            action: "configure",
            expectedRevision: policy?.revision ?? 0,
            enabled,
            latitude,
            longitude,
            radiusMeters: radius,
            maxAccuracyMeters: accuracy,
            codeValidityMinutes: ttl,
            requireStepUp: stepUp,
          }).catch(() => {});
        }}
      >
        <section className="att-panel">
          <div className="att-panel-title">
            <h2>Zona de fichaje</h2>
            <MapPin />
          </div>
          <div className="att-info">
            <MapPin aria-hidden="true" />
            <div>
              <strong>Dirección de la sucursal</strong>
              {location.loading ? (
                <p role="status">Consultando la dirección del local…</p>
              ) : location.error ? (
                <>
                  <p role="alert">{location.error}</p>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={location.refresh}
                  >
                    Volver a cargar dirección
                  </Button>
                </>
              ) : (
                <p>
                  {location.data?.address?.address ??
                    (latitude !== null && longitude !== null
                      ? "Hay un punto anterior guardado. Centralizá su dirección para editarlo desde la ficha del local."
                      : "Agregá la dirección y confirmá el punto del mapa para habilitar el fichaje.")}
                </p>
              )}
              <Link
                href={`/settings/branches?branch=${encodeURIComponent(data.branch.id)}`}
                className="inline-flex min-h-10 items-center font-semibold text-blue hover:underline"
              >
                Configurar dirección del local →
              </Link>
            </div>
          </div>
          <p>
            El celular debe estar dentro del radio del punto confirmado, con
            suficiente precisión.
          </p>
          <div className="att-form-grid">
            <Field label="Radio permitido (metros)" required>
              <input
                type="number"
                min={1}
                max={10000}
                required
                value={radius}
                onChange={(e) => setRadius(Number(e.target.value))}
              />
            </Field>
            <Field
              label="Precisión máxima (metros)"
              required
              hint="Debe ser menor o igual al radio."
            >
              <input
                type="number"
                min={1}
                max={Math.min(radius, 1000)}
                required
                value={accuracy}
                onChange={(e) => setAccuracy(Number(e.target.value))}
              />
            </Field>
          </div>
          <label className="att-check">
            <input
              type="checkbox"
              checked={enabled}
              disabled={
                busy ||
                location.loading ||
                !!location.error ||
                latitude === null ||
                longitude === null
              }
              onChange={(e) => setEnabled(e.target.checked)}
            />
            Habilitar fichajes en esta sucursal
          </label>
        </section>
        <section className="att-panel">
          <div className="att-panel-title">
            <h2>Autorizaciones</h2>
            <Timer />
          </div>
          <Field
            label="Vigencia del código (minutos)"
            required
            hint="Empieza al aprobar la solicitud. Los cambios se aplican a códigos nuevos."
          >
            <input
              type="number"
              required
              min={1}
              max={1440}
              value={ttl}
              onChange={(e) => setTtl(Number(e.target.value))}
            />
          </Field>
          <div className="att-info">
            <ShieldCheck />
            <p>
              Cada excepción necesita aprobación de otro administrador. El
              código se muestra solo a quien la solicitó y sirve una sola vez.
            </p>
          </div>
          <label className="att-check">
            <input
              type="checkbox"
              checked={stepUp}
              onChange={(e) => setStepUp(e.target.checked)}
            />
            Exigir verificación al comenzar producción y cerrar caja
          </label>
          <p className="att-subtle">
            Activá esta opción cuando el equipo haya registrado sus
            dispositivos. Estas dos operaciones no requieren ubicación.
          </p>
          <Button
            disabled={busy || location.loading || !!location.error}
            className="min-h-12 w-full"
          >
            Guardar configuración
          </Button>
        </section>
      </form>
      <section className="att-panel">
        <h2>Personal habilitado para fichar</h2>
        <p>
          Los horarios y permisos operativos de cada cuenta se conservan por
          separado.
        </p>
        {data.people.map((person) => (
          <div className="att-participant" key={person.id}>
            <span>
              <strong>{person.name}</strong>
              <small>
                {person.active ? "Cuenta activa" : "Cuenta inactiva"}
              </small>
            </span>
            <input
              aria-label={`Habilitar fichaje de ${person.name}`}
              type="checkbox"
              disabled={busy || !person.active || !policy}
              checked={person.enabled}
              onChange={(e) =>
                void command({
                  action: "participant",
                  userId: person.id,
                  enabled: e.target.checked,
                }).catch(() => {})
              }
            />
            <Button
              type="button"
              variant="ghost"
              onClick={() => setDeviceUser(person.id)}
            >
              Dispositivos
            </Button>
          </div>
        ))}
      </section>
      {deviceUser && (
        <ManagedDevices
          branchId={data.branch.id}
          userId={deviceUser}
          name={
            data.people.find((p) => p.id === deviceUser)?.name ?? "Empleado"
          }
          onClose={() => setDeviceUser(null)}
        />
      )}
    </>
  );
}
