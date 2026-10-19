import { money } from "@/lib/number-format";
import { priceWithVat } from "@/modules/pricing/amounts";

export function ProductPrice({
  net,
  vatRate,
}: {
  net: string | null;
  vatRate: string | null;
}) {
  if (net === null) return <span>—</span>;
  const final = priceWithVat(net, vatRate);
  return (
    <dl className="inline-grid gap-x-3 gap-y-1 text-left text-sm whitespace-nowrap tabular-nums [grid-template-columns:auto_auto]">
      <dt className="text-xs text-muted">Sin IVA</dt>
      <dd className="text-right text-muted">{money(net)}</dd>
      <dt className="text-xs text-muted">Con IVA</dt>
      <dd
        className={`text-right font-semibold ${final === null ? "text-amber-700" : "text-brand"}`}
      >
        {final === null ? "IVA pendiente" : money(final)}
      </dd>
    </dl>
  );
}
