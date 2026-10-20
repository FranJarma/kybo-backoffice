import { money } from "@/lib/number-format";
import { Store } from "lucide-react";
import { PedidosyaIcon, UbereatsIcon } from "@/components/icons/delivery-icons";
import { Fragment } from "react";

export function ProductPrices({
  counter,
  pedidosya,
  ubereats,
}: {
  counter: string | null;
  pedidosya: string | null;
  ubereats: string | null;
}) {
  return (
    <dl className="grid grid-cols-[max-content_minmax(max-content,1fr)] items-center gap-x-4 gap-y-2 text-left text-sm">
      {[
        {
          name: "Mostrador",
          icon: Store,
          color: "text-slate-400",
          price: counter,
        },
        {
          name: "Pedidos Ya",
          icon: PedidosyaIcon,
          color: "text-red-400",
          price: pedidosya,
        },
        {
          name: "Uber Eats",
          icon: UbereatsIcon,
          color: "text-zinc-950",
          price: ubereats,
        },
      ].map(({ name, icon: Icon, color, price }) => (
        <Fragment key={name}>
          <dt className="flex items-center gap-2 whitespace-nowrap text-muted">
            <Icon
              size={16}
              aria-hidden="true"
              className={`shrink-0 ${color}`}
            />
            {name}:
          </dt>
          <dd
            className={`text-right whitespace-nowrap tabular-nums ${price === null ? "text-xs text-muted" : "font-medium text-brand"}`}
          >
            {price === null ? "Sin precio" : money(price)}
          </dd>
        </Fragment>
      ))}
    </dl>
  );
}
