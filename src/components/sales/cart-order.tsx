"use client";
import { OperationAlert } from "@/components/ui/operation-alert";
import { FieldCaption } from "@/components/ui/field-caption";
import { useState, type ReactNode } from "react";
import { ShoppingBag } from "lucide-react";
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
import { decimal } from "@/modules/inventory/decimal";
import { appendCartLine } from "./touch-selection";
import type { CartLine } from "./cart";
import { OrderLine } from "./order-line";

export function Cart({
  lines,
  onChange,
  locked,
  allowPrice,
  total,
  children,
  tools,
  fontClassName = "",
  onEdit,
}: {
  onEdit?: (index: number) => void;
  lines: CartLine[];
  onChange: (lines: CartLine[]) => void;
  locked: boolean;
  allowPrice: boolean;
  total: string | null;
  children: ReactNode;
  tools?: ReactNode;
  fontClassName?: string;
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
    <section className="pos-order-review" aria-label="Pedido actual">
      <header className="pos-order-header">
        <div>
          <h2>Pedido actual</h2>
          <p>{lines.reduce((units, line) => units + line.quantity, 0)} unid.</p>
        </div>
        <ShoppingBag size={24} aria-hidden="true" />
      </header>
      {tools}
      <fieldset
        disabled={locked}
        aria-label="Productos del pedido"
        className="pos-order-lines overflow-y-auto overscroll-contain"
        data-testid="cart-lines"
      >
        {removed && (
          <div className="pos-order-undo">
            <span role="status">{removed.name} eliminado</span>
            <Button
              type="button"
              variant="ghost"
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
        {!lines.length ? (
          <div className="px-6 py-6 text-center">
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
            {lines.map((line, index) => (
              <OrderLine
                key={`${line.productId}:${index}`}
                line={line}
                allowPrice={allowPrice}
                onQuantityChange={(quantity) => update(index, { quantity })}
                onRemove={() => remove(index)}
                onEditOptions={
                  onEdit &&
                  (line.configurable ||
                    !!line.modifiers?.length ||
                    !!line.comboChoices?.length)
                    ? () => onEdit(index)
                    : undefined
                }
                onEditDetails={(focus) =>
                  setEditor({ index, source: line, draft: { ...line }, focus })
                }
              />
            ))}
          </div>
        )}
      </fieldset>
      <footer className="pos-order-footer">
        <div className="pos-order-total">
          <span>Total del pedido</span>
          <strong data-testid="cart-total" className="tabular-nums">
            {total === null ? "Revisar" : money(total)}
          </strong>
        </div>
        <div className="pos-order-footer-actions">{children}</div>
      </footer>
      <Dialog
        open={!!editor}
        onOpenChange={(open) => {
          if (!open && !locked) setEditor(null);
        }}
      >
        <DialogContent
          showCloseButton={false}
          className={`pos-surface ${fontClassName} sm:max-w-lg`}
        >
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
                      <FieldCaption
                        required={priceChanged}
                        optional={!priceChanged}
                      >
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
                  <FieldCaption optional>Observaciones</FieldCaption>
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
