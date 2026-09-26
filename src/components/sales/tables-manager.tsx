"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  Armchair,
  Check,
  Grid2X2,
  Plus,
  RotateCw,
  Users,
  WalletCards,
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
import { getJson, money, useOperation } from "@/components/inventory/shared";
import { cents, integer } from "@/modules/inventory/decimal";
import type { Actor } from "@/lib/access";
import type { TableView } from "@/modules/sales/types";
import { Control, selectClass, OperationNotice } from "./shared";
type Draft = {
  id?: string;
  revision?: number;
  name: string;
  capacity: number;
  x: number;
  y: number;
  occupied: boolean;
};
export function TablesManager({
  actorId,
  role,
}: {
  actorId: string;
  role: Actor["role"];
}) {
  const [tables, setTables] = useState<TableView[]>([]),
    [refresh, setRefresh] = useState(0),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [editing, setEditing] = useState(false),
    [draft, setDraft] = useState<Draft | null>(null),
    [notice, setNotice] = useState("");
  const success = useCallback(() => {
    setDraft(null);
    setRefresh((n) => n + 1);
    setNotice("Disposición guardada.");
  }, []);
  const operation = useOperation<Record<string, unknown>>(
    actorId,
    "table",
    success,
  );
  useEffect(() => {
    let live = true;
    const timer = setTimeout(() => {
      setLoading(true);
      setError("");
      getJson<TableView[]>("/api/sales/tables")
        .then((r) => {
          if (live) setTables(r);
        })
        .catch((e) => {
          if (live) setError(e.message);
        })
        .finally(() => {
          if (live) setLoading(false);
        });
    }, 0);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [refresh]);
  const occupied = tables.filter((t) => t.saleId),
    balance = cents(
      occupied.reduce((sum, t) => sum + integer(t.balanceDue!), 0n),
    ),
    locked = operation.locked || loading;
  function choose(x: number, y: number) {
    if (locked) return;
    const table = tables.find((t) => t.x === x && t.y === y);
    operation.clearError();
    setDraft(
      table
        ? {
            id: table.id,
            revision: table.revision,
            name: table.name,
            capacity: table.capacity,
            x,
            y,
            occupied: !!table.saleId,
          }
        : {
            name: `Mesa ${tables.length + 1}`,
            capacity: 2,
            x,
            y,
            occupied: false,
          },
    );
  }
  function save(archived = false) {
    if (!draft || locked) return;
    const { occupied: _occupied, ...values } = draft;
    void _occupied;
    operation.submit("/api/sales/tables", {
      ...values,
      requestId: crypto.randomUUID(),
      archived,
    });
  }
  return (
    <div className="space-y-6">
      <div className="page-heading">
        <div>
          <h1 className="page-title">Mesas</h1>
          <p className="page-description">
            El salón, sus cuentas y los próximos pedidos.
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          <Button
            variant="outline"
            disabled={locked}
            onClick={() => setRefresh((n) => n + 1)}
            aria-label="Actualizar mesas"
          >
            <RotateCw size={17} />
          </Button>
          {role !== "staff" && (
            <Button
              disabled={locked}
              onClick={() => {
                setEditing(!editing);
                setNotice("");
              }}
            >
              {editing ? <Check size={17} /> : <Grid2X2 size={17} />}
              {editing ? "Terminar edición" : "Editar disposición"}
            </Button>
          )}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {[
          {
            label: "Mesas",
            value: tables.length,
            icon: Armchair,
            hint: "En el salón",
          },
          {
            label: "Con cuenta",
            value: occupied.length,
            icon: Users,
            hint: "Visitas abiertas",
          },
          {
            label: "Por cobrar",
            value: money(balance),
            icon: WalletCards,
            hint: "Cuentas de mesa",
          },
        ].map(({ label, value, icon: Icon, hint }) => (
          <div
            key={label}
            className="surface-panel min-w-0 p-3 last:col-span-2 sm:p-5 sm:last:col-span-1"
          >
            <div className="mb-3 flex items-center justify-between gap-2">
              <p className="text-xs font-semibold text-muted">{label}</p>
              <Icon size={17} className="hidden text-blue sm:block" />
            </div>
            <p className="break-words text-lg font-extrabold tabular-nums text-brand sm:text-2xl">
              {loading || error ? "—" : value}
            </p>
            <p className="mt-1 hidden text-xs text-muted sm:block">{hint}</p>
          </div>
        ))}
      </div>
      {!draft && (
        <OperationNotice
          error={operation.error}
          uncertain={operation.uncertain}
          busy={operation.busy}
          retry={operation.retry}
        />
      )}
      {error && (
        <p
          role="alert"
          className="rounded-xl bg-red-50 p-4 text-sm text-red-700"
        >
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="text-sm text-emerald-800">
          {notice}
        </p>
      )}
      <section className="surface-panel overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line p-5">
          <div>
            <h2 className="text-base font-extrabold text-brand">
              {editing ? "Diseñá tu salón" : "Vista del salón"}
            </h2>
            <p className="mt-1 text-xs text-muted">
              {editing
                ? "Elegí una celda para agregar una mesa o una mesa para moverla."
                : "Abrí una mesa para tomar un pedido o continuar su cuenta."}
            </p>
          </div>
          <div className="flex gap-4 text-xs text-muted">
            <span className="flex items-center gap-1.5">
              <span className="size-2 rounded-full bg-emerald-500" />
              Libre
            </span>
            <span className="flex items-center gap-1.5">
              <span className="size-2 rounded-full bg-orange-500" />
              Con cuenta
            </span>
          </div>
        </div>
        {loading ? (
          <p role="status" className="py-24 text-center text-sm text-muted">
            Actualizando el salón…
          </p>
        ) : error ? (
          <p className="p-6 text-sm text-muted">
            Actualizá la vista para consultar las cuentas vigentes.
          </p>
        ) : (
          <>
            {!editing && (
              <div className="grid grid-cols-2 gap-3 p-4 md:hidden">
                {tables.map((table) => (
                  <Link
                    key={table.id}
                    href={
                      table.saleId
                        ? `/sales?account=${table.saleId}`
                        : `/sales?table=${table.id}`
                    }
                    className={`min-w-0 rounded-xl border p-4 ${table.saleId ? "border-orange-200 bg-orange-50" : "border-emerald-100 bg-white"}`}
                  >
                    <div className="mb-3 flex items-center justify-between">
                      <Armchair
                        size={20}
                        className={
                          table.saleId ? "text-orange-600" : "text-emerald-600"
                        }
                      />
                      <span className="flex items-center gap-1 text-xs text-muted">
                        <Users size={12} />
                        {table.capacity}
                      </span>
                    </div>
                    <p className="break-words text-sm font-bold text-brand">
                      {table.name}
                    </p>
                    <p
                      className={`mt-2 text-sm font-semibold tabular-nums ${table.saleId ? "text-orange-800" : "text-emerald-700"}`}
                    >
                      {table.saleId ? money(table.balanceDue) : "Libre"}
                    </p>
                    {table.saleId && (
                      <p className="mt-2 text-xs text-muted">
                        {table.orderCount}{" "}
                        {table.orderCount === 1 ? "pedido" : "pedidos"}
                      </p>
                    )}
                  </Link>
                ))}
              </div>
            )}
            <div
              className={`${editing ? "" : "hidden md:block "}overflow-x-auto p-4 sm:p-6`}
            >
              <div className="grid min-w-[660px] grid-cols-6 gap-3 rounded-xl bg-[#f7f9fc] p-3 sm:p-5">
                {Array.from({ length: 36 }, (_, i) => {
                  const x = i % 6,
                    y = Math.floor(i / 6),
                    table = tables.find((t) => t.x === x && t.y === y);
                  const card = table ? (
                    <>
                      <span className="mb-2 flex items-center justify-between gap-1">
                        <Armchair
                          size={18}
                          className={
                            table.saleId
                              ? "text-orange-600"
                              : "text-emerald-600"
                          }
                        />
                        <span className="flex items-center gap-1 text-[10px] text-muted">
                          <Users size={11} />
                          {table.capacity}
                        </span>
                      </span>
                      <span className="block truncate text-xs font-extrabold text-brand">
                        {table.name}
                      </span>
                      <span
                        className={`mt-2 block text-[10px] font-bold ${table.saleId ? "text-orange-800" : "text-emerald-700"}`}
                      >
                        {table.saleId ? money(table.balanceDue) : "Libre"}
                      </span>
                      {table.saleId && (
                        <span className="mt-1 block text-[10px] text-muted">
                          {table.orderCount}{" "}
                          {table.orderCount === 1 ? "pedido" : "pedidos"}
                        </span>
                      )}
                    </>
                  ) : (
                    <Plus size={18} className="mx-auto text-slate-400" />
                  );
                  const className = `block min-h-28 min-w-0 rounded-xl border p-3 text-left transition-colors ${table ? (table.saleId ? "border-orange-200 bg-orange-50/80 hover:border-orange-400" : "border-emerald-100 bg-white hover:border-emerald-300") : "border-dashed border-slate-200"}`;
                  return editing ? (
                    <button
                      key={i}
                      disabled={locked}
                      className={className}
                      aria-label={
                        table
                          ? `Editar ${table.name}`
                          : `Celda ${x + 1}, ${y + 1}`
                      }
                      onClick={() => choose(x, y)}
                    >
                      {card}
                    </button>
                  ) : table ? (
                    <Link
                      key={i}
                      href={
                        table.saleId
                          ? `/sales?account=${table.saleId}`
                          : `/sales?table=${table.id}`
                      }
                      className={className}
                    >
                      {card}
                    </Link>
                  ) : (
                    <div
                      key={i}
                      aria-hidden="true"
                      className="min-h-28 rounded-xl border border-dashed border-slate-200/60"
                    />
                  );
                })}
              </div>
            </div>
            {tables.length === 0 && !editing && (
              <div className="border-t border-line p-5 text-center text-sm text-muted">
                {role === "staff"
                  ? "Un encargado puede configurar las mesas del local."
                  : "Usá Editar disposición para ubicar las primeras mesas."}
              </div>
            )}
            <p className="border-t border-line px-5 py-3 text-xs text-muted">
              {editing
                ? "Grilla de 6 × 6. Cambiar la posición mueve la mesa en el plano; conserva su cuenta."
                : "La mesa queda libre cuando se completa el cobro de su cuenta."}
            </p>
          </>
        )}
      </section>
      {draft && (
        <Dialog
          open
          onOpenChange={(open) => {
            if (!open && !operation.locked) setDraft(null);
          }}
        >
          <DialogContent showCloseButton={!operation.locked}>
            <DialogHeader>
              <DialogTitle>
                {draft.id ? "Editar mesa" : "Nueva mesa"}
              </DialogTitle>
              <DialogDescription>
                Nombre, capacidad y ubicación en el salón.
              </DialogDescription>
            </DialogHeader>
            <OperationNotice
              error={operation.error}
              uncertain={operation.uncertain}
              busy={operation.busy}
              retry={operation.retry}
            />
            <fieldset disabled={operation.locked} className="space-y-4">
              <Control label="Nombre de la mesa">
                <Input
                  value={draft.name}
                  maxLength={40}
                  onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                />
              </Control>
              <Control label="Capacidad">
                <Input
                  type="number"
                  min={1}
                  max={30}
                  value={draft.capacity}
                  onChange={(e) =>
                    setDraft({ ...draft, capacity: Number(e.target.value) })
                  }
                />
              </Control>
              <div className="grid grid-cols-2 gap-4">
                <Control label="Columna">
                  <select
                    className={selectClass}
                    value={draft.x}
                    onChange={(e) =>
                      setDraft({ ...draft, x: Number(e.target.value) })
                    }
                  >
                    {Array.from({ length: 6 }, (_, i) => (
                      <option key={i} value={i}>
                        {i + 1}
                      </option>
                    ))}
                  </select>
                </Control>
                <Control label="Fila">
                  <select
                    className={selectClass}
                    value={draft.y}
                    onChange={(e) =>
                      setDraft({ ...draft, y: Number(e.target.value) })
                    }
                  >
                    {Array.from({ length: 6 }, (_, i) => (
                      <option key={i} value={i}>
                        {i + 1}
                      </option>
                    ))}
                  </select>
                </Control>
              </div>
            </fieldset>
            <Button
              disabled={
                operation.locked ||
                !draft.name.trim() ||
                !Number.isInteger(draft.capacity) ||
                draft.capacity < 1 ||
                draft.capacity > 30
              }
              onClick={() => save()}
            >
              Guardar mesa
            </Button>
            {draft.id && (
              <Button
                variant="ghost"
                className="text-red-700"
                disabled={operation.locked || draft.occupied}
                onClick={() => save(true)}
              >
                Archivar mesa
              </Button>
            )}
            {draft.occupied && (
              <p className="text-xs text-muted">
                La mesa tiene una cuenta abierta y no puede archivarse.
              </p>
            )}
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
