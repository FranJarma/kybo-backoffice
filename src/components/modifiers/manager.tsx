"use client";
import { recipeSection } from "@/modules/catalog/item-classes";

import { paths } from "@/lib/navigation";
import { Control as Field } from "@/components/sales/shared";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Plus, Pencil, Archive, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { SearchSelect, getJson } from "@/components/inventory/shared";
import { inputDecimal } from "@/components/recipes/shared";
import type { groupDefinition } from "@/modules/modifiers/service";
export type GroupDetail = Awaited<ReturnType<typeof groupDefinition>>;
export type ComponentDraft = {
  itemClass?: string;
  itemId: string;
  quantity: string;
  wastePercent?: string;
  baseUnit?: string;
  name?: string;
};
export async function writeJson<T>(
  url: string,
  data: unknown,
  method = "POST",
): Promise<T> {
  const r = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  const result = await r.json();
  if (!r.ok) throw new Error(result.error ?? "No pudimos guardar.");
  return result;
}
export function ComponentFields({
  value,
  onChange,
}: {
  value: ComponentDraft[];
  onChange: (v: ComponentDraft[]) => void;
}) {
  return (
    <div className="space-y-5">
      {["Ingredientes", "Descartables", "Otros componentes"].map((section) => {
        const entries = value
          .map((c, i) => ({ c, i }))
          .filter(({ c }) => recipeSection(c.itemClass) === section);
        if (!entries.length) return null;
        return (
          <section key={section} className="space-y-5" aria-label={section}>
            <h4 className="text-sm font-semibold text-brand">{section}</h4>
            {entries.map(({ c, i }) => (
              <div
                key={i}
                className="grid grid-cols-2 items-end gap-5 sm:grid-cols-[minmax(0,1fr)_140px_100px_40px] [&>div:first-child]:col-span-2 sm:[&>div:first-child]:col-span-1"
              >
                <SearchSelect
                  entity="items"
                  itemScope="recipe"
                  label={`Componente ${i + 1}`}
                  value={c.itemId}
                  initial={
                    c.itemId && c.name
                      ? {
                          id: c.itemId,
                        name: c.name,
                        class: c.itemClass ?? "unclassified",
                          baseUnit: c.baseUnit ?? null,
                          revision: 1,
                          archivedAt: null,
                        }
                      : undefined
                  }
                  onChange={(id, row) =>
                    onChange(
                      value.map((x, j) =>
                        j === i
                          ? {
                              ...x,
                              itemId: id,
                              baseUnit: String(row?.baseUnit ?? "g"),
                              name: String(row?.name ?? ""),
                              itemClass: String(row?.class ?? ""),
                            }
                          : x,
                      ),
                    )
                  }
                />
                <Field label={`Cantidad (${c.baseUnit ?? "unidad base"})`}>
                  <Input
                    aria-label={`Cantidad de componente ${i + 1}`}
                    value={c.quantity}
                    inputMode="decimal"
                    onChange={(e) =>
                      onChange(
                        value.map((x, j) =>
                          j === i ? { ...x, quantity: e.target.value } : x,
                        ),
                      )
                    }
                  />
                </Field>
                <Field label="Merma %">
                  <Input
                    aria-label={`Merma de componente ${i + 1}`}
                    inputMode="decimal"
                    value={c.wastePercent ?? "0"}
                    onChange={(event) =>
                      onChange(
                        value.map((x, j) =>
                          j === i
                            ? { ...x, wastePercent: event.target.value }
                            : x,
                        ),
                      )
                    }
                  />
                </Field>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  aria-label={`Quitar componente ${i + 1}`}
                  onClick={() => onChange(value.filter((_, j) => j !== i))}
                >
                  <Trash2 size={16} />
                </Button>
              </div>
            ))}
          </section>
        );
      })}
      <Button
        type="button"
        variant="outline"
        onClick={() => onChange([...value, { itemId: "", quantity: "" }])}
      >
        <Plus size={15} />
        Agregar ingrediente o descartable
      </Button>
      {!value.length && (
        <p className="text-xs text-muted">
          Sin componentes: útil para “Sin perlas” o una instrucción.
        </p>
      )}
    </div>
  );
}
type OptionDraft = {
  key: string;
  name: string;
  kind: "composition" | "instruction";
  instruction: string;
  components: ComponentDraft[];
};
function GroupEditor({
  initial,
  onSaved,
}: {
  initial?: GroupDetail;
  onSaved: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [options, setOptions] = useState<OptionDraft[]>(() =>
    initial
      ? initial.options.map((o) => ({
          key: o.key,
          name: o.name,
          kind: o.kind as OptionDraft["kind"],
          instruction: o.instruction ?? "",
          components: o.components.map((c) => ({
            ...c,
            quantity: inputDecimal(c.quantity),
            wastePercent: inputDecimal(c.wastePercent ?? "0.00"),
          })),
        }))
      : [
          {
            key: crypto.randomUUID(),
            name: "",
            kind: "composition",
            instruction: "",
            components: [],
          },
        ],
  );
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const [requestId] = useState(() => crypto.randomUUID());
  return (
    <form
      className="space-y-8"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError("");
        try {
          await writeJson("/api/modifier-groups", {
            requestId,
            id: initial?.id,
            revision: initial?.revision,
            name,
            options: options.map((o) => ({
              ...o,
              components: o.components.map(
                ({ itemId, quantity, wastePercent, baseUnit }) => ({
                  itemId,
                  quantity,
                  wastePercent,
                  baseUnit,
                }),
              ),
            })),
          });
          onSaved();
        } catch (e) {
          setError((e as Error).message);
        } finally {
          setBusy(false);
        }
      }}
    >
      <fieldset disabled={busy} className="space-y-8">
        <Field label="Nombre del grupo">
          <Input
            aria-label="Nombre del grupo"
            value={name}
            required
            maxLength={100}
            onChange={(e) => setName(e.target.value)}
          />
        </Field>
        <p className="text-sm text-muted">
          Compartí estas opciones entre productos. Cada producto define sus
          cantidades de elección y recargos.
        </p>
        {options.map((o, i) => (
          <section
            key={o.key}
            className="rounded-xl border border-line bg-surface/40 p-5 space-y-6 sm:p-6"
          >
            <div className="flex items-end gap-2">
              <div className="flex-1">
                <Field label={`Opción ${i + 1}`}>
                  <Input
                    aria-label={`Nombre de opción ${i + 1}`}
                    value={o.name}
                    required
                    onChange={(e) =>
                      setOptions(
                        options.map((x, j) =>
                          j === i ? { ...x, name: e.target.value } : x,
                        ),
                      )
                    }
                  />
                </Field>
              </div>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                aria-label={`Quitar opción ${i + 1}`}
                onClick={() => setOptions(options.filter((_, j) => j !== i))}
              >
                <Trash2 size={16} />
              </Button>
            </div>
            <select
              className="form-control"
              aria-label={`Tipo de opción ${i + 1}`}
              value={o.kind}
              onChange={(e) =>
                setOptions(
                  options.map((x, j) =>
                    j === i
                      ? {
                          ...x,
                          kind: e.target.value as OptionDraft["kind"],
                          components:
                            e.target.value === "instruction"
                              ? []
                              : x.components,
                        }
                      : x,
                  ),
                )
              }
            >
              <option value="composition">Ingredientes</option>
              <option value="instruction">Instrucción de preparación</option>
            </select>
            {o.kind === "composition" ? (
              <ComponentFields
                value={o.components}
                onChange={(components) =>
                  setOptions(
                    options.map((x, j) => (j === i ? { ...x, components } : x)),
                  )
                }
              />
            ) : (
              <Field label="Indicación para cocina">
                <Input
                  value={o.instruction}
                  placeholder={o.name}
                  onChange={(e) =>
                    setOptions(
                      options.map((x, j) =>
                        j === i ? { ...x, instruction: e.target.value } : x,
                      ),
                    )
                  }
                />
              </Field>
            )}
          </section>
        ))}
        <Button
          type="button"
          variant="outline"
          onClick={() =>
            setOptions([
              ...options,
              {
                key: crypto.randomUUID(),
                name: "",
                kind: "composition",
                instruction: "",
                components: [],
              },
            ])
          }
        >
          <Plus size={16} />
          Agregar opción
        </Button>
        {error && (
          <p role="alert" className="text-sm text-red-700">
            {error}
          </p>
        )}
        <div className="flex justify-end border-t border-line pt-4">
          <Button disabled={busy || !options.length} type="submit">
            {busy ? "Guardando…" : "Publicar grupo"}
          </Button>
        </div>
      </fieldset>
    </form>
  );
}
export function ModifiersManager() {
  const [groups, setGroups] = useState<
      {
        id: string;
        name: string;
        revision: number;
        archivedAt: string | null;
      }[]
    >([]),
    [editor, setEditor] = useState<{ initial?: GroupDetail } | null>(null),
    [error, setError] = useState(""),
    [refresh, setRefresh] = useState(0);
  useEffect(() => {
    let live = true;
    getJson<typeof groups>("/api/modifier-groups")
      .then((x) => {
        if (live) setGroups(x);
      })
      .catch((e) => {
        if (live) setError(e.message);
      });
    return () => {
      live = false;
    };
  }, [refresh]);
  return (
    <div>
      <div className="page-heading">
        <div>
          <h1 className="page-title">Modificadores</h1>
          <p className="page-description">
            Opciones reutilizables para tus productos.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" asChild>
            <Link href={paths["recipes"]}>Volver a recetas</Link>
          </Button>
          <Button onClick={() => setEditor({})}>
            <Plus size={16} />
            Nuevo grupo
          </Button>
        </div>
      </div>
      {error && (
        <p role="alert" className="mb-4 text-red-700">
          {error}
        </p>
      )}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {groups.map((g) => (
          <section className="surface-panel p-5" key={g.id}>
            <div className="flex justify-between gap-3">
              <h2 className="font-bold text-brand">{g.name}</h2>
              <span className="text-xs text-muted">v{g.revision}</span>
            </div>
            <p className="text-sm text-muted mt-2">
              {g.archivedAt
                ? "Archivado · conserva sus asignaciones"
                : "Disponible para asignar a recetas"}
            </p>
            <div className="flex gap-2 mt-5">
              <Button
                variant="outline"
                disabled={!!g.archivedAt}
                aria-label={`Editar ${g.name}`}
                onClick={async () => {
                  try {
                    setEditor({
                      initial: await getJson<GroupDetail>(
                        `/api/modifier-groups/${g.id}`,
                      ),
                    });
                  } catch (e) {
                    setError((e as Error).message);
                  }
                }}
              >
                <Pencil size={15} />
                Editar
              </Button>
              <Button
                variant="ghost"
                disabled={!!g.archivedAt}
                aria-label={`Archivar ${g.name}`}
                onClick={async () => {
                  try {
                    await writeJson(
                      `/api/modifier-groups/${g.id}`,
                      { revision: g.revision },
                      "PATCH",
                    );
                    setRefresh((x) => x + 1);
                  } catch (e) {
                    setError((e as Error).message);
                  }
                }}
              >
                <Archive size={15} />
                Archivar
              </Button>
            </div>
          </section>
        ))}
      </div>
      {!groups.length && (
        <div className="surface-panel p-10 text-center text-muted">
          Creá tu primer grupo, por ejemplo “Tipo de leche” o “Perlas”.
        </div>
      )}
      <Dialog
        open={!!editor}
        onOpenChange={(open) => {
          if (!open) setEditor(null);
        }}
      >
        <DialogContent className="max-h-[94dvh] gap-8 overflow-y-auto p-5 sm:max-w-4xl sm:p-8 lg:p-10">
          <DialogHeader className="gap-3 border-b border-line pb-6 pr-6 text-left">
            <DialogTitle className="text-2xl">
              {editor?.initial ? "Nueva versión del grupo" : "Nuevo grupo"}
            </DialogTitle>
            <DialogDescription>
              Los productos publicados conservan su versión hasta que decidas
              actualizarla.
            </DialogDescription>
          </DialogHeader>
          {editor && (
            <GroupEditor
              initial={editor.initial}
              onSaved={() => {
                setEditor(null);
                setRefresh((x) => x + 1);
              }}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
