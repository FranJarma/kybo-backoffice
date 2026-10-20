"use client";
import { OperationAlert } from "@/components/ui/operation-alert";
import { FieldCaption } from "@/components/ui/field-caption";
import { useState } from "react";
import {
  MessageSquare,
  Minus,
  Pencil,
  Plus,
  ShoppingBag,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { money } from "@/components/inventory/shared";
import { cents, decimal, integer } from "@/modules/inventory/decimal";
import { appendCartLine } from "./touch-selection";
import type { CartLine } from "./cart";

export function Cart({
  lines,
  onChange,
  locked,
  allowPrice,
  total,
  children,
  onEdit,
}: {
  onEdit?: (index: number) => void;
  lines: CartLine[];
  onChange: (lines: CartLine[]) => void;
  locked: boolean;
  allowPrice: boolean;
  total: string | null;
  children: React.ReactNode;
}) {
  const [removed, setRemoved] = useState<CartLine | null>(null);
  const [editor, setEditor] = useState<{
    index: number;
    source: CartLine;
    draft: CartLine;
    focus: "price" | "notes";
  } | null>(null);
  const update = (i: number, data: Partial<CartLine>) =>
    onChange(lines.map((line, j) => (i === j ? { ...line, ...data } : line)));
  const remove = (i: number) => {
    setRemoved(lines[i]);
    onChange(lines.filter((_, j) => i !== j));
  };
  let editorError = "";
  let priceChanged = false;
  if (editor && allowPrice) {
    try {
      const price = decimal(editor.draft.price, 2);
      priceChanged = price !== editor.source.expectedPrice;
      if (priceChanged && !editor.draft.priceReason.trim())
        editorError = "Indicá el motivo del cambio de precio.";
    } catch {
      editorError = "Revisá el precio. Usá coma para decimales.";
    }
  }
  return (
    <section
      className="surface-panel flex min-h-0 flex-1 flex-col overflow-hidden"
      aria-label="Pedido actual"
    >
      <div className="flex shrink-0 items-center justify-between gap-3 border-b border-line px-4 py-3">
        <h2 className="flex items-center gap-2 text-base font-extrabold text-brand">
          <ShoppingBag size={18} className="text-orange-600" />
          Pedido actual
        </h2>
        <span className="text-xs text-muted">
          {lines.reduce((n, l) => n + l.quantity, 0)} unid.
        </span>
      </div>
      {removed && (
        <div className="flex shrink-0 items-center justify-between gap-2 border-b border-line px-4 text-xs text-muted">
          <span>{removed.name} eliminado</span>
          <Button
            type="button"
            variant="ghost"
            className="min-h-12"
            disabled={locked}
            onClick={() => {
              const next = appendCartLine(lines, removed);
              if (next !== lines) {
                onChange(next);
                setRemoved(null);
              }
            }}
          >
            Deshacer
          </Button>
        </div>
      )}
      <fieldset
        disabled={locked}
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain"
        data-testid="cart-lines"
      >
        {!lines.length ? (
          <div className="px-6 py-10 text-center">
            <ShoppingBag size={32} className="mx-auto mb-3 text-slate-300" />
            <p className="text-sm font-semibold text-brand">
              Tu pedido empieza acá
            </p>
            <p className="mt-2 text-xs text-muted">
              Elegí un producto de la carta.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-line px-3 sm:px-4">
            {lines.map((line, i) => {
              let unitPrice: string | null = null,
                subtotal: string | null = null;
              try {
                unitPrice = decimal(line.price, 2)!;
                subtotal = cents(integer(unitPrice) * BigInt(line.quantity));
              } catch {}
              const changed =
                unitPrice === null || unitPrice !== line.expectedPrice;
              const editable =
                !!onEdit &&
                (line.configurable ||
                  !!line.modifiers?.length ||
                  !!line.comboChoices?.length);
              return (
                <div
                  key={`${line.productId}:${i}`}
                  data-testid="cart-line"
                  className="py-2.5"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      {editable ? (
                        <button
                          type="button"
                          className="flex min-h-12 w-full items-center gap-2 text-left text-sm font-bold text-brand"
                          aria-label={`Editar opciones de ${line.name}`}
                          onClick={() => onEdit?.(i)}
                        >
                          {line.name}
                          <Pencil
                            size={14}
                            className="shrink-0 text-blue"
                            aria-hidden="true"
                          />
                        </button>
                      ) : (
                        <p className="flex min-h-12 items-center text-sm font-bold text-brand">
                          {line.name}
                        </p>
                      )}
                      {!!line.modifierLabels?.length && (
                        <p className="-mt-1 mb-1 break-words text-xs leading-5 text-muted">
                          {line.modifierLabels.join(" · ")}
                        </p>
                      )}
                      {line.notes && (
                        <p className="mb-1 break-words text-xs leading-5 text-brand">
                          Nota: {line.notes}
                        </p>
                      )}
                    </div>
                    <div className="shrink-0 pt-3 text-right">
                      <strong className="block text-base tabular-nums text-brand">
                        {subtotal === null ? "Revisar precio" : money(subtotal)}
                      </strong>
                      {line.quantity > 1 && (
                        <span className="text-xs text-muted">
                          {money(unitPrice)} c/u
                        </span>
                      )}
                      {changed && (
                        <span className="block text-xs text-amber-800">
                          {unitPrice === null
                            ? "Completar precio"
                            : "Precio modificado"}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex shrink-0 items-center rounded-lg border border-line">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="min-h-12 min-w-12"
                        aria-label={`Disminuir ${line.name}`}
                        onClick={() =>
                          line.quantity === 1
                            ? remove(i)
                            : update(i, { quantity: line.quantity - 1 })
                        }
                      >
                        <Minus size={18} />
                      </Button>
                      <span className="min-w-7 text-center text-base font-bold tabular-nums">
                        {line.quantity}
                      </span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="min-h-12 min-w-12"
                        disabled={locked || line.quantity >= 999}
                        aria-label={`Aumentar ${line.name}`}
                        onClick={() =>
                          update(i, { quantity: line.quantity + 1 })
                        }
                      >
                        <Plus size={18} />
                      </Button>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="min-h-12 min-w-12 text-muted"
                        aria-label={`Editar observaciones de ${line.name}`}
                        onClick={() =>
                          setEditor({
                            index: i,
                            source: line,
                            draft: { ...line },
                            focus: "notes",
                          })
                        }
                      >
                        <MessageSquare size={18} />
                      </Button>
                      {allowPrice && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="min-h-12 min-w-12 text-muted"
                          aria-label={`Editar precio de ${line.name}`}
                          onClick={() =>
                            setEditor({
                              index: i,
                              source: line,
                              draft: { ...line },
                              focus: "price",
                            })
                          }
                        >
                          <Pencil size={18} />
                        </Button>
                      )}
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="min-h-12 min-w-12 text-muted"
                        aria-label={`Quitar ${line.name}`}
                        onClick={() => remove(i)}
                      >
                        <Trash2 size={18} />
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </fieldset>
      <div className="shrink-0 border-t border-line bg-surface/40 p-3 sm:p-4">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-sm font-bold text-brand">Total del pedido</span>
          <strong
            data-testid="cart-total"
            className="text-2xl font-extrabold tabular-nums text-brand"
          >
            {total === null ? "Revisar" : money(total)}
          </strong>
        </div>
        {children}
      </div>
      <Dialog
        open={!!editor}
        onOpenChange={(open) => {
          if (!open && !locked) setEditor(null);
        }}
      >
        <DialogContent showCloseButton={false} className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Editar {editor?.source.name}</DialogTitle>
            <DialogDescription>
              Modificá este renglón sin perder de vista el pedido. Los cambios
              se aplican al guardar.
            </DialogDescription>
          </DialogHeader>
          {editor && (
            <form
              className="space-y-4"
              onSubmit={(event) => {
                event.preventDefault();
                if (
                  locked ||
                  editorError ||
                  lines[editor.index] !== editor.source
                )
                  return;
                update(
                  editor.index,
                  allowPrice
                    ? {
                        price: editor.draft.price,
                        priceReason: editor.draft.priceReason,
                        notes: editor.draft.notes,
                      }
                    : { notes: editor.draft.notes },
                );
                setEditor(null);
              }}
            >
              <fieldset disabled={locked} className="space-y-4">
                {allowPrice && (
                  <>
                    <label className="grid gap-2 text-sm font-semibold text-brand">
                      <FieldCaption required>Precio unitario</FieldCaption>
                      <Input
                        required
                        autoFocus={editor.focus === "price"}
                        className="min-h-12"
                        aria-label={`Precio de ${editor.source.name}`}
                        inputMode="decimal"
                        value={editor.draft.price}
                        onChange={(e) =>
                          setEditor({
                            ...editor,
                            draft: { ...editor.draft, price: e.target.value },
                          })
                        }
                      />
                    </label>
                    <label className="grid gap-2 text-sm font-semibold text-brand">
                      <FieldCaption required={priceChanged}>
                        Motivo del cambio de precio
                      </FieldCaption>
                      <Input
                        required={priceChanged}
                        className="min-h-12"
                        maxLength={240}
                        value={editor.draft.priceReason}
                        placeholder="Obligatorio si cambiás el precio"
                        onChange={(e) =>
                          setEditor({
                            ...editor,
                            draft: {
                              ...editor.draft,
                              priceReason: e.target.value,
                            },
                          })
                        }
                      />
                    </label>
                  </>
                )}
                <label className="grid gap-2 text-sm font-semibold text-brand">
                  Observaciones
                  <Input
                    autoFocus={editor.focus === "notes"}
                    className="min-h-12"
                    aria-label={`Observaciones de ${editor.source.name}`}
                    value={editor.draft.notes}
                    maxLength={500}
                    placeholder="Sin hielo, para compartir…"
                    onChange={(e) =>
                      setEditor({
                        ...editor,
                        draft: { ...editor.draft, notes: e.target.value },
                      })
                    }
                  />
                </label>
              </fieldset>
              {editorError && (
                <OperationAlert
                  tone="error"
                  title="No pudimos completar la operación"
                  message={editorError}
                />
              )}
              <div className="flex justify-end gap-3">
                <Button
                  type="button"
                  variant="outline"
                  className="min-h-12"
                  disabled={locked}
                  onClick={() => setEditor(null)}
                >
                  Cancelar
                </Button>
                <Button
                  type="submit"
                  className="min-h-12"
                  disabled={
                    locked ||
                    !!editorError ||
                    lines[editor.index] !== editor.source
                  }
                >
                  Guardar cambios
                </Button>
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </section>
  );
}
