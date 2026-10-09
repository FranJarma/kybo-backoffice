"use client";
import { PhotoEditor, ProductPhoto } from "@/components/products/photo";
import { useEffect, useId, useState, type FormEvent } from "react";
import {
  Archive,
  ArchiveRestore,
  Box,
  CreditCard,
  CupSoda,
  Package,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Truck,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { Table, TableCell, TableHead } from "@/components/ui/table";
import type {
  CatalogRow,
  Entity,
  EntityDefinition,
  FieldDefinition,
  ListResult,
} from "@/modules/catalog/types";

type Draft = Record<string, string>;
type RefLists = Partial<Record<Entity, CatalogRow[]>>;
function decimalInput(value: unknown) {
  return value === null || value === undefined
    ? ""
    : String(value)
        .replace(/(\.\d*?)0+$/, "$1")
        .replace(/\.$/, "")
        .replace(".", ",");
}
function initialDraft(
  fields: FieldDefinition[],
  row: CatalogRow | null,
): Draft {
  return Object.fromEntries(
    fields.map((field) => [
      field.key,
      row
        ? field.type === "decimal"
          ? decimalInput(row[field.key])
          : String(row[field.key] ?? "")
        : field.key === "sortOrder"
          ? "0"
          : field.key.startsWith("enabled")
            ? "true"
            : "",
    ]),
  );
}
function messageForError(status: number, code?: string) {
  if (status === 409 || code === "CONFLICT")
    return "Este registro cambió desde que lo abriste. Otra persona pudo haberlo actualizado. Copiá tus cambios y volvé a cargar antes de guardar.";
  if (status === 401)
    return "Tu sesión terminó. Ingresá de nuevo para guardar.";
  if (status === 403) return "No tenés permiso para realizar esta acción.";
  if (status === 503)
    return "No pudimos guardar porque los datos no están disponibles. Probá de nuevo.";
  return "No pudimos guardar. Revisá los datos e intentá de nuevo.";
}
async function readError(response: Response) {
  try {
    const body = (await response.json()) as { error?: string; code?: string };
    return response.status === 409 && body.code === "CONFLICT"
      ? messageForError(response.status, body.code)
      : body.error || messageForError(response.status, body.code);
  } catch {
    return messageForError(response.status);
  }
}
function displayValue(row: CatalogRow, key: string) {
  const value = row[key];
  if (key === "categoryName" && !value) return "Sin categoría";
  if (key === "unitCost" && value === null) return "Pendiente";
  if (value === null || value === undefined || value === "") return "—";
  if (key === "baseUnit") return value === "unit" ? "unidad" : String(value);
  if (key === "kind")
    return (
      (
        {
          cash: "Efectivo",
          card: "Tarjeta",
          transfer: "Transferencia",
          other: "Otro",
        } as Record<string, string>
      )[String(value)] ?? String(value)
    );
  if (
    ["unitCost", "priceCounter", "pricePedidosYa", "priceUberEats"].includes(
      key,
    )
  )
    return `${decimalInput(value)} ARS`;
  return String(value);
}
const columnNames: Record<string, string> = {
  categoryName: "Categoría",
  sortOrder: "Orden",
  name: "Nombre",
  email: "Correo",
  phone: "Teléfono",
  kind: "Tipo",
  baseUnit: "Unidad base",
  unitCost: "Costo / unidad",
  priceCounter: "Mostrador",
  pricePedidosYa: "PedidosYa",
  priceUberEats: "Uber Eats",
  supplierName: "Proveedor",
  itemName: "Insumo",
  baseQuantity: "Cantidad",
};
const entityIcons = {
  suppliers: Truck,
  customers: Users,
  "payment-methods": CreditCard,
  items: Box,
  products: CupSoda,
  categories: Package,
  presentations: Package,
};

function RecordStatus({ row }: { row: CatalogRow }) {
  return (
    <span
      className={`status-pill inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium ${
        row.archivedAt
          ? "bg-slate-100 text-muted"
          : "bg-emerald-50 text-emerald-700"
      }`}
    >
      <span aria-hidden="true" className="size-1.5 rounded-full bg-current" />
      {row.archivedAt ? "Archivado" : "Activo"}
    </span>
  );
}

function RecordValue({ row, column }: { row: CatalogRow; column: string }) {
  if (column === "unitCost" && row[column] === null)
    return (
      <span className="rounded-lg bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700">
        Pendiente
      </span>
    );
  return displayValue(row, column);
}

export function CatalogManager({
  entity,
  definition,
}: {
  entity: Entity;
  definition: EntityDefinition;
}) {
  const [rows, setRows] = useState<CatalogRow[]>([]),
    [total, setTotal] = useState(0),
    [loading, setLoading] = useState(true),
    [loadError, setLoadError] = useState("");
  const [search, setSearch] = useState(""),
    [archived, setArchived] = useState(false),
    [refresh, setRefresh] = useState(0);
  const [editing, setEditing] = useState<CatalogRow | null | undefined>(
      undefined,
    ),
    [draft, setDraft] = useState<Draft>({}),
    [formError, setFormError] = useState(""),
    [saving, setSaving] = useState(false),
    [uploading, setUploading] = useState(false),
    [actionId, setActionId] = useState<string | null>(null),
    [referenceLists, setReferenceLists] = useState<RefLists>({}),
    [referenceCache, setReferenceCache] = useState<RefLists>({}),
    [referenceSearch, setReferenceSearch] = useState<
      Partial<Record<Entity, string>>
    >({}),
    [referenceError, setReferenceError] = useState(""),
    [referenceWarning, setReferenceWarning] = useState("");
  const formId = useId();
  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(
      async () => {
        setLoading(true);
        setLoadError("");
        try {
          const query = new URLSearchParams({
            q: search,
            archived: archived ? "1" : "0",
          });
          const response = await fetch(`/api/catalog/${entity}?${query}`, {
            cache: "no-store",
            signal: controller.signal,
          });
          if (!response.ok) throw new Error(await readError(response));
          const result = (await response.json()) as ListResult;
          setRows(result.rows);
          setTotal(result.total);
        } catch (error) {
          if (!controller.signal.aborted)
            setLoadError(
              error instanceof Error
                ? error.message
                : "No pudimos cargar los registros.",
            );
        } finally {
          if (!controller.signal.aborted) setLoading(false);
        }
      },
      search ? 250 : 0,
    );
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [entity, search, archived, refresh]);
  useEffect(() => {
    const references = [
      ...new Set(
        definition.fields
          .map((f) => f.reference)
          .filter((value): value is Entity => Boolean(value)),
      ),
    ];
    if (!references.length) return;
    let live = true;
    const timer = setTimeout(
      () =>
        Promise.all(
          references.map(async (key) => {
            const query = new URLSearchParams({
              archived: "0",
              q: referenceSearch[key] ?? "",
            });
            const response = await fetch(`/api/catalog/${key}?${query}`, {
              cache: "no-store",
            });
            if (!response.ok)
              throw new Error("No pudimos cargar las opciones de referencia.");
            const list = (await response.json()) as ListResult;
            return [key, list.rows, list.total] as const;
          }),
        )
          .then((values) => {
            if (live) {
              setReferenceLists(
                Object.fromEntries(values.map(([key, rows]) => [key, rows])),
              );
              setReferenceCache((current) =>
                Object.fromEntries(
                  references.map((key) => [
                    key,
                    [
                      ...(current[key] ?? []),
                      ...(values.find((value) => value[0] === key)?.[1] ?? []),
                    ].filter(
                      (row, index, all) =>
                        all.findIndex(
                          (candidate) => candidate.id === row.id,
                        ) === index,
                    ),
                  ]),
                ),
              );
              setReferenceWarning(
                values.some(([, rows, total]) => total > rows.length)
                  ? "Se muestran hasta 100 opciones. Usá la búsqueda de proveedor o insumo para encontrar otras."
                  : "",
              );
              setReferenceError("");
            }
          })
          .catch(() => {
            if (live)
              setReferenceError(
                "No pudimos cargar proveedores o artículos. Probá de nuevo más tarde.",
              );
          }),
      referenceSearch.suppliers || referenceSearch.items ? 250 : 0,
    );
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [definition, referenceSearch]);
  function openForm(row: CatalogRow | null) {
    setEditing(row);
    setDraft({
      ...initialDraft(definition.fields, row),
      imageAssetId: String(row?.imageAssetId ?? ""),
    });
    setFormError(referenceError);
  }
  function closeForm() {
    if (!saving && !uploading) {
      setEditing(undefined);
      setFormError("");
    }
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (editing === undefined || uploading || saving) return;
    setSaving(true);
    setFormError("");
    const payload: Record<string, string | number> = Object.fromEntries(
      definition.fields.map((field) => [field.key, draft[field.key] ?? ""]),
    );
    if (entity === "products") payload.imageAssetId = draft.imageAssetId ?? "";
    if (editing) payload.revision = editing.revision;
    try {
      const response = await fetch(
        editing
          ? `/api/catalog/${entity}/${editing.id}`
          : `/api/catalog/${entity}`,
        {
          method: editing ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      );
      if (!response.ok) {
        setFormError(await readError(response));
        return;
      }
      setEditing(undefined);
      setRefresh((n) => n + 1);
    } catch {
      setFormError(
        "No pudimos confirmar el guardado. Revisá la lista antes de reintentar.",
      );
    } finally {
      setSaving(false);
    }
  }
  async function toggleArchive(row: CatalogRow) {
    setActionId(row.id);
    setLoadError("");
    try {
      const response = await fetch(`/api/catalog/${entity}/${row.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          revision: row.revision,
          archived: !Boolean(row.archivedAt),
        }),
      });
      if (!response.ok) {
        setLoadError(await readError(response));
        return;
      }
      setRefresh((n) => n + 1);
    } catch {
      setLoadError(
        "No pudimos confirmar el cambio. Revisá la lista antes de reintentar.",
      );
    } finally {
      setActionId(null);
    }
  }
  function fieldControl(field: FieldDefinition) {
    const id = `${formId}-${field.key}`;
    const value = draft[field.key] ?? "";
    const update = (value: string) =>
      setDraft((current) => ({ ...current, [field.key]: value }));
    const common = {
      id,
      name: field.key,
      value,
      required: field.required,
      onChange: (
        event: React.ChangeEvent<
          HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
        >,
      ) => update(event.target.value),
    };
    if (field.type === "textarea")
      return (
        <textarea {...common} rows={3} className="form-control resize-y" />
      );
    if (field.type === "select")
      return (
        <select {...common} className="form-control">
          <option value="">Seleccioná una opción</option>
          {field.options?.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      );
    if (field.type === "reference") {
      const options = referenceLists[field.reference!] ?? [];
      const existing = value && !options.some((option) => option.id === value);
      const cached = referenceCache[field.reference!]?.find(
        (option) => option.id === value,
      );
      const label =
        cached?.name ??
        (field.key === "supplierId"
          ? editing?.supplierName
          : field.key === "categoryId"
            ? editing?.categoryName
            : editing?.itemName);
      return (
        <>
          <Input
            aria-label={`Buscar ${field.label.toLowerCase()}`}
            placeholder={`Buscar ${field.label.toLowerCase()}`}
            value={referenceSearch[field.reference!] ?? ""}
            onChange={(event) =>
              setReferenceSearch((current) => ({
                ...current,
                [field.reference!]: event.target.value,
              }))
            }
            className="mb-2"
          />
          <select {...common} className="form-control">
            <option value="">Seleccioná una opción</option>
            {existing && (
              <option value={value}>
                {String(label ?? "Referencia previa")}
                {(
                  field.key === "categoryId"
                    ? editing?.categoryArchived
                    : !cached
                )
                  ? " (archivado)"
                  : ""}
              </option>
            )}
            {options.map((option) => (
              <option key={option.id} value={option.id}>
                {option.name}
              </option>
            ))}
          </select>
        </>
      );
    }
    return (
      <Input
        {...common}
        type={field.type === "email" ? "email" : "text"}
        inputMode={field.type === "decimal" ? "decimal" : undefined}
        autoComplete="off"
        maxLength={field.key === "name" ? 160 : undefined}
      />
    );
  }
  function renderField(field: FieldDefinition) {
    return (
      <div
        key={field.key}
        className={
          field.key === "name" ||
          field.type === "textarea" ||
          (entity !== "products" && field.hint)
            ? "min-w-0 space-y-2.5 sm:col-span-2"
            : "min-w-0 space-y-2.5"
        }
      >
        <Label htmlFor={`${formId}-${field.key}`}>
          {field.label}
          {field.required && (
            <span aria-hidden="true" className="text-accent">
              {" "}
              *
            </span>
          )}
        </Label>
        {fieldControl(field)}
        {field.hint && (
          <p className="mt-2 text-xs leading-relaxed text-muted">
            {field.hint}
          </p>
        )}
        {field.key === "baseQuantity" && draft.itemId && (
          <p className="mt-2 text-xs font-semibold text-brand">
            Unidad seleccionada:{" "}
            {referenceCache.items?.find((item) => item.id === draft.itemId)
              ?.baseUnit === "unit"
              ? "unidad"
              : (referenceCache.items?.find((item) => item.id === draft.itemId)
                  ?.baseUnit ??
                editing?.baseUnit ??
                "—")}
          </p>
        )}
      </div>
    );
  }
  function rowActions(row: CatalogRow) {
    const ArchiveIcon = row.archivedAt ? ArchiveRestore : Archive;
    return (
      <div className="flex items-center gap-1 md:justify-end">
        <Button
          size="sm"
          variant="ghost"
          onClick={() => openForm(row)}
          className="text-brand hover:bg-blue-50 hover:text-blue"
        >
          <Pencil size={15} aria-hidden="true" />
          Editar
        </Button>
        <Button
          size="sm"
          variant="ghost"
          disabled={actionId === row.id}
          onClick={() => toggleArchive(row)}
          className="text-muted hover:bg-slate-100 hover:text-brand"
        >
          <ArchiveIcon size={15} aria-hidden="true" />
          {actionId === row.id
            ? "Guardando…"
            : row.archivedAt
              ? "Restaurar"
              : "Archivar"}
        </Button>
      </div>
    );
  }
  const EntityIcon = entityIcons[entity];
  const basicFields = definition.fields.filter(
    (field) =>
      entity !== "products" ||
      !(field.key.startsWith("price") || field.key.startsWith("enabled")),
  );
  const priceFields = definition.fields.filter(
    (field) =>
      entity === "products" &&
      (field.key.startsWith("price") || field.key.startsWith("enabled")),
  );

  return (
    <>
      <div className="page-heading mb-8 flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div className="min-w-0">
          <h1 className="page-title text-3xl font-bold tracking-tight text-brand">
            {definition.title}
          </h1>
          <p className="page-description mt-1.5 text-sm leading-relaxed text-muted">
            {definition.description}
          </p>
        </div>
        <Button onClick={() => openForm(null)} className="w-fit" size="lg">
          <Plus size={20} aria-hidden="true" />
          Nuevo {definition.singular}
        </Button>
      </div>

      <div className="mb-5 flex flex-wrap items-center justify-between gap-4">
        <div className="relative w-full sm:w-auto sm:min-w-64 sm:max-w-md sm:flex-1">
          <Search
            size={19}
            aria-hidden="true"
            className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted"
          />
          <Input
            aria-label={`Buscar ${definition.title.toLowerCase()}`}
            placeholder={`Buscar ${definition.singular}…`}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-12 bg-white pl-11"
          />
        </div>
        <div className="flex min-w-0 items-center gap-3">
          <div
            className="flex rounded-xl border border-line bg-white p-1"
            role="group"
            aria-label="Estado de los registros"
          >
            <Button
              size="sm"
              variant="ghost"
              aria-pressed={!archived}
              onClick={() => setArchived(false)}
              className={
                !archived
                  ? "bg-blue-50 font-semibold text-blue hover:bg-blue-50 hover:text-blue"
                  : "text-muted hover:bg-slate-50"
              }
            >
              Activos
            </Button>
            <Button
              size="sm"
              variant="ghost"
              aria-pressed={archived}
              onClick={() => setArchived(true)}
              className={
                archived
                  ? "bg-blue-50 font-semibold text-blue hover:bg-blue-50 hover:text-blue"
                  : "text-muted hover:bg-slate-50"
              }
            >
              Archivados
            </Button>
          </div>
          <Button
            size="icon"
            variant="outline"
            aria-label="Actualizar lista"
            title="Actualizar lista"
            disabled={loading}
            onClick={() => setRefresh((n) => n + 1)}
            className="h-12 w-12 text-muted"
          >
            <RefreshCw
              size={18}
              aria-hidden="true"
              className={loading ? "motion-safe:animate-spin" : undefined}
            />
          </Button>
        </div>
        <p className="text-sm text-muted sm:ml-auto" aria-live="polite">
          {loading
            ? "Cargando…"
            : `${total} ${total === 1 ? "registro" : "registros"}`}
        </p>
      </div>

      {loadError && (
        <p
          role="alert"
          className="mb-5 rounded-xl border border-red-100 bg-red-50 p-4 text-sm text-red-700"
        >
          {loadError}
        </p>
      )}
      <Card
        className="surface-panel gap-0 overflow-hidden py-0 shadow-none"
        aria-busy={loading}
      >
        {loading && rows.length === 0 ? (
          <div className="flex min-h-64 items-center justify-center gap-3 text-sm text-muted">
            <RefreshCw
              size={18}
              aria-hidden="true"
              className="motion-safe:animate-spin"
            />
            Cargando registros…
          </div>
        ) : !loading && rows.length === 0 ? (
          <div className="px-5 py-16 text-center">
            <span className="mx-auto mb-4 flex size-14 items-center justify-center rounded-2xl bg-blue-50 text-blue">
              <EntityIcon size={26} aria-hidden="true" />
            </span>
            <p className="font-semibold text-brand">
              {search
                ? "No encontramos coincidencias"
                : archived
                  ? "No hay registros archivados"
                  : "Todavía no hay registros"}
            </p>
            <p className="mt-2 text-sm text-muted">
              {search
                ? "Probá con otro nombre."
                : archived
                  ? "Los registros archivados aparecerán acá."
                  : `Creá un ${definition.singular} para comenzar.`}
            </p>
          </div>
        ) : (
          <>
            <div className="hidden md:block">
              <Table>
                <thead>
                  <tr className="border-b border-line bg-slate-50/80">
                    {definition.columns.map((column) => (
                      <TableHead
                        key={column}
                        className="h-14 font-medium normal-case"
                      >
                        {column === "name"
                          ? entity === "products"
                            ? "Producto"
                            : entity === "items"
                              ? "Insumo"
                              : columnNames[column]
                          : (columnNames[column] ?? column)}
                      </TableHead>
                    ))}
                    <TableHead className="h-14 font-medium normal-case">
                      Estado
                    </TableHead>
                    <TableHead className="h-14 text-right font-medium normal-case">
                      Acciones
                    </TableHead>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr
                      key={row.id}
                      className="border-b border-line transition-colors last:border-0 hover:bg-blue-50/40"
                    >
                      {definition.columns.map((column) => (
                        <TableCell
                          key={column}
                          className={
                            column === "name"
                              ? "font-semibold text-brand"
                              : "text-muted tabular-nums"
                          }
                        >
                          {column === "name" ? (
                            <div className="flex items-center gap-3">
                              <span
                                className={`flex size-10 shrink-0 items-center justify-center rounded-xl ${entity === "products" ? "bg-orange-50 text-orange-500" : "bg-slate-50 text-[#577195]"}`}
                              >
                                {entity === "products" ? (
                                  <ProductPhoto
                                    id={String(row.imageAssetId ?? "") || null}
                                    name={row.name}
                                  />
                                ) : (
                                  <EntityIcon size={21} aria-hidden="true" />
                                )}
                              </span>
                              <span className="min-w-28 break-words">
                                {row.name}
                              </span>
                            </div>
                          ) : (
                            <RecordValue row={row} column={column} />
                          )}
                        </TableCell>
                      ))}
                      <TableCell>
                        <RecordStatus row={row} />
                      </TableCell>
                      <TableCell>{rowActions(row)}</TableCell>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </div>
            <div className="divide-y divide-line md:hidden">
              {rows.map((row) => (
                <article key={row.id} className="p-4">
                  <div className="flex items-start gap-3">
                    <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue">
                      <EntityIcon size={21} aria-hidden="true" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <h2 className="break-words font-semibold text-brand">
                        <span className="mb-2 block w-16">
                          {entity === "products" && (
                            <ProductPhoto
                              id={String(row.imageAssetId ?? "") || null}
                              name={row.name}
                            />
                          )}
                        </span>
                        {row.name}
                      </h2>
                      <div className="mt-1.5">
                        <RecordStatus row={row} />
                      </div>
                    </div>
                  </div>
                  <dl className="mt-4 space-y-2.5">
                    {definition.columns
                      .filter((column) => column !== "name")
                      .map((column) => (
                        <div
                          key={column}
                          className="flex justify-between gap-4 text-sm"
                        >
                          <dt className="shrink-0 text-muted">
                            {columnNames[column] ?? column}
                          </dt>
                          <dd className="min-w-0 break-words text-right text-brand tabular-nums">
                            <RecordValue row={row} column={column} />
                          </dd>
                        </div>
                      ))}
                  </dl>
                  <div className="mt-4 border-t border-line pt-3">
                    {rowActions(row)}
                  </div>
                </article>
              ))}
            </div>
          </>
        )}
        {!loading && rows.length > 0 && (
          <div className="border-t border-line px-5 py-4 text-xs leading-relaxed text-muted">
            {rows.length} de {total} {total === 1 ? "registro" : "registros"}
            {total > rows.length &&
              ". Usá la búsqueda para encontrar otros registros."}
          </div>
        )}
      </Card>

      <Dialog
        open={editing !== undefined}
        onOpenChange={(open) => {
          if (!open) closeForm();
        }}
      >
        {editing !== undefined && (
          <DialogContent className="max-h-[94dvh] gap-0 overflow-y-auto bg-white p-5 sm:max-w-4xl sm:p-8 lg:p-10">
            <div className="mb-8 border-b border-line pb-6 pr-5">
              <p className="eyebrow mb-2 text-xs font-semibold uppercase tracking-wider text-muted">
                {definition.title}
              </p>
              <DialogTitle className="text-2xl font-bold tracking-tight text-brand">
                {editing
                  ? `Editar ${definition.singular}`
                  : `Nuevo ${definition.singular}`}
              </DialogTitle>
              <DialogDescription className="mt-2 text-sm leading-relaxed text-muted">
                Completá los datos del registro. Los campos con * son
                obligatorios.
              </DialogDescription>
            </div>
            <form onSubmit={submit} className="space-y-8">
              <div className="grid gap-x-8 gap-y-7 sm:grid-cols-2">
                {(entity === "products"
                  ? [
                      ...basicFields.filter(
                        (field) => field.type !== "textarea",
                      ),
                      ...basicFields.filter(
                        (field) => field.type === "textarea",
                      ),
                    ]
                  : basicFields
                ).map(renderField)}
              </div>
              {entity === "products" && (
                <PhotoEditor
                  value={draft.imageAssetId || null}
                  onChange={(id) =>
                    setDraft((d) => ({ ...d, imageAssetId: id ?? "" }))
                  }
                  onBusy={setUploading}
                  disabled={saving || uploading}
                />
              )}
              {priceFields.length > 0 && (
                <fieldset className="rounded-xl border border-line bg-slate-50/60 p-5 sm:p-6">
                  <legend className="px-2 text-sm font-semibold text-brand">
                    Venta por canal
                  </legend>
                  <div className="grid gap-7 pt-3 lg:grid-cols-3">
                    {(["Counter", "PedidosYa", "UberEats"] as const).map(
                      (channel) => (
                        <div key={channel} className="min-w-0 space-y-6">
                          {priceFields
                            .filter(
                              (field) =>
                                field.key === `enabled${channel}` ||
                                field.key === `price${channel}`,
                            )
                            .map(renderField)}
                        </div>
                      ),
                    )}
                  </div>
                </fieldset>
              )}
              {referenceWarning && (
                <p className="rounded-xl bg-amber-50 p-3 text-xs leading-relaxed text-amber-800">
                  {referenceWarning}
                </p>
              )}
              {entity === "customers" && (
                <p className="rounded-xl bg-blue-50 p-3 text-xs leading-relaxed text-muted">
                  Agregar un cliente no autoriza el envío de promociones.
                </p>
              )}
              {formError && (
                <p
                  role="alert"
                  className="rounded-xl bg-red-50 p-3 text-sm leading-relaxed text-red-700"
                >
                  {formError}
                </p>
              )}
              <div className="flex justify-end gap-3 border-t border-line pt-5">
                <Button
                  type="button"
                  variant="outline"
                  onClick={closeForm}
                  disabled={saving || uploading}
                >
                  Cancelar
                </Button>
                <Button type="submit" disabled={saving || uploading}>
                  {saving ? "Guardando…" : "Guardar"}
                </Button>
              </div>
            </form>
          </DialogContent>
        )}
      </Dialog>
    </>
  );
}
