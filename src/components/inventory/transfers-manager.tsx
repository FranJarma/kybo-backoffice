"use client";
import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { ArrowRight, ArrowLeft, PackageCheck, Truck, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { FieldCaption } from "@/components/ui/field-caption";
import { OperationAlert } from "@/components/ui/operation-alert";
import { useErrorFeedback } from "@/components/ui/use-error-feedback";
import { getJson, SearchSelect, useOperation } from "./shared";
import { integer, six } from "@/modules/inventory/decimal";
import {
  transferEntryUnit,
  parseTransferQuantity,
  formatTransferQuantity,
} from "@/modules/transfers/quantities";
import type { CatalogRow } from "@/modules/catalog/types";

type Allocation = {
  id: string;
  itemName: string;
  baseUnit: string;
  quantity: string;
  received: string;
  resolved: string;
};
type Transfer = {
  id: string;
  originBranchId: string;
  destinationBranchId: string;
  originLocationId: string;
  destinationLocationId: string;
  reason: string;
  state: string;
  revision: number;
  allocations: Allocation[];
};
type Directory = {
  hasMore: boolean;
  branchId: string;
  destinations: {
    id: string;
    name: string;
    branchName: string;
    branchId: string;
  }[];
  rows: Transfer[];
};
const labels: Record<string, string> = {
  confirmed: "Reservado",
  in_transit: "En tránsito",
  received: "Recibido",
  resolved: "Diferencia resuelta",
  cancelled: "Anulado",
};
const fieldClass =
  "grid min-w-0 content-start gap-2 text-sm font-semibold text-brand";
const selectClass =
  "min-h-12 w-full rounded-lg border bg-white px-3 text-sm font-normal";

export function TransfersManager({ actorId }: { actorId: string }) {
  const quantityId = useId();
  const originId = useId();
  const [originLocations, setOriginLocations] =
    useState<{ id: string; name: string; code: string }[]>();
  const [originLoadError, setOriginLoadError] = useState("");
  const [changingOrigin, setChangingOrigin] = useState(false);
  const restoreOriginFocus = useRef(false);
  const [offset, setOffset] = useState(0),
    [scope, setScope] = useState("active");
  const [data, setData] = useState<Directory>(),
    [version, setVersion] = useState(0),
    [error, setError, errorAttempt] = useErrorFeedback();
  const [originOverride, setOriginOverride] = useState<string | null>(null),
    [destination, setDestination] = useState(""),
    [itemId, setItemId] = useState(""),
    [item, setItem] = useState<CatalogRow>(),
    [amount, setAmount] = useState(""),
    [reason, setReason] = useState("");
  const depot =
    originLocations?.find((location) => location.code === "DEPOSITO") ??
    originLocations?.find(
      (location) =>
        location.name.localeCompare("Depósito principal", "es", {
          sensitivity: "base",
        }) === 0,
    );
  const origin = originOverride ?? depot?.id ?? "";
  const originInfo = originLocations?.find(
    (location) => location.id === origin,
  );
  const focusOriginSelect = useCallback(
    (select: HTMLSelectElement | null) => {
      if (changingOrigin) select?.focus();
    },
    [changingOrigin],
  );
  const focusOriginButton = useCallback((button: HTMLButtonElement | null) => {
    if (button && restoreOriginFocus.current) {
      button.focus();
      restoreOriginFocus.current = false;
    }
  }, []);
  const onSuccess = useCallback(() => {
    setVersion((v) => v + 1);
    setError("");
  }, [setError]);
  const operation = useOperation<Record<string, unknown>>(
    actorId,
    "transfer",
    onSuccess,
  );
  const entryUnit = transferEntryUnit(item?.baseUnit);
  const destinationInfo = data?.destinations.find((d) => d.id === destination);
  const sameBranch = !!data && destinationInfo?.branchId === data.branchId;
  useEffect(() => {
    let live = true;
    getJson<{ locations: NonNullable<typeof originLocations> }>(
      "/api/branches/current",
    )
      .then((result) => {
        if (live) setOriginLocations(result.locations);
      })
      .catch(() => {
        if (live) {
          setOriginLocations([]);
          setOriginLoadError(
            "No pudimos cargar las ubicaciones de origen. Actualizá la página para volver a intentar.",
          );
        }
      });
    return () => {
      live = false;
    };
  }, []);
  useEffect(() => {
    let live = true;
    getJson<Directory>(`/api/transfers?scope=${scope}&offset=${offset}`)
      .then((result) => {
        if (live) {
          setData(result);
          setError("");
        }
      })
      .catch((e) => {
        if (live) setError(e.message);
      });
    return () => {
      live = false;
    };
  }, [version, scope, offset, setError]);
  function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    try {
      const quantity = parseTransferQuantity(amount, item?.baseUnit);
      if (origin === destination)
        throw new Error("Elegí una ubicación de destino distinta del origen.");
      operation.submit("/api/transfers", {
        requestId: crypto.randomUUID(),
        originLocationId: origin,
        destinationLocationId: destination,
        reason,
        demands: [{ itemId, quantity }],
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Revisá la cantidad.");
    }
  }
  function chooseOrigin(value: string | null) {
    const next = value ?? depot?.id ?? "";
    setOriginOverride(value);
    if (next === destination) setDestination("");
    if (next) {
      restoreOriginFocus.current = true;
      setChangingOrigin(false);
    }
  }
  return (
    <section data-transfers className="space-y-7 text-brand">
      <header>
        <p className="eyebrow">Inventario y compras</p>
        <h1 className="text-3xl font-extrabold">Traslados</h1>
        <p className="mt-2 max-w-3xl text-muted">
          Reponé Barra o Cocina desde Depósito. Para devoluciones u otros
          movimientos, usá “Cambiar origen”.
        </p>
      </header>
      <OperationAlert
        title="No pudimos completar el traslado"
        message={error || operation.error || originLoadError}
        eventKey={error ? errorAttempt : operation.errorAttempt}
        tone="error"
      />
      {operation.uncertain && (
        <Button
          className="min-h-12"
          onClick={operation.retry}
          disabled={operation.busy}
        >
          Reintentar el mismo envío
        </Button>
      )}
      <Card className="gap-0 overflow-hidden p-0">
        <div className="border-b p-5 sm:px-6">
          <h2 className="text-lg font-bold">Nuevo traslado</h2>
          <p className="mt-1 text-sm text-muted">
            Primero reservá los insumos. Después confirmá que se realizó el
            traslado.
          </p>
        </div>
        <form onSubmit={submit}>
          <fieldset
            disabled={operation.locked}
            className="grid items-start gap-5 p-5 sm:grid-cols-2 sm:p-6 [&_input]:min-h-12 [&_select]:min-h-12 [&_input[role=combobox]]:min-h-12 [&_label]:text-sm"
          >
            <div className={fieldClass}>
              <span id={originId}>
                <FieldCaption required>Origen</FieldCaption>
              </span>
              {originLocations && (changingOrigin || !originInfo) ? (
                <div className="grid gap-2">
                  <select
                    id={`${originId}-select`}
                    aria-labelledby={originId}
                    ref={focusOriginSelect}
                    required
                    value={origin}
                    onChange={(event) => chooseOrigin(event.target.value)}
                    className={selectClass}
                  >
                    <option value="">Elegí una ubicación de origen</option>
                    {originLocations.map((location) => (
                      <option key={location.id} value={location.id}>
                        {location.name}
                      </option>
                    ))}
                  </select>
                  {depot && (
                    <Button
                      type="button"
                      variant="ghost"
                      className="w-fit text-blue"
                      onClick={() => chooseOrigin(null)}
                    >
                      Usar depósito principal
                    </Button>
                  )}
                  {!depot && (
                    <p className="text-xs font-normal text-muted">
                      No hay un depósito principal identificado. Elegí el origen
                      de este traslado.
                    </p>
                  )}
                </div>
              ) : (
                <div
                  role="group"
                  aria-label="Origen seleccionado"
                  className="flex min-h-12 items-center justify-between gap-2 rounded-lg border bg-surface pl-3 pr-1"
                >
                  <span className="text-sm font-normal">
                    {originInfo?.name ?? "Cargando ubicaciones…"}
                  </span>
                  <Button
                    ref={focusOriginButton}
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="shrink-0 px-2 text-blue"
                    disabled={!originInfo}
                    onClick={() => setChangingOrigin(true)}
                  >
                    Cambiar origen
                  </Button>
                </div>
              )}
            </div>
            <label className={fieldClass}>
              <FieldCaption required>Destino</FieldCaption>
              <select
                required
                disabled={!origin}
                value={destination}
                onChange={(e) => setDestination(e.target.value)}
                className={selectClass}
              >
                <option value="">Elegí una ubicación de destino</option>
                {data?.destinations
                  .filter((d) => d.id !== origin)
                  .map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.branchId === data.branchId
                        ? d.name
                        : `${d.branchName} · ${d.name}`}
                    </option>
                  ))}
              </select>
            </label>
            <SearchSelect
              entity="items"
              label="Artículo"
              value={itemId}
              onChange={(id, row) => {
                if (id !== itemId) setAmount("");
                setItemId(id);
                setItem(row);
              }}
              filter={(row) => row.stockTracked !== false}
              required
            />
            <div className={fieldClass}>
              <label htmlFor={quantityId}>
                <FieldCaption required>
                  Cantidad{entryUnit ? ` (${entryUnit.label})` : ""}
                </FieldCaption>
              </label>
              <div className="relative">
                <Input
                  id={quantityId}
                  aria-describedby={`${quantityId}-hint`}
                  required
                  inputMode="decimal"
                  value={amount}
                  disabled={!entryUnit}
                  placeholder={
                    entryUnit
                      ? entryUnit.unit === "unit"
                        ? "Ej.: 50"
                        : "Ej.: 2,5"
                      : "Elegí primero un artículo"
                  }
                  className="min-h-12 pr-16"
                  onChange={(e) => setAmount(e.target.value)}
                />
                {entryUnit && (
                  <span
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-y-0 right-4 flex items-center font-medium text-muted"
                  >
                    {entryUnit.symbol}
                  </span>
                )}
              </div>
              <span
                id={`${quantityId}-hint`}
                className="text-xs font-normal text-muted"
              >
                {entryUnit
                  ? `La cantidad se carga en ${entryUnit.label}. Podés usar coma decimal.`
                  : "La unidad se indica al seleccionar el artículo."}
              </span>
            </div>
            <label className={`${fieldClass} sm:col-span-2`}>
              <FieldCaption required>Motivo</FieldCaption>
              <Input
                required
                maxLength={2000}
                className="min-h-12"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Ej.: Reposición para el turno de la tarde"
              />
            </label>
          </fieldset>
          <div
            data-transfer-footer
            className="flex flex-wrap items-center justify-between gap-4 border-t bg-surface/60 p-5 sm:px-6"
          >
            <p className="flex max-w-xl items-start gap-2 text-sm text-muted">
              <Info className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              <span>
                {sameBranch
                  ? `Al confirmar el traslado realizado, el stock pasa del origen a ${destinationInfo?.name ?? "destino"}.`
                  : "La reserva separa el stock en origen. El despacho y la recepción se confirman después."}
              </span>
            </p>
            <Button
              type="submit"
              className="min-h-14 w-full gap-2 px-6 sm:w-auto"
              disabled={
                operation.locked || !entryUnit || !origin || !destination
              }
            >
              <PackageCheck className="size-5" aria-hidden="true" />
              {operation.busy ? "Guardando…" : "Reservar traslado"}
            </Button>
          </div>
        </form>
      </Card>
      <section className="space-y-4" aria-label="Seguimiento de traslados">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold">Seguimiento de traslados</h2>
            <p className="mt-1 text-sm text-muted">
              {scope === "active"
                ? "Reservas por completar y envíos que todavía no llegaron."
                : "Traslados recibidos, diferencias resueltas y reservas anuladas."}
            </p>
          </div>
          <label className="grid gap-2 text-sm font-medium">
            Mostrar
            <select
              aria-label="Ver traslados"
              value={scope}
              onChange={(e) => {
                setScope(e.target.value);
                setOffset(0);
                setData(undefined);
              }}
              className={selectClass}
            >
              <option value="active">Pendientes</option>
              <option value="history">Finalizados y anulados</option>
            </select>
          </label>
        </div>
        {!data ? (
          <p
            role="status"
            className="rounded-xl border bg-white p-6 text-sm text-muted"
          >
            {error
              ? "No pudimos consultar los traslados."
              : "Cargando traslados…"}
          </p>
        ) : !data.rows.length ? (
          <div className="rounded-xl border border-dashed bg-white p-7 text-center">
            <Truck
              className="mx-auto mb-3 size-7 text-muted"
              aria-hidden="true"
            />
            <h3 className="font-semibold">
              {scope === "active"
                ? "No hay traslados pendientes"
                : "Todavía no hay traslados finalizados"}
            </h3>
            <p className="mt-2 text-sm text-muted">
              {scope === "active"
                ? "Cuando reserves un traslado, aparecerá acá para que puedas confirmarlo."
                : "Acá vas a encontrar los traslados completados y las reservas anuladas."}
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {data.rows.map((row) => {
              const from = data.destinations.find(
                  (d) => d.id === row.originLocationId,
                ),
                to = data.destinations.find(
                  (d) => d.id === row.destinationLocationId,
                ),
                internal = row.originBranchId === row.destinationBranchId;
              return (
                <Card key={row.id} className="gap-4 p-5 sm:p-6">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h3 className="flex flex-wrap items-center gap-2 font-bold">
                        <span>{from?.name ?? "Origen"}</span>
                        <ArrowRight
                          className="size-4 text-muted"
                          aria-hidden="true"
                        />
                        <span>{to?.name ?? "Destino"}</span>
                      </h3>
                      {!internal && (
                        <p className="mt-1 text-xs text-muted">
                          {from?.branchName} → {to?.branchName}
                        </p>
                      )}
                      <p className="mt-2 break-words text-sm text-muted">
                        {row.reason}
                      </p>
                    </div>
                    <span className="rounded-md bg-secondary px-3 py-1.5 text-xs font-semibold text-brand">
                      {labels[row.state]}
                    </span>
                  </div>
                  {row.allocations.map((a) => (
                    <AllocationForm
                      key={`${a.id}:${row.revision}`}
                      allocation={a}
                      transfer={row}
                      branchId={data.branchId}
                      locked={operation.locked}
                      submit={operation.submit}
                    />
                  ))}
                  {row.state === "confirmed" &&
                    row.originBranchId === data.branchId && (
                      <div className="space-y-3 border-t pt-4">
                        <p className="text-sm text-muted">
                          {internal
                            ? `Confirmá cuando los insumos estén en ${to?.name ?? "destino"}. El stock se actualiza en las dos ubicaciones.`
                            : "Confirmá el despacho cuando los insumos salgan de origen. En destino deberán registrar la recepción."}
                        </p>
                        <div className="flex flex-wrap gap-3">
                          <Button
                            className="min-h-12"
                            disabled={operation.locked}
                            onClick={() =>
                              operation.submit(
                                `/api/transfers/${row.id}/dispatch`,
                                {
                                  requestId: crypto.randomUUID(),
                                  expectedRevision: row.revision,
                                },
                              )
                            }
                          >
                            {internal
                              ? "Confirmar traslado realizado"
                              : "Confirmar despacho"}
                          </Button>
                          <Button
                            variant="outline"
                            className="min-h-12"
                            disabled={operation.locked}
                            onClick={() =>
                              operation.submit(
                                `/api/transfers/${row.id}/cancel`,
                                {
                                  requestId: crypto.randomUUID(),
                                  expectedRevision: row.revision,
                                },
                              )
                            }
                          >
                            Anular reserva
                          </Button>
                        </div>
                      </div>
                    )}
                </Card>
              );
            })}
          </div>
        )}
        {data && (offset > 0 || data.hasMore) && (
          <nav
            aria-label="Páginas de traslados"
            className="flex flex-wrap items-center justify-between gap-3 border-t pt-4"
          >
            <p className="text-sm text-muted">Página {offset / 100 + 1}</p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                className="min-h-12 gap-2"
                disabled={offset === 0}
                onClick={() => {
                  setOffset((v) => Math.max(0, v - 100));
                  setData(undefined);
                }}
              >
                <ArrowLeft className="size-4" aria-hidden="true" />
                Página anterior
              </Button>
              <Button
                variant="outline"
                className="min-h-12 gap-2"
                disabled={!data.hasMore}
                onClick={() => {
                  setOffset((v) => v + 100);
                  setData(undefined);
                }}
              >
                Página siguiente
                <ArrowRight className="size-4" aria-hidden="true" />
              </Button>
            </div>
          </nav>
        )}
      </section>
    </section>
  );
}

function AllocationForm({
  allocation: a,
  transfer: t,
  branchId,
  locked,
  submit,
}: {
  allocation: Allocation;
  transfer: Transfer;
  branchId: string;
  locked: boolean;
  submit: (url: string, payload: Record<string, unknown>) => void;
}) {
  const remaining = six(
    integer(a.quantity) - integer(a.received) - integer(a.resolved),
  );
  const [amount, setAmount] = useState(""),
    [reason, setReason] = useState(""),
    [kind, setKind] = useState("loss"),
    [error, setError, errorAttempt] = useErrorFeedback();
  const receiving = t.destinationBranchId === branchId,
    unit = transferEntryUnit(a.baseUnit);
  function save(event: FormEvent) {
    event.preventDefault();
    setError("");
    try {
      const q = parseTransferQuantity(amount, a.baseUnit);
      if (integer(q) > integer(remaining))
        throw new Error("La cantidad supera lo pendiente.");
      submit(`/api/transfers/${t.id}/${receiving ? "receive" : "resolve"}`, {
        requestId: crypto.randomUUID(),
        expectedRevision: t.revision,
        ...(receiving
          ? { lines: [{ allocationId: a.id, quantity: q }] }
          : { allocationId: a.id, quantity: q, reason, kind }),
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Cantidad inválida.");
    }
  }
  return (
    <div className="space-y-3 border-t pt-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="font-semibold">{a.itemName}</h4>
        <span className="font-bold tabular-nums">
          {formatTransferQuantity(a.quantity, a.baseUnit)}
        </span>
      </div>
      {(t.state === "in_transit" ||
        t.state === "received" ||
        t.state === "resolved") && (
        <dl className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <dt className="text-muted">Recibido</dt>
            <dd className="mt-1 font-medium">
              {formatTransferQuantity(a.received, a.baseUnit)}
            </dd>
          </div>
          {integer(a.resolved) > 0n && (
            <div>
              <dt className="text-muted">Diferencia resuelta</dt>
              <dd className="mt-1 font-medium">
                {formatTransferQuantity(a.resolved, a.baseUnit)}
              </dd>
            </div>
          )}
          {t.state === "in_transit" && (
            <div>
              <dt className="text-muted">Pendiente de recibir o resolver</dt>
              <dd className="mt-1 font-medium">
                {formatTransferQuantity(remaining, a.baseUnit)}
              </dd>
            </div>
          )}
        </dl>
      )}
      {t.state === "in_transit" && integer(remaining) > 0n && (
        <>
          <form onSubmit={save}>
            <fieldset
              disabled={locked}
              className="grid items-end gap-3 sm:grid-cols-2"
            >
              <label className={fieldClass}>
                <FieldCaption required>
                  {receiving ? "Cantidad recibida" : "Cantidad a resolver"}
                  {unit ? ` (${unit.label})` : ""}
                </FieldCaption>
                <Input
                  required
                  disabled={!unit}
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  inputMode="decimal"
                  className="min-h-12"
                  placeholder="Ej.: 2,5"
                />
              </label>
              {!receiving && (
                <>
                  <label className={fieldClass}>
                    <FieldCaption required>Resolución</FieldCaption>
                    <select
                      required
                      className={selectClass}
                      value={kind}
                      onChange={(e) => setKind(e.target.value)}
                    >
                      <option value="loss">Pérdida en tránsito</option>
                      <option value="return">Regreso a origen</option>
                    </select>
                  </label>
                  <label className={fieldClass}>
                    <FieldCaption required>Motivo</FieldCaption>
                    <Input
                      required
                      maxLength={2000}
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      className="min-h-12"
                    />
                  </label>
                </>
              )}
              <Button type="submit" disabled={!unit} className="min-h-12">
                {receiving ? "Registrar recepción" : "Resolver diferencia"}
              </Button>
            </fieldset>
          </form>
          <OperationAlert
            title={
              receiving
                ? "No pudimos registrar la recepción"
                : "No pudimos resolver la diferencia"
            }
            message={error}
            eventKey={errorAttempt}
            tone="error"
          />
        </>
      )}
    </div>
  );
}
