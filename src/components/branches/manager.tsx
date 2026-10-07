"use client";
import { useEffect, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { getJson } from "@/components/inventory/shared";
import { BranchMembers } from "./members";
import { BranchProductSettings } from "./product-settings";
type Branch = {
  id: string;
  code: string;
  name: string;
  timeZone: string;
  revision: number;
};
export function BranchManager({
  admin,
  canEditCatalog,
}: {
  admin: boolean;
  canEditCatalog: boolean;
}) {
  const [branches, setBranches] = useState<Branch[]>([]),
    [selected, setSelected] = useState("");
  const [name, setName] = useState(""),
    [code, setCode] = useState(""),
    [timeZone, setTimeZone] = useState("America/Argentina/Buenos_Aires");
  const [locationName, setLocationName] = useState(""),
    [locationCode, setLocationCode] = useState("");
  const [locations, setLocations] = useState<
    { id: string; name: string; code: string; revision: number }[]
  >([]);
  const [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [revision, setRevision] = useState(0);
  useEffect(() => {
    let live = true;
    getJson<{ rows: Branch[] }>("/api/branches")
      .then((r) => {
        if (live) setBranches(r.rows);
      })
      .catch(() => {
        if (live) setError("No se pudieron cargar las sucursales.");
      });
    return () => {
      live = false;
    };
  }, [revision]);
  useEffect(() => {
    if (!selected) return;
    let live = true;
    getJson<{ rows: typeof locations }>(`/api/branches/${selected}/locations`)
      .then((r) => {
        if (live) setLocations(r.rows);
      })
      .catch(() => {
        if (live) setError("No se pudieron cargar las ubicaciones.");
      });
    return () => {
      live = false;
    };
  }, [selected, revision]);
  async function save(event: FormEvent, create: boolean) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch(
        create ? "/api/branches" : `/api/branches/${selected}/locations`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            create
              ? {
                  code,
                  name,
                  timeZone,
                  locations: [{ code: locationCode, name: locationName }],
                }
              : { code: locationCode, name: locationName },
          ),
        },
      );
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "No se pudo guardar.");
      setNotice(
        create
          ? "Sucursal creada. Asigná accesos y configurá los productos antes de operar."
          : "Ubicación creada.",
      );
      setLocationName("");
      setLocationCode("");
      if (create) {
        setName("");
        setCode("");
        setSelected(body.id);
      }
      setRevision((r) => r + 1);
    } catch (error) {
      setError(error instanceof Error ? error.message : "No se pudo guardar.");
    } finally {
      setBusy(false);
    }
  }
  async function archive(locationId?: string, expectedRevision?: number) {
    const branch = branches.find((b) => b.id === selected);
    if (!branch) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch(
        `/api/branches/${selected}${locationId ? "/locations" : ""}`,
        {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            locationId
              ? { locationId, revision: expectedRevision }
              : { revision: branch.revision },
          ),
        },
      );
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "No se pudo archivar.");
      setNotice(
        locationId
          ? "Ubicación archivada. Se conserva su historial."
          : "Sucursal archivada. Se conserva su historial.",
      );
      if (!locationId) {
        setSelected("");
        setLocations([]);
      }
      setRevision((v) => v + 1);
    } catch (error) {
      setError(error instanceof Error ? error.message : "No se pudo archivar.");
    } finally {
      setBusy(false);
    }
  }
  const locationFields = (
    <>
      <label className="space-y-2 text-sm font-semibold">
        Nombre de ubicación
        <Input
          value={locationName}
          onChange={(e) => setLocationName(e.target.value)}
          required
          maxLength={160}
        />
      </label>
      <label className="space-y-2 text-sm font-semibold">
        Código de ubicación
        <Input
          value={locationCode}
          onChange={(e) => setLocationCode(e.target.value)}
          required
          maxLength={64}
          placeholder="DEPOSITO"
        />
      </label>
    </>
  );
  return (
    <section className="space-y-6">
      <div>
        <p className="eyebrow">Organización</p>
        <h1 className="mt-1 text-3xl font-extrabold text-brand">
          Sucursales y ubicaciones
        </h1>
        <p className="mt-2 text-muted">
          Un catálogo compartido. Existencias y tareas propias de cada local.
        </p>
      </div>
      {error && (
        <p role="alert" className="rounded-lg bg-red-50 p-3 text-red-800">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="rounded-lg bg-green-50 p-3 text-green-900">
          {notice}
        </p>
      )}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="p-6">
          <h2 className="text-lg font-bold">Sucursales disponibles</h2>
          <div className="my-4 divide-y">
            {branches.map((branch) => (
              <button
                key={branch.id}
                type="button"
                onClick={() => {
                  setSelected(branch.id);
                  setLocations([]);
                }}
                className={`flex w-full items-center justify-between py-4 text-left ${selected === branch.id ? "font-bold text-brand" : ""}`}
              >
                <span>
                  {branch.name}
                  <small className="block font-normal text-muted">
                    {branch.code} · {branch.timeZone}
                  </small>
                </span>
                <span aria-hidden>→</span>
              </button>
            ))}
            {branches.length === 0 && (
              <p className="py-4 text-muted">
                Todavía no tenés sucursales asignadas.
              </p>
            )}
          </div>
          {selected && (
            <>
              <h3 className="font-bold">
                Ubicaciones de {branches.find((b) => b.id === selected)?.name}
              </h3>
              <ul className="my-3 space-y-2">
                {locations.map((location) => (
                  <li key={location.id}>
                    {location.name}{" "}
                    <span className="text-xs text-muted">{location.code}</span>
                    {admin && (
                      <Button
                        type="button"
                        variant="ghost"
                        disabled={busy}
                        onClick={() =>
                          void archive(location.id, location.revision)
                        }
                      >
                        Archivar ubicación vacía
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
              <form
                onSubmit={(e) => void save(e, false)}
                className="grid gap-3"
              >
                <fieldset disabled={busy} className="grid gap-3">
                  {locationFields}
                  <Button type="submit">Agregar ubicación</Button>
                </fieldset>
              </form>
            </>
          )}
        </Card>
        {admin && (
          <Card className="p-6">
            <h2 className="mb-4 text-lg font-bold">Abrir una sucursal</h2>
            <form onSubmit={(e) => void save(e, true)}>
              <fieldset disabled={busy} className="grid gap-4">
                <label className="space-y-2 text-sm font-semibold">
                  Nombre
                  <Input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                    maxLength={160}
                  />
                </label>
                <label className="space-y-2 text-sm font-semibold">
                  Código
                  <Input
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    required
                    maxLength={64}
                  />
                </label>
                <label className="space-y-2 text-sm font-semibold">
                  Zona horaria
                  <Input
                    value={timeZone}
                    onChange={(e) => setTimeZone(e.target.value)}
                    required
                  />
                </label>
                <p className="text-sm text-muted">Primera ubicación</p>
                {locationFields}
                <Button type="submit">Crear sucursal</Button>
              </fieldset>
            </form>
          </Card>
        )}
      </div>
      {selected && admin && (
        <Button
          type="button"
          variant="outline"
          disabled={busy}
          onClick={() => void archive()}
        >
          Archivar sucursal sin operaciones pendientes
        </Button>
      )}
      {selected && admin && (
        <BranchMembers key={`members:${selected}`} branchId={selected} />
      )}
      {selected && (
        <BranchProductSettings
          key={selected}
          branchId={selected}
          locations={locations}
          canEditCatalog={canEditCatalog}
        />
      )}
    </section>
  );
}
