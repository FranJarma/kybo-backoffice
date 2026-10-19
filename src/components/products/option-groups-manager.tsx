"use client";
import { useEffect, useRef, useState } from "react";
import { Plus, Pencil, Archive, Package, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SearchCombobox } from "@/components/ui/search-combobox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { OperationAlert } from "@/components/ui/operation-alert";
import { getJson } from "@/components/inventory/shared";
import { OptionGroupTabs } from "./option-group-tabs";
import type {
  ProductGroupDefinition,
  createProductGroupService,
} from "@/modules/combos/product-groups";
type GroupRow = Awaited<
  ReturnType<ReturnType<typeof createProductGroupService>["list"]>
>[number];
async function write<T>(
  url: string,
  input: unknown,
  method = "POST",
): Promise<T> {
  const response = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const result = await response.json();
  if (!response.ok) throw Error(result.error ?? "No pudimos guardar el grupo.");
  return result;
}
function GroupEditor({
  initial,
  onSaved,
  onCancel,
  onBusy,
}: {
  initial?: ProductGroupDefinition;
  onSaved: () => void;
  onCancel: () => void;
  onBusy: (busy: boolean) => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [selected, setSelected] = useState(
    initial?.options.map((p) => ({
      id: p.productId,
      name: p.name,
      archived: p.archived,
    })) ?? [],
  );
  const [query, setQuery] = useState("");
  const [choices, setChoices] = useState<
    { id: string; name: string; kind: string }[]
  >([]);
  const [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(false),
    [error, setError] = useState("");
  // One key for retries; a changed form receives a fresh key rather than conflicting with its own previous request.
  const [attempt, setAttempt] = useState<{ fingerprint: string; id: string }>();
  useEffect(() => {
    let live = true;
    const timer = setTimeout(() => {
      setLoading(true);
      getJson<{ rows: typeof choices }>(
        `/api/catalog/products?q=${encodeURIComponent(query)}`,
      )
        .then((d) => {
          if (live) setChoices(d.rows.filter((p) => p.kind === "individual"));
        })
        .catch((e) => {
          if (live) setError(e.message);
        })
        .finally(() => {
          if (live) setLoading(false);
        });
    }, 180);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [query]);
  return (
    <form
      className="space-y-7"
      onSubmit={async (event) => {
        event.preventDefault();
        setBusy(true);
        onBusy(true);
        setError("");
        const data = {
          id: initial?.id,
          revision: initial?.revision,
          name,
          productIds: selected.map((p) => p.id),
        };
        const fingerprint = JSON.stringify(data),
          requestId =
            attempt?.fingerprint === fingerprint
              ? attempt.id
              : crypto.randomUUID();
        setAttempt({ fingerprint, id: requestId });
        try {
          await write("/api/product-option-groups", { ...data, requestId });
          onSaved();
        } catch (e) {
          setError((e as Error).message);
        } finally {
          setBusy(false);
          onBusy(false);
        }
      }}
    >
      <OperationAlert title="No se pudo guardar" message={error} tone="error" />
      <fieldset disabled={busy} className="space-y-7">
        <label className="block text-sm font-medium">
          Nombre del grupo
          <Input
            className="mt-2"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            maxLength={100}
            placeholder="Por ejemplo, Gaseosa a elección"
          />
        </label>
        <section className="space-y-4">
          <div>
            <h3 className="font-semibold text-brand">Productos incluidos</h3>
            <p className="mt-2 text-sm text-muted">
              Elegí las fichas existentes. Sus recetas, modificadores y costos
              se conservan.
            </p>
          </div>
          <SearchCombobox
            id="group-product"
            label="Buscar producto para el grupo"
            value=""
            selectedLabel=""
            loading={loading}
            options={choices.filter(
              (p) => !selected.some((s) => s.id === p.id),
            )}
            onSearch={setQuery}
            disabled={selected.length >= 50}
            onChange={(id) => {
              const p = choices.find((p) => p.id === id);
              if (p)
                setSelected((s) => [
                  ...s,
                  { id: p.id, name: p.name, archived: false },
                ]);
            }}
          />
          <ul className="divide-y divide-line rounded-xl border border-line">
            {selected.map((p) => (
              <li
                key={p.id}
                className="flex items-center justify-between gap-4 px-4 py-3"
              >
                <span className="flex min-w-0 items-center gap-3">
                  <Package size={18} className="shrink-0 text-muted" />
                  <span className="break-words text-sm">
                    {p.name}
                    {p.archived && (
                      <span className="ml-2 text-red-700">
                        Archivado: quitá este producto
                      </span>
                    )}
                  </span>
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={`Quitar ${p.name}`}
                  onClick={() =>
                    setSelected((s) => s.filter((x) => x.id !== p.id))
                  }
                >
                  <X size={16} />
                </Button>
              </li>
            ))}
            {!selected.length && (
              <li className="p-6 text-center text-sm text-muted">
                Buscá un producto para empezar.
              </li>
            )}
          </ul>
          <p className="text-xs text-muted">
            Cada combo define sus unidades y adicionales. La disponibilidad se
            respeta por sucursal.
          </p>
        </section>
      </fieldset>
      <div className="flex flex-wrap justify-end gap-3 border-t border-line pt-6">
        <Button
          type="button"
          variant="ghost"
          disabled={busy}
          onClick={onCancel}
        >
          Cancelar
        </Button>
        <Button
          type="submit"
          disabled={
            busy || !selected.length || selected.some((p) => p.archived)
          }
        >
          {busy
            ? "Guardando…"
            : initial
              ? "Publicar nueva versión"
              : "Guardar grupo"}
        </Button>
      </div>
    </form>
  );
}
export function ProductOptionGroupsManager() {
  const [groups, setGroups] = useState<GroupRow[]>([]),
    [query, setQuery] = useState("");
  const [editor, setEditor] = useState<{
    initial?: ProductGroupDefinition;
  } | null>(null);
  const [refresh, setRefresh] = useState(0),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false);
  const [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const [archiving, setArchiving] = useState<GroupRow | null>(null);
  const archiveKeys = useRef(new Map<string, string>());
  useEffect(() => {
    let live = true;
    getJson<GroupRow[]>("/api/product-option-groups")
      .then((rows) => {
        if (live) {
          setGroups(rows);
          setError("");
        }
      })
      .catch((e) => {
        if (live) setError(e.message);
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => {
      live = false;
    };
  }, [refresh]);
  return (
    <div>
      <div className="page-heading">
        <div>
          <h1 className="page-title">Grupos de opciones</h1>
          <p className="page-description">
            Compartí elecciones entre productos y combos.
          </p>
        </div>
        <Button onClick={() => setEditor({})}>
          <Plus size={16} />
          Nuevo grupo de productos
        </Button>
      </div>
      <OptionGroupTabs active="products" />
      <OperationAlert
        title={error ? "No se pudo completar" : "Grupo guardado"}
        message={error || notice}
        tone={error ? "error" : "success"}
      />
      {error && (
        <p role="alert" className="mb-4 text-sm text-red-700">
          {error}{" "}
          <Button variant="ghost" onClick={() => setRefresh((n) => n + 1)}>
            Reintentar
          </Button>
        </p>
      )}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="font-semibold text-brand">Productos para combos</h2>
          <p className="mt-1 text-sm text-muted">
            Una lista compartida; cada combo conserva su propia cantidad y
            adicionales.
          </p>
        </div>
        <Input
          aria-label="Buscar grupos de productos"
          placeholder="Buscar un grupo…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="w-full sm:max-w-xs"
        />
      </div>
      {loading ? (
        <p className="py-10 text-muted" role="status">
          Cargando grupos…
        </p>
      ) : (
        <div className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-white">
          {groups
            .filter((g) =>
              g.name.toLocaleLowerCase().includes(query.toLocaleLowerCase()),
            )
            .map((g) => (
              <section
                key={g.id}
                className="flex flex-wrap items-center justify-between gap-4 p-5 sm:p-6"
              >
                <div className="min-w-0">
                  <h3 className="break-words font-semibold text-brand">
                    {g.name}
                  </h3>
                  <p className="mt-2 text-sm text-muted">
                    {g.productCount} productos · Versión {g.revision}
                    {g.archivedAt ? " · Archivado" : ""}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    disabled={!!g.archivedAt || busy}
                    aria-label={`Editar ${g.name}`}
                    onClick={async () => {
                      setBusy(true);
                      setError("");
                      try {
                        setEditor({
                          initial: await getJson<ProductGroupDefinition>(
                            `/api/product-option-groups/${g.id}`,
                          ),
                        });
                      } catch (e) {
                        setError((e as Error).message);
                      } finally {
                        setBusy(false);
                      }
                    }}
                  >
                    <Pencil size={15} />
                    Editar
                  </Button>
                  <Button
                    variant="ghost"
                    disabled={!!g.archivedAt || busy}
                    aria-label={`Archivar ${g.name}`}
                    onClick={() => setArchiving(g)}
                  >
                    <Archive size={15} />
                    Archivar
                  </Button>
                </div>
              </section>
            ))}
          {!groups.some((g) =>
            g.name.toLocaleLowerCase().includes(query.toLocaleLowerCase()),
          ) && (
            <p className="p-10 text-center text-muted">
              {query
                ? "No hay grupos que coincidan con la búsqueda."
                : "Creá un grupo, por ejemplo «Gaseosa a elección», para reutilizarlo en tus combos."}
            </p>
          )}
        </div>
      )}
      <Dialog
        open={!!editor}
        onOpenChange={(open) => {
          if (!open && !busy) setEditor(null);
        }}
      >
        <DialogContent
          className="max-h-[94dvh] gap-7 overflow-y-auto p-5 sm:max-w-4xl sm:p-8 lg:p-10"
          onInteractOutside={(event) => {
            if (busy) event.preventDefault();
          }}
          onEscapeKeyDown={(event) => {
            if (busy) event.preventDefault();
          }}
        >
          <DialogHeader className="gap-3 border-b border-line pb-6 pr-6 text-left">
            <DialogTitle className="text-2xl">
              {editor?.initial
                ? "Editar grupo de productos"
                : "Nuevo grupo de productos"}
            </DialogTitle>
            <DialogDescription>
              Los combos publicados conservan su versión hasta que revises y
              publiques sus cambios.
            </DialogDescription>
          </DialogHeader>
          {editor && (
            <GroupEditor
              initial={editor.initial}
              onBusy={setBusy}
              onCancel={() => setEditor(null)}
              onSaved={() => {
                setEditor(null);
                setRefresh((n) => n + 1);
                setNotice(
                  "El grupo está guardado. Podés seleccionarlo en Componentes de tus combos.",
                );
              }}
            />
          )}
        </DialogContent>
      </Dialog>
      <Dialog
        open={!!archiving}
        onOpenChange={(open) => {
          if (!open && !busy) setArchiving(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Archivar {archiving?.name}</DialogTitle>
            <DialogDescription>
              Los combos que ya lo usan conservan su versión. El grupo dejará de
              aparecer para nuevas asignaciones.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-3">
            <Button
              variant="ghost"
              disabled={busy}
              onClick={() => setArchiving(null)}
            >
              Cancelar
            </Button>
            <Button
              disabled={busy}
              onClick={async () => {
                if (!archiving) return;
                setBusy(true);
                setError("");
                setNotice("");
                const attemptKey = `${archiving.id}:${archiving.revision}`;
                if (!archiveKeys.current.has(attemptKey))
                  archiveKeys.current.set(attemptKey, crypto.randomUUID());
                try {
                  await write(
                    `/api/product-option-groups/${archiving.id}`,
                    {
                      requestId: archiveKeys.current.get(attemptKey),
                      revision: archiving.revision,
                    },
                    "PATCH",
                  );
                  archiveKeys.current.delete(attemptKey);
                  setArchiving(null);
                  setRefresh((n) => n + 1);
                  setNotice(
                    "El grupo fue archivado; sus combos e historial se conservan.",
                  );
                } catch (e) {
                  setError((e as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              {busy ? "Archivando…" : "Archivar grupo"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
