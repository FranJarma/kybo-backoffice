import { Ban, CheckCircle2, Clock3 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { money } from "@/lib/number-format";
import { channelLabels, type SaleDetail } from "@/modules/sales/types";
import type { CashPaymentSummary } from "./payment-dialog";
import { saleConfirmationTitle } from "./sale-result";

export function SaleConfirmation({
  sale,
  cash,
  onNewSale,
}: {
  sale: SaleDetail;
  cash?: CashPaymentSummary;
  onNewSale?: () => void;
}) {
  const locator = sale.orders.at(-1)?.locatorNumber;
  const statusIcons = { open: Clock3, closed: CheckCircle2, cancelled: Ban };
  const Icon = statusIcons[sale.status];
  return (
    <section
      aria-label="Confirmación de venta"
      className="pos-confirmation"
      data-sale-status={sale.status}
    >
      <div role="status">
        <h2>
          <Icon size={19} aria-hidden="true" />
          {saleConfirmationTitle(sale)} · #{sale.number}
        </h2>
        <p>
          <strong>Total {money(sale.totalAmount)}</strong>
          {sale.status === "open" && <> · Saldo {money(sale.balanceDue)}</>}
          {locator != null && <> · Localizador {locator}</>}
        </p>
        {sale.status !== "cancelled" &&
          sale.payments
            .filter((payment) => payment.kind === "collection")
            .map((payment) => (
              <span className="pos-confirmation-method" key={payment.id}>
                {payment.collector === "platform"
                  ? channelLabels[sale.channel]
                  : (payment.methodName ?? "Otro medio")}{" "}
                {money(payment.amount)}
              </span>
            ))}
        {cash && sale.status !== "cancelled" && (
          <p>
            Recibido {money(cash.received)} · Vuelto{" "}
            <strong>{money(cash.change)}</strong>
          </p>
        )}
      </div>
      {onNewSale && (
        <Button type="button" variant="outline" onClick={onNewSale}>
          Nueva venta
        </Button>
      )}
    </section>
  );
}
