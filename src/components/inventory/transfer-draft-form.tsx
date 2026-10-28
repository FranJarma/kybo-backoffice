"use client";
import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { Info, PackageCheck, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { FieldCaption } from "@/components/ui/field-caption";
import { OperationAlert } from "@/components/ui/operation-alert";
import { useErrorFeedback } from "@/components/ui/use-error-feedback";
import { getJson, SearchSelect, useOperation } from "./shared";
import { transferEntryUnit } from "@/modules/transfers/quantities";
import {
  addTransferDraftLine,
  transferDraftLines,
  suggestTransferDestination,
  type TransferDraftLine,
} from "@/modules/transfers/draft";
import type { TransferDirectory } from "@/modules/transfers/types";
import type { BaseUnit } from "@/modules/items/units";
import type { CatalogRow } from "@/modules/catalog/types";

const fieldClass =
  "grid min-w-0 content-start gap-2 text-sm font-semibold text-brand";
const selectClass =
  "min-h-12 w-full rounded-lg border bg-white px-3 text-sm font-normal";
const reasons = [
  "Reposición para turno de la mañana",
  "Reposición para turno de la tarde",
  "Reposición atrasada",
  "Reposición extra por mayor demanda",
  "Otro motivo",
];

export function TransferDraftForm({
  actorId,
  directory,
  onSuccess,
  blocked,
}: {
  actorId: string;
  directory?: TransferDirectory;
  onSuccess: () => void;
  blocked: boolean;
}) {
  const quantityId = useId(),
    originId = useId();
  const editorRef = useRef<HTMLDivElement>(null),
    restoreOriginFocus = useRef(false);
  const [origins, setOrigins] =
    useState<{ id: string; name: string; code: string }[]>();
  const [originLoadError, setOriginLoadError] = useState("");
  const [originOverride, setOriginOverride] = useState<string | null>(null),
    [changingOrigin, setChangingOrigin] = useState(false);
  const [draft, setDraft] = useState<TransferDraftLine[]>([]);
  const [itemId, setItemId] = useState(""),
    [item, setItem] = useState<CatalogRow>(),
    [amount, setAmount] = useState("");
  const [destinationOverride, setDestinationOverride] = useState<string | null>(
    null,
  );
  const [reason, setReason] = useState(""),
    [detail, setDetail] = useState("");
  const [error, setError, errorAttempt] = useErrorFeedback(),
    [notice, setNotice] = useState("");
  const depot =
    origins?.find((location) => location.code === "DEPOSITO") ??
    origins?.find(
      (location) =>
        location.name.localeCompare("Depósito principal", "es", {
          sensitivity: "base",
        }) === 0,
    );
  const origin = originOverride ?? depot?.id ?? "";
  const originInfo = origins?.find((location) => location.id === origin);
  const unit = transferEntryUnit(item?.baseUnit);
  const suggested = directory
    ? suggestTransferDestination(
        itemId,
        origin,
        directory.destinationPolicies,
        directory.destinations,
        directory.branchId,
      )
    : "";
  const destination = destinationOverride ?? suggested;
  const completed = useCallback(() => {
    setDraft([]);
    setItemId("");
    setItem(undefined);
    setAmount("");
    setDestinationOverride(null);
    setDetail("");
    setError("");
    setNotice("Traslado confirmado.");
    onSuccess();
  }, [onSuccess, setError]);
  const operation = useOperation<Record<string, unknown>>(
    actorId,
    "transfer-batch",
    completed,
  );
  const locked = blocked || operation.locked;
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
  useEffect(() => {
    let live = true;
    getJson<{ locations: NonNullable<typeof origins> }>("/api/branches/current")
      .then((data) => {
        if (live) setOrigins(data.locations);
      })
      .catch(() => {
        if (live) {
          setOrigins([]);
          setOriginLoadError(
            "No pudimos cargar las ubicaciones de origen. Actualizá la página para volver a intentar.",
          );
        }
      });
    return () => {
      live = false;
    };
  }, []);
  function chooseOrigin(value: string | null) {
    const next = value ?? depot?.id ?? "";
    setOriginOverride(value);
    setDestinationOverride(null);
    setDraft((rows) =>
      rows.map((row) =>
        row.destinationLocationId === next
          ? { ...row, destinationLocationId: "" }
          : row,
      ),
    );
    if (next) {
      restoreOriginFocus.current = true;
      setChangingOrigin(false);
    }
  }
  function add() {
    if (locked) return;
    setError("");
    try {
      if (!item || !unit)
        throw new Error("Seleccioná un insumo y su cantidad para agregarlo.");
      setDraft(
        addTransferDraftLine(draft, {
          id: crypto.randomUUID(),
          itemId,
          name: item.name,
          baseUnit: item.baseUnit as BaseUnit,
          amount,
          destinationLocationId: destination,
        }),
      );
      setItemId("");
      setItem(undefined);
      setAmount("");
      setDestinationOverride(null);
      setNotice("");
      editorRef.current
        ?.querySelector<HTMLInputElement>('input[role="combobox"]')
        ?.focus();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Revisá el insumo y la cantidad.",
      );
    }
  }
  function submit(event: FormEvent) {
    event.preventDefault();
    if (locked) return;
    setError("");
    try {
      if (itemId || amount.trim())
        throw new Error(
          "Agregá el insumo que estás cargando a la lista antes de confirmar.",
        );
      if (!origin || !directory)
        throw new Error("Elegí el origen del traslado.");
      const lines = transferDraftLines(draft, origin, directory.destinations);
      if (!reason) throw new Error("Elegí el motivo del traslado.");
      if (reason === "Otro motivo" && !detail.trim())
        throw new Error("Escribí la aclaración para el otro motivo.");
      operation.submit("/api/transfers/batch", {
        requestId: crypto.randomUUID(),
        originLocationId: origin,
        reason:
          reason === "Otro motivo" ? `Otro motivo: ${detail.trim()}` : reason,
        lines,
      });
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Revisá la lista antes de confirmar.",
      );
    }
  }
  function patchLine(id: string, values: Partial<TransferDraftLine>) {
    setDraft((rows) =>
      rows.map((row) => (row.id === id ? { ...row, ...values } : row)),
    );
  }
  const options =
    directory?.destinations.filter((location) => location.id !== origin) ?? [];
  const destinationLabel = (
    location: NonNullable<typeof directory>["destinations"][number],
  ) =>
    location.branchId === directory?.branchId
      ? location.name
      : `${location.branchName} · ${location.name}`;
  const external = draft.some((row) =>
    options.some(
      (location) =>
        location.id === row.destinationLocationId &&
        location.branchId !== directory?.branchId,
    ),
  );
  return (
    <>
      <OperationAlert
        title="No pudimos confirmar el traslado"
        message={error || operation.error || originLoadError}
        eventKey={error ? errorAttempt : operation.errorAttempt}
        tone="error"
      />
      <OperationAlert title="Listo" message={notice} tone="success" />
      {operation.uncertain && (
        <Button onClick={operation.retry} disabled={operation.busy}>
          Reintentar confirmación
        </Button>
      )}
      <Card className="gap-0 overflow-hidden p-0">
        <div className="border-b p-5 sm:px-6">
          <h2 className="text-lg font-bold">Nuevo traslado</h2>
          <p className="mt-1 text-sm text-muted">
            Armá la lista de insumos y confirmá todo junto. Podés revisar
            cantidades y destinos antes de confirmar.
          </p>
        </div>
        <form onSubmit={submit}>
          <fieldset disabled={locked} className="space-y-6 p-5 sm:p-6">
            <div className="grid gap-5 sm:grid-cols-2">
              <div className={fieldClass}>
                <span id={originId}>
                  <FieldCaption
                    required={!!origins && (changingOrigin || !originInfo)}
                  >
                    Origen
                  </FieldCaption>
                </span>
                {origins && (changingOrigin || !originInfo) ? (
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
                      {origins.map((location) => (
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
                        No hay un depósito principal identificado. Elegí el
                        origen de este traslado.
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
                <FieldCaption required>Motivo</FieldCaption>
                <select
                  required
                  value={reason}
                  onChange={(event) => {
                    setReason(event.target.value);
                    setDetail("");
                  }}
                  className={selectClass}
                >
                  <option value="">Elegí el motivo del traslado</option>
                  {reasons.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </label>
              {reason === "Otro motivo" && (
                <label className={`${fieldClass} sm:col-span-2`}>
                  <FieldCaption required>Aclaración</FieldCaption>
                  <Input
                    required
                    maxLength={2000 - "Otro motivo: ".length}
                    value={detail}
                    onChange={(event) => setDetail(event.target.value)}
                    placeholder="Explicá brevemente por qué realizás el traslado"
                  />
                </label>
              )}
            </div>
            <section
              className="space-y-4 border-t pt-5"
              aria-label="Agregar insumos"
            >
              <div>
                <h3 className="font-bold">Insumos a trasladar</h3>
                <p className="mt-1 text-sm text-muted">
                  El destino se sugiere según los mínimos de reposición. Si
                  agregás otra vez el mismo insumo al mismo destino, sumamos la
                  cantidad.
                </p>
              </div>
              <div
                ref={editorRef}
                className="grid items-end gap-3 min-[480px]:grid-cols-2 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,.6fr)_minmax(0,1fr)_auto]"
                onKeyDown={(event) => {
                  if (
                    event.key === "Enter" &&
                    !event.defaultPrevented &&
                    event.target instanceof HTMLInputElement
                  ) {
                    event.preventDefault();
                    add();
                  }
                }}
              >
                <SearchSelect
                  entity="items"
                  label="Artículo"
                  requiredCaption
                  value={itemId}
                  filter={(row) => row.stockTracked !== false}
                  onChange={(id, row) => {
                    setItemId(id);
                    setItem(row);
                    setAmount("");
                    setDestinationOverride(null);
                  }}
                />
                <div className={fieldClass}>
                  <label htmlFor={quantityId}>
                    <FieldCaption required={!!unit}>
                      Cantidad{unit ? ` (${unit.label})` : ""}
                    </FieldCaption>
                  </label>
                  <div className="relative">
                    <Input
                      id={quantityId}
                      aria-required={!!unit || undefined}
                      inputMode="decimal"
                      value={amount}
                      disabled={!unit}
                      placeholder={
                        unit
                          ? unit.unit === "unit"
                            ? "Ej.: 50"
                            : "Ej.: 2,5"
                          : "Elegí un insumo"
                      }
                      className="pr-14"
                      onChange={(event) => setAmount(event.target.value)}
                    />
                    {unit && (
                      <span
                        className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-muted"
                        aria-hidden="true"
                      >
                        {unit.symbol}
                      </span>
                    )}
                  </div>
                </div>
                <label className={fieldClass}>
                  <FieldCaption required={!!itemId && !!directory}>
                    Destino
                  </FieldCaption>
                  <select
                    aria-label="Destino del insumo"
                    aria-required={(!!itemId && !!directory) || undefined}
                    value={destination}
                    disabled={!itemId || !directory}
                    onChange={(event) =>
                      setDestinationOverride(event.target.value)
                    }
                    className={selectClass}
                  >
                    <option value="">Elegí destino</option>
                    {options.map((location) => (
                      <option key={location.id} value={location.id}>
                        {destinationLabel(location)}
                      </option>
                    ))}
                  </select>
                </label>
                <Button
                  type="button"
                  variant="outline"
                  className="gap-2 text-blue"
                  disabled={!origin || !directory || !itemId || !unit}
                  onClick={add}
                >
                  <Plus className="size-4" aria-hidden="true" />
                  Agregar insumo
                </Button>
              </div>
              {!draft.length ? (
                <p className="rounded-xl border border-dashed bg-surface/50 p-6 text-center text-sm text-muted">
                  Agregá los insumos que vas a trasladar. Todavía no se movió
                  stock.
                </p>
              ) : (
                <>
                  <p role="status" className="text-sm font-semibold">
                    {draft.length}{" "}
                    {draft.length === 1
                      ? "insumo en la lista"
                      : "insumos en la lista"}
                  </p>
                  <ol aria-label="Insumos del traslado" className="space-y-3">
                    {draft.map((line) => (
                      <li key={line.id} className="rounded-xl border p-4">
                        <fieldset
                          aria-label={`Insumo: ${line.name}`}
                          className="grid items-end gap-3 min-[480px]:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] lg:grid-cols-[minmax(0,1.3fr)_minmax(0,.6fr)_minmax(0,1fr)_auto]"
                        >
                          <span className="self-center font-semibold min-[480px]:col-span-3 lg:col-span-1">
                            {line.name}
                          </span>
                          <label className={fieldClass}>
                            <FieldCaption required>
                              Cantidad (
                              {transferEntryUnit(line.baseUnit)?.label})
                            </FieldCaption>
                            <Input
                              aria-label={`Cantidad de ${line.name} (${transferEntryUnit(line.baseUnit)?.label})`}
                              required
                              inputMode="decimal"
                              value={line.amount}
                              onChange={(event) =>
                                patchLine(line.id, {
                                  amount: event.target.value,
                                })
                              }
                            />
                          </label>
                          <label className={fieldClass}>
                            <FieldCaption required>Destino</FieldCaption>
                            <select
                              required
                              value={line.destinationLocationId}
                              className={selectClass}
                              onChange={(event) =>
                                patchLine(line.id, {
                                  destinationLocationId: event.target.value,
                                })
                              }
                            >
                              <option value="">Elegí destino</option>
                              {options.map((location) => (
                                <option key={location.id} value={location.id}>
                                  {destinationLabel(location)}
                                </option>
                              ))}
                            </select>
                          </label>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            aria-label={`Quitar ${line.name}`}
                            onClick={() =>
                              setDraft((rows) =>
                                rows.filter((row) => row.id !== line.id),
                              )
                            }
                          >
                            <Trash2 className="size-4" aria-hidden="true" />
                          </Button>
                        </fieldset>
                      </li>
                    ))}
                  </ol>
                </>
              )}
            </section>
          </fieldset>
          <div
            data-transfer-footer
            className="flex flex-wrap items-center justify-between gap-4 border-t bg-surface/60 p-5 sm:px-6"
          >
            <p className="flex max-w-xl items-start gap-2 text-sm text-muted">
              <Info className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              <span>
                {external
                  ? "Los envíos a otras sucursales quedan en tránsito hasta que registren su recepción."
                  : "Confirmá cuando los insumos estén en sus destinos. El stock se actualiza para toda la lista a la vez."}
              </span>
            </p>
            <Button
              type="submit"
              className="min-h-14 w-full gap-2 px-6 sm:w-auto"
              disabled={locked || !origin || !directory || !draft.length}
            >
              <PackageCheck className="size-5" aria-hidden="true" />
              {operation.busy ? "Confirmando…" : "Confirmar traslado"}
            </Button>
          </div>
        </form>
      </Card>
    </>
  );
}
