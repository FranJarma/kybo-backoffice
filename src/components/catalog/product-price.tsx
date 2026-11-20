import { money } from "@/lib/number-format";
import { Store } from "lucide-react";
import { PedidosyaIcon, UbereatsIcon } from "@/components/icons/delivery-icons";
import { Fragment } from "react";

export function ProductPrices({
  counter,
  pedidosya,
  ubereats,
  compact = false,
  deliveryOnly = false,
}: {
  counter: string | null;
  pedidosya: string | null;
  ubereats: string | null;
  compact?: boolean;
  deliveryOnly?: boolean;
}) {
  const channels = [
    { name: "Mostrador", icon: Store, color: "text-muted", price: counter },
    {
      name: "Pedidos Ya",
      icon: PedidosyaIcon,
      color: "text-red-500",
      price: pedidosya,
    },
    {
      name: "Uber Eats",
      icon: UbereatsIcon,
      color: "text-brand",
      price: ubereats,
    },
  ];
  const row = ({
    name,
    icon: Icon,
    color,
    price,
  }: (typeof channels)[number]) => (
    <Fragment key={name}>
      <dt className="flex items-center gap-2 whitespace-nowrap text-muted">
        <Icon size={16} aria-hidden="true" className={`shrink-0 ${color}`} />
        {name}:
      </dt>
      <dd
        className={`text-right whitespace-nowrap tabular-nums ${price === null ? "text-xs text-muted" : "font-medium text-brand"}`}
      >
        {price === null ? "Sin precio" : money(price)}
      </dd>
    </Fragment>
  );
  const grid =
    "grid grid-cols-[max-content_minmax(0,1fr)] items-center gap-x-4 gap-y-2 text-left text-sm";
  return (
    <div className="space-y-2">
      <dl className={grid}>
        {(deliveryOnly
          ? channels.slice(1)
          : compact
            ? channels.slice(0, 1)
            : channels
        ).map(row)}
      </dl>
      {compact && !deliveryOnly && (
        <details>
          <summary className="min-h-11 cursor-pointer content-center text-sm font-semibold text-blue">
            Otros canales
          </summary>
          <dl className={`${grid} pb-2`}>{channels.slice(1).map(row)}</dl>
        </details>
      )}
    </div>
  );
}
