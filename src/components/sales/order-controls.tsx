"use client";
import type { ReactNode } from "react";
import Link from "next/link";
import { Armchair, Bike, ShoppingBag, Store, Utensils } from "lucide-react";
import { Input } from "@/components/ui/input";
import type { SaleChannel, SaleOrigin, TableView } from "@/modules/sales/types";
import { Control, selectClass } from "./shared";

export function OrderControls({
  origin,
  fulfillment,
  locked,
  originLocked,
  onOriginChange,
  onFulfillmentChange,
  actions,
  details,
}: {
  origin: SaleOrigin;
  fulfillment: string;
  locked: boolean;
  originLocked: boolean;
  onOriginChange: (origin: SaleOrigin) => void;
  onFulfillmentChange: (value: string) => void;
  actions: ReactNode;
  details?: ReactNode;
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
    `flex min-h-12 min-w-0 flex-1 items-center justify-center gap-2 rounded-lg border px-2.5 py-2 text-xs font-semibold outline-none transition-colors focus-visible:ring-2 focus-visible:ring-blue/30 sm:text-sm ${selected ? "border-[var(--accent)] bg-[var(--accent)] text-brand" : "border-line bg-white text-brand hover:border-orange-200 hover:bg-orange-50/40"} disabled:cursor-default`;
  return (
    <section
      data-pos-order-setup
      className="grid min-w-0 gap-x-4 gap-y-2 rounded-xl border border-line bg-white p-3 @min-[560px]:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] @min-[900px]:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)_minmax(0,1.5fr)]"
    >
      <fieldset className="pos-order-setup-choices min-w-0">
        <legend className="mb-1 text-xs font-semibold text-muted">
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
                className={`size-[18px] shrink-0 ${origin === value ? "text-brand" : "text-muted"}`}
                aria-hidden="true"
              />
              {label}
            </button>
          ))}
        </div>
      </fieldset>
      <fieldset className="pos-order-setup-choices min-w-0">
        <legend className="mb-1 text-xs font-semibold text-muted">
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
                className={`size-[18px] shrink-0 ${fulfillment === value ? "text-brand" : "text-muted"}`}
                aria-hidden="true"
              />
              {label}
            </button>
          ))}
        </div>
      </fieldset>
      <fieldset className="pos-order-setup-actions min-w-0 @min-[560px]:col-span-2 @min-[900px]:col-span-1">
        <legend className="mb-1 text-xs font-semibold text-muted @min-[900px]:sr-only">
          Acciones
        </legend>
        <div className="pos-order-setup-action-grid grid min-w-0 items-start gap-3 @min-[360px]:grid-cols-[minmax(0,1fr)_minmax(160px,0.7fr)] @min-[900px]:grid-cols-[minmax(0,1fr)_minmax(145px,0.85fr)]">
          {actions}
        </div>
      </fieldset>
      {details}
    </section>
  );
}

export function OrderFulfillmentFields({
  origin,
  fulfillment,
  channel,
  externalId,
  tableId,
  tables,
  selectedTable,
  locked,
  originLocked,
  onChannelChange,
  onExternalIdChange,
  onTableChange,
  onOpenAccount,
}: {
  origin: SaleOrigin;
  fulfillment: string;
  channel: SaleChannel;
  externalId: string;
  tableId: string;
  tables: TableView[];
  selectedTable?: TableView;
  locked: boolean;
  originLocked: boolean;
  onChannelChange: (channel: SaleChannel) => void;
  onExternalIdChange: (externalId: string) => void;
  onTableChange: (tableId: string) => void;
  onOpenAccount: (saleId: string) => void;
}) {
  if (origin === "counter" && fulfillment !== "dine_in") return null;

  const requiresTable = origin === "table";
  const accountId = requiresTable ? selectedTable?.saleId : null;
  return (
    <div className="col-span-full grid gap-x-3 gap-y-2 border-t border-line pt-2 sm:grid-cols-2">
      {origin === "delivery" ? (
        <>
          <Control label="Plataforma" required>
            <select
              required
              value={channel}
              disabled={locked || originLocked}
              className={selectClass}
              onChange={(event) =>
                onChannelChange(event.target.value as SaleChannel)
              }
            >
              <option value="pedidosya">PedidosYa</option>
              <option value="ubereats">Uber Eats</option>
            </select>
          </Control>
          <Control label="Número del pedido externo" required>
            <Input
              required
              value={externalId}
              disabled={locked}
              maxLength={80}
              placeholder="Ej. 2280061098"
              onChange={(event) => onExternalIdChange(event.target.value)}
            />
          </Control>
        </>
      ) : (
        <Control
          label={requiresTable ? "Mesa" : "Mesa de consumo"}
          required={requiresTable}
          optional={!requiresTable}
        >
          <select
            required={requiresTable}
            className={selectClass}
            disabled={locked || (requiresTable && originLocked)}
            value={tableId}
            onChange={(event) => onTableChange(event.target.value)}
          >
            <option value="">
              {requiresTable ? "Seleccionar mesa" : "Sin mesa asociada"}
            </option>
            {tables.map((table) => (
              <option key={table.id} value={table.id}>
                {table.name}
                {requiresTable && table.saleId ? " · Cuenta abierta" : ""}
              </option>
            ))}
          </select>
        </Control>
      )}
      {accountId && (
        <p className="text-sm text-amber-800 sm:col-span-2">
          Esta mesa ya tiene una cuenta.{" "}
          <Link
            className="font-bold underline"
            href={`/sales?account=${accountId}`}
            onClick={(event) => {
              if (
                event.metaKey ||
                event.ctrlKey ||
                event.shiftKey ||
                event.altKey
              )
                return;

              event.preventDefault();
              onOpenAccount(accountId);
            }}
          >
            Abrir venta #{selectedTable?.saleNumber}
          </Link>
        </p>
      )}
    </div>
  );
}
