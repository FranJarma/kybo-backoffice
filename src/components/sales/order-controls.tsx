"use client";
import type { ReactNode } from "react";
import { Armchair, Bike, ShoppingBag, Store, Utensils } from "lucide-react";
import type { SaleOrigin } from "@/modules/sales/types";

export function OrderControls({
  origin,
  fulfillment,
  locked,
  originLocked,
  onOriginChange,
  onFulfillmentChange,
  actions,
}: {
  origin: SaleOrigin;
  fulfillment: string;
  locked: boolean;
  originLocked: boolean;
  onOriginChange: (origin: SaleOrigin) => void;
  onFulfillmentChange: (value: string) => void;
  actions: ReactNode;
}) {
  const forms =
    origin === "delivery"
      ? [
          { value: "delivery", label: "Envío", icon: Bike },
          { value: "pickup", label: "Retiro en el local", icon: ShoppingBag },
        ]
      : origin === "table"
        ? [{ value: "dine_in", label: "En el local", icon: Utensils }]
        : [
            { value: "takeaway", label: "Para llevar", icon: ShoppingBag },
            { value: "dine_in", label: "En el local", icon: Utensils },
          ];
  const choice = (selected: boolean) =>
    `flex min-h-12 min-w-0 flex-1 items-center justify-center gap-2 rounded-lg border px-2.5 py-2 text-xs font-semibold outline-none transition-colors focus-visible:ring-2 focus-visible:ring-blue/30 sm:text-sm ${selected ? "border-orange-400 bg-orange-50 text-brand" : "border-line bg-white text-brand hover:border-orange-200 hover:bg-orange-50/40"} disabled:cursor-default`;
  return (
    <section
      data-pos-order-setup
      className="grid min-w-0 gap-x-4 gap-y-3 rounded-xl border border-line bg-white p-3 min-[560px]:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]"
    >
      <fieldset className="min-w-0">
        <legend className="mb-2 text-xs font-semibold text-muted">
          Lugar de consumo
        </legend>
        <div className="flex gap-2">
          {(
            [
              { value: "counter", label: "Mostrador", icon: Store },
              { value: "table", label: "Mesa", icon: Armchair },
              { value: "delivery", label: "Delivery", icon: Bike },
            ] as const
          ).map(({ value, label, icon: Icon }) => (
            <button
              type="button"
              key={value}
              aria-pressed={origin === value}
              disabled={locked || originLocked}
              className={choice(origin === value)}
              onClick={() => onOriginChange(value)}
            >
              <Icon
                className={`size-[18px] shrink-0 ${origin === value ? "text-orange-600" : "text-muted"}`}
                aria-hidden="true"
              />
              {label}
            </button>
          ))}
        </div>
      </fieldset>
      <fieldset className="min-w-0">
        <legend className="mb-2 text-xs font-semibold text-muted">
          Forma de consumo
        </legend>
        <div className="flex gap-2">
          {forms.map(({ value, label, icon: Icon }) => (
            <button
              type="button"
              key={value}
              aria-pressed={fulfillment === value}
              disabled={locked || origin === "table"}
              className={choice(fulfillment === value)}
              onClick={() => onFulfillmentChange(value)}
            >
              <Icon
                className={`size-[18px] shrink-0 ${fulfillment === value ? "text-orange-600" : "text-muted"}`}
                aria-hidden="true"
              />
              {label}
            </button>
          ))}
        </div>
      </fieldset>
      <fieldset className="min-w-0 border-t border-line pt-3 min-[560px]:col-span-2">
        <legend className="px-1 text-xs font-semibold text-muted">
          Acciones
        </legend>
        <div className="grid min-w-0 items-start gap-3 min-[440px]:grid-cols-[minmax(0,1fr)_minmax(170px,0.7fr)]">
          {actions}
        </div>
      </fieldset>
    </section>
  );
}
