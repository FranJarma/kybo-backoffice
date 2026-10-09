"use client";
import { recipeSection } from "@/modules/catalog/item-classes";
import { consumptionQuantity } from "@/modules/recipes/waste";
import { CostPreview } from "./cost-preview";

import { paths } from "@/lib/navigation";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import Link from "next/link";
import { CostSimulator } from "./cost-simulator";
import { ModifierRecipeEditor } from "./modifier-editor";
import {
  BookOpen,
  ChefHat,
  Coffee,
  Plus,
  Pencil,
  Search,
  Trash2,
  ArrowRight,
  History,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  date,
  getJson,
  money,
  quantity,
  SearchSelect,
  useOperation,
} from "@/components/inventory/shared";
import { Field, inputDecimal, Notice, SummaryLine, unitLabel } from "./shared";
import type { CatalogRow } from "@/modules/catalog/types";
import type {
  RecipeInput,
  RecipeKind,
  RecipeDetail,
  RecipeList,
  CostResult,
} from "@/modules/recipes/types";

export function RecipesManager({ actorId }: { actorId: string }) {
  const [kind, setKind] = useState<RecipeKind>("product"),
    [search, setSearch] = useState(""),
    [offset, setOffset] = useState(0);
  const [list, setList] = useState<RecipeList>({ rows: [], total: 0 }),
    [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<RecipeDetail | null>(null),
    [version, setVersion] = useState(""),
    [refresh, setRefresh] = useState(0);
  const [loading, setLoading] = useState(true),
    [detailLoading, setDetailLoading] = useState(false),
    [error, setError] = useState("");
  const [editor, setEditor] = useState<{
      recipe?: RecipeDetail;
      configurable?: boolean;
    } | null>(null),
    [success, setSuccess] = useState("");
  const onSaved = useCallback((result: unknown) => {
    const recipe = result as RecipeDetail;
    setEditor(null);
    setKind(recipe.kind);
    setSearch("");
    setOffset(0);
    setSelectedId(recipe.id);
    setVersion("");
    setRefresh((n) => n + 1);
    setSuccess(
      "Receta guardada. Las producciones anteriores conservan su versión.",
    );
  }, []);
  const operation = useOperation<RecipeInput>(actorId, "recipe", onSaved);
  useEffect(() => {
    let live = true;
    const timer = setTimeout(
      () => {
        setLoading(true);
        setError("");
        getJson<RecipeList>(
          `/api/recipes?kind=${kind}&q=${encodeURIComponent(search)}&offset=${offset}`,
        )
          .then((data) => {
            if (live) {
              setList(data);
              setSelectedId((id) => id ?? data.rows[0]?.id ?? null);
            }
          })
          .catch((e) => {
            if (live) setError(e.message);
          })
          .finally(() => {
            if (live) setLoading(false);
          });
      },
      search ? 200 : 0,
    );
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [kind, search, offset, refresh]);
  useEffect(() => {
    let live = true;
    const timer = setTimeout(() => {
      setDetail(null);
      if (!selectedId) {
        setDetailLoading(false);
        return;
      }
      setDetailLoading(true);
      getJson<RecipeDetail>(
        `/api/recipes/${selectedId}${version ? `?version=${version}` : ""}`,
      )
        .then((data) => {
          if (live) setDetail(data);
        })
        .catch((e) => {
          if (live) setError(e.message);
        })
        .finally(() => {
          if (live) setDetailLoading(false);
        });
    }, 0);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [selectedId, version, refresh]);
  const select = (id: string) => {
    if (id === selectedId && !version) {
      if (detail) return;
      setRefresh((n) => n + 1);
    }
    setDetail(null);
    setDetailLoading(true);
    setSelectedId(id);
    setVersion("");
    setError("");
  };
  return (
    <div>
      <div className="page-heading">
        <div>
          <h1 className="page-title">Recetas</h1>
          <p className="page-description">
            Costos claros para decidir precios y preparar cada producto.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" asChild>
            <Link href={paths["modifiers"]}>Modificadores</Link>
          </Button>
          {kind === "product" && (
            <Button
              variant="outline"
              onClick={() => setEditor({ configurable: true })}
            >
              Nueva receta configurable
            </Button>
          )}
          {detail?.kind === "product" &&
            detail.compositionModel === "legacy" && (
              <Button
                variant="outline"
                onClick={() =>
                  setEditor({ recipe: detail, configurable: true })
                }
              >
                Convertir a modificadores
              </Button>
            )}
          <Button variant="outline" asChild>
            <Link href={paths["products"]}>Gestionar productos</Link>
          </Button>
          <Button
            disabled={operation.locked}
            onClick={() => {
              setSuccess("");
              setEditor({});
            }}
          >
            <Plus />
            Nueva receta
          </Button>
        </div>
      </div>
      <div
        className="mb-6 flex gap-3 border-b border-line"
        aria-label="Tipos de receta"
      >
        {(
          [
            ["product", "Productos"],
            ["preparation", "Preparaciones base"],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            aria-pressed={kind === value}
            disabled={operation.locked}
            className={`min-h-12 border-b-2 px-4 text-sm font-semibold ${kind === value ? "border-orange-500 text-brand" : "border-transparent text-muted hover:text-brand"}`}
            onClick={() => {
              setKind(value);
              setSearch("");
              setOffset(0);
              setSelectedId(null);
              setDetail(null);
              setVersion("");
            }}
          >
            {label}
          </button>
        ))}
      </div>
      {success && (
        <p
          role="status"
          className="mb-4 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800"
        >
          {success}
        </p>
      )}
      {(error || operation.error) && (
        <div
          role="alert"
          className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-800"
        >
          {error || operation.error}
          {operation.uncertain ? (
            <Button
              variant="outline"
              className="ml-2"
              disabled={operation.busy}
              onClick={operation.retry}
            >
              Reintentar mismo envío
            </Button>
          ) : error ? (
            <Button
              variant="outline"
              className="ml-2"
              onClick={() => setRefresh((n) => n + 1)}
            >
              Reintentar carga
            </Button>
          ) : null}
        </div>
      )}
      <div className="mb-4 flex items-center justify-between gap-4">
        <div className="relative w-full max-w-sm">
          <Search className="absolute left-3 top-3.5 size-4 text-muted" />
          <Input
            type="search"
            className="pl-10"
            aria-label="Buscar receta"
            placeholder="Buscar receta…"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setOffset(0);
            }}
          />
        </div>
        <span className="shrink-0 text-xs text-muted">
          {list.total} recetas
        </span>
      </div>
      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(350px,0.85fr)]">
        <section
          className="surface-panel min-w-0 overflow-hidden"
          aria-label="Lista de recetas"
          aria-busy={loading}
        >
          {loading ? (
            <p className="p-8 text-sm text-muted" role="status">
              Cargando recetas…
            </p>
          ) : !list.rows.length ? (
            <div className="flex min-h-72 flex-col items-center justify-center gap-3 p-8 text-center">
              <BookOpen className="size-9 text-blue-500" />
              <h2 className="text-lg font-bold">
                {search
                  ? "No encontramos esa receta"
                  : "Empezá con tu primera receta"}
              </h2>
              <p className="max-w-xs text-sm text-muted">
                Elegí un{" "}
                {kind === "product" ? "producto" : "artículo preparado"}, agregá
                sus ingredientes y conocé su costo.
              </p>
              <Button
                variant="outline"
                disabled={operation.locked}
                onClick={() => setEditor({})}
              >
                Crear receta
              </Button>
            </div>
          ) : (
            <>
              <ul className="divide-y divide-line sm:hidden">
                {list.rows.map((row) => (
                  <li
                    key={row.id}
                    className={selectedId === row.id ? "bg-blue-50" : ""}
                  >
                    <button
                      type="button"
                      className="w-full p-4 text-left"
                      aria-label={`Ver receta de ${row.name}`}
                      onClick={() => select(row.id)}
                    >
                      <span className="flex items-center gap-3">
                        <span className="icon-tile">
                          {row.kind === "product" ? (
                            <Coffee size={21} />
                          ) : (
                            <ChefHat size={21} />
                          )}
                        </span>
                        <span className="min-w-0 flex-1 break-words text-sm font-bold">
                          {row.name}
                          <span className="mt-1 block text-xs font-normal text-muted">
                            {row.archived
                              ? "Archivado"
                              : `Versión ${row.revision}`}
                          </span>
                        </span>
                        <ArrowRight
                          size={16}
                          className="shrink-0 text-blue-600"
                        />
                      </span>
                      <span className="mt-4 grid grid-cols-2 gap-4 text-sm tabular-nums">
                        <span>
                          <span className="mb-1 block text-xs text-muted">
                            Costo por{" "}
                            {row.kind === "preparation"
                              ? unitLabel(row.baseUnit)
                              : "unidad"}
                          </span>
                          {money(
                            row.unitCost,
                            row.kind === "preparation" ? 6 : 2,
                          )}
                        </span>
                        <span className="text-right font-semibold">
                          <span className="mb-1 block text-xs font-normal text-muted">
                            {row.kind === "product"
                              ? "Mostrador"
                              : "Rendimiento"}
                          </span>
                          {row.kind === "product"
                            ? money(row.priceCounter)
                            : quantity(row.yieldQuantity, row.baseUnit)}
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
              <div className="hidden sm:block">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>
                        {kind === "product" ? "Producto" : "Preparación"}
                      </TableHead>
                      <TableHead className="text-right">
                        Costo por unidad
                      </TableHead>
                      <TableHead className="text-right">
                        {kind === "product" ? "Mostrador" : "Rendimiento"}
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {list.rows.map((row) => (
                      <TableRow
                        key={row.id}
                        className={selectedId === row.id ? "bg-blue-50" : ""}
                      >
                        <TableCell>
                          <button
                            type="button"
                            className="flex min-h-12 w-full items-center gap-3 text-left font-semibold text-brand"
                            aria-label={`Ver receta de ${row.name}`}
                            onClick={() => select(row.id)}
                          >
                            <span
                              className={`icon-tile ${selectedId === row.id ? "bg-white" : "bg-surface"}`}
                            >
                              {row.kind === "product" ? (
                                <Coffee size={21} />
                              ) : (
                                <ChefHat size={21} />
                              )}
                            </span>
                            <span className="min-w-0 break-words">
                              {row.name}
                              <span className="mt-1 block text-xs font-normal text-muted">
                                {row.archived
                                  ? "Archivado"
                                  : `Versión ${row.revision}`}
                              </span>
                            </span>
                          </button>
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {money(
                            row.unitCost,
                            row.kind === "preparation" ? 6 : 2,
                          )}
                          {row.kind === "preparation" && (
                            <span className="block text-xs text-muted">
                              por {unitLabel(row.baseUnit)}
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="text-right font-semibold tabular-nums">
                          {kind === "product"
                            ? money(row.priceCounter)
                            : quantity(row.yieldQuantity, row.baseUnit)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <div className="flex items-center justify-between border-t border-line p-4 text-xs text-muted">
                <span>
                  {offset + 1}–{offset + list.rows.length} de {list.total}
                </span>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={!offset}
                    onClick={() => setOffset((n) => n - 100)}
                  >
                    Anterior
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={offset + 100 >= list.total}
                    onClick={() => setOffset((n) => n + 100)}
                  >
                    Siguiente
                  </Button>
                </div>
              </div>
            </>
          )}
        </section>
        {detailLoading ? (
          <div className="surface-panel p-8 text-sm text-muted" role="status">
            Cargando ingredientes…
          </div>
        ) : detail ? (
          <RecipePanel
            key={detail.versionId}
            recipe={detail}
            onEdit={() => setEditor({ recipe: detail })}
            onVersion={(v) => {
              setDetail(null);
              setDetailLoading(true);
              setVersion(v);
            }}
            locked={operation.locked}
          />
        ) : (
          <div className="surface-panel flex min-h-64 flex-col items-center justify-center gap-3 p-8 text-center text-muted">
            <BookOpen size={30} />
            <p className="text-sm">
              Seleccioná una receta para ver sus ingredientes y comparar costos.
            </p>
          </div>
        )}
      </div>
      <Dialog
        open={!!editor}
        onOpenChange={(open) => {
          if (!open && !operation.locked) setEditor(null);
        }}
      >
        <DialogContent
          className="max-h-[94dvh] gap-8 overflow-y-auto p-5 sm:max-w-5xl sm:p-8 lg:p-10"
          showCloseButton={!operation.locked}
        >
          <DialogHeader className="gap-3 border-b border-line pb-6 pr-6 text-left">
            <DialogTitle className="text-2xl">
              {editor?.recipe ? "Editar receta" : "Nueva receta"}
            </DialogTitle>
            <DialogDescription>
              {kind === "product"
                ? "Ingredientes para una unidad de venta."
                : "Ingredientes y rendimiento de una receta base."}{" "}
              Los cambios quedan guardados por versión.
            </DialogDescription>
          </DialogHeader>
          {editor &&
            (editor.configurable ||
            editor.recipe?.compositionModel === "configurable" ? (
              <ModifierRecipeEditor
                initial={editor.recipe}
                onSave={(input) => operation.submit("/api/recipes", input)}
                onCancel={() => setEditor(null)}
                disabled={operation.locked}
                error={operation.error}
              />
            ) : (
              <RecipeEditor
                key={editor.recipe?.versionId ?? kind}
                kind={kind}
                initial={editor.recipe}
                disabled={operation.locked}
                error={operation.error}
                retry={operation.uncertain ? operation.retry : undefined}
                onCancel={() => setEditor(null)}
                onSave={(input) => operation.submit("/api/recipes", input)}
              />
            ))}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function RecipePanel({
  recipe,
  onEdit,
  onVersion,
  locked,
}: {
  recipe: RecipeDetail;
  onEdit: () => void;
  onVersion: (v: string) => void;
  locked: boolean;
}) {
  const [selections, setSelections] = useState(() =>
    recipe.lines.map((l) => ({
      lineId: l.id,
      optionId: l.options[0].id as string | null,
    })),
  );
  const [cost, setCost] = useState<CostResult | null>(recipe.cost),
    [error, setError] = useState("");
  const requestNumber = useRef(0);
  const old = recipe.versionId !== recipe.versions[0].id;
  useEffect(
    () => () => {
      requestNumber.current++;
    },
    [],
  );
  async function select(lineId: string, optionId: string | null) {
    const updated = selections.map((s) =>
      s.lineId === lineId ? { lineId, optionId } : s,
    );
    setSelections(updated);
    setCost(null);
    setError("");
    const n = ++requestNumber.current;
    try {
      const response = await fetch(`/api/recipes/${recipe.id}/cost`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          revision: recipe.revision,
          selections: updated,
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      if (requestNumber.current === n) setCost(result);
    } catch (e) {
      if (requestNumber.current === n)
        setError(
          e instanceof Error ? e.message : "No pudimos comparar los costos.",
        );
    }
  }
  return (
    <section
      className="surface-panel min-w-0 p-5 sm:p-6"
      aria-label="Detalle de receta"
    >
      {recipe.configuration && (
        <CostSimulator key={recipe.versionId} recipe={recipe} />
      )}
      <div className="mb-6 flex items-start gap-4">
        <span className="icon-tile icon-tile-warm">
          {recipe.kind === "product" ? (
            <Coffee size={25} />
          ) : (
            <ChefHat size={25} />
          )}
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="break-words text-xl font-bold text-brand">
            {recipe.name}
          </h2>
          <p className="mt-1 text-xs text-muted">
            Versión {recipe.revision}
            {old ? " · Histórica" : " · Actual"}
          </p>
        </div>
      </div>
      {old && (
        <div className="mb-4">
          <Notice>
            Estás viendo una versión anterior. Los costos se calculan con
            precios actuales.
            <button
              className="mt-2 block font-bold underline"
              onClick={() => onVersion("")}
            >
              Volver a versión actual
            </button>
          </Notice>
        </div>
      )}
      <h3 className="mb-3 text-sm font-bold">
        Composición por {recipe.kind === "product" ? "unidad" : "receta base"}
      </h3>
      <div className="rounded-xl border border-line px-4">
        {recipe.lines.map((line, i) => {
          const selection = selections.find((s) => s.lineId === line.id)!;
          const option = line.options.find((o) => o.id === selection.optionId);
          return (
            <div
              key={line.id}
              className="border-b border-line py-4 last:border-0"
            >
              <div className="flex items-start justify-between gap-3">
                <span className="text-sm font-medium">
                  {option?.name ?? "Sin ingrediente"}
                  <span className="block text-xs font-normal text-muted">
                    {recipeSection(option?.itemClass)}
                  </span>
                  {option?.archived && " (archivado)"}
                </span>
                <span className="max-w-[60%] text-right text-xs text-muted tabular-nums">
                  {option
                    ? `${quantity(option.quantity, option.baseUnit)} útiles · ${option.wastePercent ?? "0.00"}% merma · ${quantity(consumptionQuantity(option.quantity, option.wastePercent), option.baseUnit)} consumo`
                    : "Omitido"}
                </span>
              </div>
              {(line.optional || line.options.length > 1) && (
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  {line.optional && (
                    <span className="rounded-full bg-blue-50 px-2 py-1 text-xs text-blue-700">
                      Opcional
                    </span>
                  )}
                  <select
                    aria-label={`Alternativa ${i + 1}`}
                    className="form-control min-w-0 flex-1"
                    disabled={old}
                    value={selection.optionId ?? ""}
                    onChange={(e) =>
                      void select(line.id, e.target.value || null)
                    }
                  >
                    {line.optional && <option value="">Sin ingrediente</option>}
                    {line.options.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          );
        })}
      </div>
      <dl className="my-4">
        <SummaryLine
          label="Rendimiento base"
          value={quantity(recipe.yieldQuantity, recipe.baseUnit)}
        />
        <SummaryLine
          label="Costo de la receta"
          value={
            cost
              ? money(cost.totalCost)
              : error
                ? "Sin calcular"
                : "Calculando…"
          }
          strong
        />
        {recipe.kind === "preparation" && (
          <SummaryLine
            label={`Costo por ${unitLabel(recipe.baseUnit)}`}
            value={cost ? money(cost.unitCost, 6) : "—"}
          />
        )}
      </dl>
      {error && (
        <p role="alert" className="mb-3 text-sm text-red-700">
          {error}{" "}
          <button
            className="underline"
            onClick={() =>
              void select(selections[0].lineId, selections[0].optionId)
            }
          >
            Reintentar cálculo
          </button>
        </p>
      )}
      {cost?.missing.length ? (
        <Notice>
          <strong>Costo pendiente</strong>
          <p className="mt-1">
            Faltan precios o hay artículos archivados: {cost.missing.join(", ")}
            .
          </p>
          <Link
            className="mt-2 inline-block font-semibold underline"
            href={paths["items"]}
          >
            Revisar artículos
          </Link>
        </Notice>
      ) : (
        <p className="text-xs leading-relaxed text-muted">
          Costo teórico con precios actuales. No incluye mano de obra, gastos
          del local ni comisiones de delivery.
        </p>
      )}
      {recipe.notes && (
        <p className="mt-4 whitespace-pre-wrap text-sm text-muted">
          {recipe.notes}
        </p>
      )}
      <div className="mt-5 grid gap-2">
        <Button
          variant="outline"
          disabled={locked || old || recipe.archived}
          onClick={onEdit}
        >
          <Pencil />
          Editar receta
        </Button>
        {recipe.kind === "preparation" && !old && !recipe.archived && (
          <Button asChild>
            <Link href={`${paths.production}?recipe=${recipe.id}`}>
              Registrar producción
              <ArrowRight />
            </Link>
          </Button>
        )}
      </div>
      <details className="mt-5 border-t border-line pt-4">
        <summary className="flex cursor-pointer items-center gap-2 text-xs font-semibold text-muted">
          <History size={15} />
          Historial de versiones ({recipe.versions.length})
        </summary>
        <ul className="mt-3 space-y-1">
          {recipe.versions.map((v) => (
            <li key={v.id}>
              <button
                className="flex min-h-10 w-full items-center justify-between gap-2 rounded-lg px-3 text-xs hover:bg-surface"
                onClick={() => onVersion(v.id)}
                disabled={v.id === recipe.versionId}
              >
                <span>Ver versión {v.version}</span>
                <span className="text-muted">{date(v.createdAt)}</span>
              </button>
            </li>
          ))}
        </ul>
      </details>
    </section>
  );
}

type OptionDraft = {
  key: string;
  itemId: string;
  item?: CatalogRow;
  quantity: string;
  wastePercent: string;
};
type LineDraft = { key: string; optional: boolean; options: OptionDraft[] };
const blankOption = (): OptionDraft => ({
  key: crypto.randomUUID(),
  itemId: "",
  quantity: "",
  wastePercent: "0",
});
function RecipeEditor({
  kind,
  initial,
  disabled,
  error,
  retry,
  onCancel,
  onSave,
}: {
  kind: RecipeKind;
  initial?: RecipeDetail;
  disabled: boolean;
  error: string;
  retry?: () => void;
  onCancel: () => void;
  onSave: (data: RecipeInput) => void;
}) {
  const [targetId, setTargetId] = useState(initial?.targetId ?? ""),
    [target, setTarget] = useState<CatalogRow | undefined>(
      initial
        ? {
            id: initial.targetId,
            name: initial.name,
            baseUnit: initial.baseUnit,
            revision: 1,
            archivedAt: null,
          }
        : undefined,
    );
  const [yieldQuantity, setYield] = useState(
      initial ? inputDecimal(initial.yieldQuantity) : "1",
    ),
    [notes, setNotes] = useState(initial?.notes ?? "");
  const [lines, setLines] = useState<LineDraft[]>(() =>
    initial
      ? initial.lines.map((l) => ({
          key: l.id,
          optional: l.optional,
          options: l.options.map((o) => ({
            key: o.id,
            itemId: o.itemId,
            quantity: inputDecimal(o.quantity),
            wastePercent: inputDecimal(o.wastePercent ?? "0.00"),
            item: {
              id: o.itemId,
              name: o.name,
              class: o.itemClass ?? "unclassified",
              baseUnit: o.baseUnit,
              revision: 1,
              archivedAt: o.archived ? "archived" : null,
            },
          })),
        }))
      : [
          {
            key: crypto.randomUUID(),
            optional: false,
            options: [blankOption()],
          },
        ],
  );
  function update(line: number, option: number, value: Partial<OptionDraft>) {
    setLines((rows) =>
      rows.map((l, i) =>
        i === line
          ? {
              ...l,
              options: l.options.map((o, j) =>
                j === option ? { ...o, ...value } : o,
              ),
            }
          : l,
      ),
    );
  }
  function submit(e: FormEvent) {
    e.preventDefault();
    onSave({
      requestId: crypto.randomUUID(),
      ...(initial ? { id: initial.id, revision: initial.revision } : {}),
      kind,
      targetId,
      targetUnit: kind === "product" ? "unit" : String(target?.baseUnit ?? "g"),
      yieldQuantity: kind === "product" ? "1" : yieldQuantity,
      notes,
      lines: lines.map((l) => ({
        optional: l.optional,
        options: l.options.map((o) => ({
          itemId: o.itemId,
          quantity: o.quantity,
          wastePercent: o.wastePercent,
          baseUnit: String(o.item?.baseUnit ?? "g"),
        })),
      })),
    });
  }
  return (
    <form onSubmit={submit} className="space-y-8">
      <CostPreview
        yieldQuantity={kind === "product" ? "1" : yieldQuantity}
        rows={lines.flatMap((line) =>
          line.options.map((o, index) => ({
            itemId: o.itemId,
            name: String(o.item?.name ?? ""),
            itemClass: String(o.item?.class ?? ""),
            baseUnit: String(o.item?.baseUnit ?? "g"),
            quantity: o.quantity,
            wastePercent: o.wastePercent,
            include: index === 0,
          })),
        )}
      />
      <fieldset disabled={disabled} className="space-y-8">
        <div className="grid gap-7 sm:grid-cols-2">
          <SearchSelect
            entity={kind === "product" ? "products" : "items"}
            label={kind === "product" ? "Producto" : "Preparado a ingresar"}
            value={targetId}
            initial={target}
            required
            disabled={!!initial || disabled}
            onChange={(id, row) => {
              setTargetId(id);
              setTarget(row);
            }}
          />
          <Field
            label="Rendimiento base"
            value={kind === "product" ? "1" : yieldQuantity}
            onChange={kind === "product" ? undefined : setYield}
            unit={kind === "product" ? "unit" : String(target?.baseUnit ?? "g")}
            required
            hint={
              kind === "product"
                ? "Una unidad de venta."
                : "Cantidad obtenida con una receta base."
            }
          />
        </div>
        <p className="text-xs text-muted">
          ¿Falta una ficha?{" "}
          <Link
            href={kind === "product" ? paths.products : paths.items}
            className="font-semibold text-blue-700 underline"
          >
            Creala en{" "}
            {kind === "product"
              ? "Catálogo y precios"
              : "Catálogo de inventario"}
          </Link>{" "}
          antes de armar la receta.
        </p>
        <div className="space-y-6">
          {lines.map((line, i) => (
            <section
              key={line.key}
              className="rounded-xl border border-line bg-surface/50 p-5 sm:p-6"
            >
              <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-bold">
                  {recipeSection(String(line.options[0]?.item?.class ?? ""))} ·{" "}
                  {i + 1}
                </h3>
                <div className="flex items-center gap-3">
                  <label className="flex min-h-10 items-center gap-2 text-xs">
                    <input
                      type="checkbox"
                      className="size-4 accent-blue-600"
                      checked={line.optional}
                      onChange={(e) =>
                        setLines((rows) =>
                          rows.map((l, n) =>
                            n === i ? { ...l, optional: e.target.checked } : l,
                          ),
                        )
                      }
                    />
                    Opcional
                  </label>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={`Eliminar ingrediente ${i + 1}`}
                    disabled={lines.length === 1}
                    onClick={() =>
                      setLines((rows) => rows.filter((_, n) => n !== i))
                    }
                  >
                    <Trash2 />
                  </Button>
                </div>
              </div>
              {line.options.map((option, j) => (
                <div
                  key={option.key}
                  className="mb-6 grid items-end gap-5 sm:grid-cols-[minmax(0,1fr)_150px_120px_40px]"
                >
                  <SearchSelect
                    entity="items"
                    itemScope="recipe"
                    label={`Ingrediente o descartable ${i + 1}.${j + 1}`}
                    value={option.itemId}
                    initial={option.item}
                    required
                    disabled={disabled}
                    onChange={(id, row) =>
                      update(i, j, { itemId: id, item: row })
                    }
                  />
                  <Field
                    label={`Cantidad ${i + 1}.${j + 1}`}
                    value={option.quantity}
                    onChange={(v) => update(i, j, { quantity: v })}
                    unit={String(option.item?.baseUnit ?? "g")}
                    required
                  />
                  <Field
                    label={`Merma % ${i + 1}.${j + 1}`}
                    value={option.wastePercent}
                    onChange={(v) => update(i, j, { wastePercent: v })}
                    unit="%"
                    required
                  />
                  {j > 0 ? (
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      aria-label={`Eliminar alternativa ${i + 1}.${j + 1}`}
                      onClick={() =>
                        setLines((rows) =>
                          rows.map((l, n) =>
                            n === i
                              ? {
                                  ...l,
                                  options: l.options.filter((_, k) => k !== j),
                                }
                              : l,
                          ),
                        )
                      }
                    >
                      <Trash2 />
                    </Button>
                  ) : (
                    <span className="hidden sm:block" />
                  )}
                </div>
              ))}
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={line.options.length >= 5}
                onClick={() =>
                  setLines((rows) =>
                    rows.map((l, n) =>
                      n === i
                        ? { ...l, options: [...l.options, blankOption()] }
                        : l,
                    ),
                  )
                }
              >
                <Plus />
                Agregar alternativa
              </Button>
              <p className="mt-2 text-xs text-muted">
                La primera opción es la predeterminada.
              </p>
            </section>
          ))}
        </div>
        <Button
          type="button"
          variant="outline"
          disabled={lines.length >= 30}
          onClick={() =>
            setLines((rows) => [
              ...rows,
              {
                key: crypto.randomUUID(),
                optional: false,
                options: [blankOption()],
              },
            ])
          }
        >
          <Plus />
          Agregar ingrediente o descartable
        </Button>
        <label className="block text-xs font-semibold">
          Indicaciones de preparación
          <textarea
            className="form-control mt-2 min-h-20"
            value={notes}
            maxLength={2000}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Pasos, temperatura o notas para el equipo…"
          />
        </label>
      </fieldset>
      {error && (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      )}
      {retry && (
        <Button type="button" variant="outline" onClick={retry}>
          Reintentar mismo envío
        </Button>
      )}
      <div className="flex justify-end gap-2 border-t border-line pt-4">
        <Button
          type="button"
          variant="outline"
          disabled={disabled}
          onClick={onCancel}
        >
          Cancelar
        </Button>
        <Button type="submit" disabled={disabled}>
          Guardar receta
        </Button>
      </div>
    </form>
  );
}
