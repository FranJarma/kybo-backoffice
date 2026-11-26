import { MessageSquare, Minus, Pencil, Plus, Trash2 } from "lucide-react";
import { money } from "@/components/inventory/shared";
import { Button } from "@/components/ui/button";
import { cents, decimal, integer } from "@/modules/inventory/decimal";
import type { CartLine } from "./cart";

export function OrderLine({
  line,
  allowPrice,
  onQuantityChange,
  onRemove,
  onEditOptions,
  onEditDetails,
}: {
  line: CartLine;
  allowPrice: boolean;
  onQuantityChange: (quantity: number) => void;
  onRemove: () => void;
  onEditOptions?: () => void;
  onEditDetails: (field: "price" | "notes") => void;
}) {
  let unitPrice: string | null = null;
  let subtotal: string | null = null;
  try {
    unitPrice = decimal(line.price, 2);
    subtotal = cents(integer(unitPrice!) * BigInt(line.quantity));
  } catch {
    // A partially edited price can remain in an older draft.
  }
  const changed = unitPrice === null || unitPrice !== line.expectedPrice;

  return (
    <div data-testid="cart-line" className="pos-order-line">
      <div className="flex items-start justify-between gap-2.5">
        <div className="min-w-0 flex-1">
          {onEditOptions ? (
            <button
              type="button"
              className="pos-order-line-name pos-order-line-edit"
              aria-label={`Editar opciones de ${line.name}`}
              onClick={onEditOptions}
            >
              <span>{line.name}</span>
              <Pencil size={14} className="shrink-0" aria-hidden="true" />
            </button>
          ) : (
            <p className="pos-order-line-name">{line.name}</p>
          )}
          {!!line.modifierLabels?.length && (
            <p className="pos-order-line-description text-muted">
              {line.modifierLabels.join(" · ")}
            </p>
          )}
          {line.notes && (
            <p className="pos-order-line-description">Nota: {line.notes}</p>
          )}
        </div>
        <div className="shrink-0 text-right tabular-nums">
          <strong className="block text-base leading-tight">
            {subtotal === null ? "Revisar precio" : money(subtotal)}
          </strong>
          {line.quantity > 1 && (
            <span className="block text-xs text-muted">
              {money(unitPrice)} c/u
            </span>
          )}
          {changed && (
            <span className="block text-xs text-amber-800">
              {unitPrice === null ? "Completar precio" : "Precio modificado"}
            </span>
          )}
        </div>
      </div>
      <div className="pos-order-line-controls">
        <div className="pos-order-line-quantity">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={`Disminuir ${line.name}`}
            onClick={() => {
              if (line.quantity === 1) onRemove();
              else onQuantityChange(line.quantity - 1);
            }}
          >
            <Minus size={18} />
          </Button>
          <span className="min-w-5 text-center text-base font-bold tabular-nums">
            {line.quantity}
          </span>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            disabled={line.quantity >= 999}
            aria-label={`Aumentar ${line.name}`}
            onClick={() => onQuantityChange(line.quantity + 1)}
          >
            <Plus size={18} />
          </Button>
        </div>
        <div className="flex shrink-0 items-center text-muted">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={`Editar observaciones de ${line.name}`}
            onClick={() => onEditDetails("notes")}
          >
            <MessageSquare size={18} />
          </Button>
          {allowPrice && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label={`Editar precio de ${line.name}`}
              onClick={() => onEditDetails("price")}
            >
              <Pencil size={18} />
            </Button>
          )}
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={`Quitar ${line.name}`}
            onClick={onRemove}
          >
            <Trash2 size={18} />
          </Button>
        </div>
      </div>
    </div>
  );
}
