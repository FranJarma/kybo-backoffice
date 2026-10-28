import { money } from "@/lib/number-format";
import type { CashMovement, CashSession } from "@/modules/cash/types";
import { sessionTime } from "./shared";

export function CashCardPayments({
  movements,
  session,
}: {
  movements: CashMovement[];
  session: Pick<CashSession, "id" | "branchId" | "timeZone">;
}) {
  const payments = movements
    .filter(
      (row) =>
        row.sessionId === session.id &&
        row.branchId === session.branchId &&
        row.methodKind === "card" &&
        (row.kind === "collection" || row.kind === "refund"),
    )
    .sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
  const refunds = payments.filter((row) => row.kind === "refund").length;
  const collections = payments.length - refunds;
  return (
    <section className="cash-card-payments">
      <h4>Comprobantes de la jornada</h4>
      <p>
        {collections} {collections === 1 ? "cobro" : "cobros"}
        {refunds > 0
          ? ` · ${refunds} ${refunds === 1 ? "devolución" : "devoluciones"}`
          : ""}
      </p>
      <div
        className="cash-card-payments-scroll"
        role="region"
        aria-label="Cobros con tarjeta de esta jornada"
        tabIndex={payments.length ? 0 : undefined}
      >
        {payments.length ? (
          <ul>
            {payments.map((row) => (
              <li key={row.id}>
                <div className="cash-card-payment-heading">
                  <b>{row.concept}</b>
                  <strong>{money(row.amount)}</strong>
                </div>
                <p className="cash-card-payment-meta">
                  {row.methodName} ·{" "}
                  <time dateTime={row.createdAt}>
                    {sessionTime(row.createdAt, session.timeZone)}
                  </time>
                </p>
                {row.reference?.trim() ? (
                  <p className="cash-card-payment-receipt">
                    <span>
                      {row.kind === "refund"
                        ? "Comprobante original"
                        : "Comprobante"}{" "}
                      Nº
                    </span>
                    <b>{row.reference}</b>
                  </p>
                ) : (
                  <p className="cash-card-payment-missing">
                    Sin comprobante registrado
                  </p>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="cash-card-payments-empty">
            No hay comprobantes de tarjeta registrados en esta jornada.
          </p>
        )}
      </div>
      <small>
        Compará cada número con el detalle del posnet. Las devoluciones restan
        del total y muestran el comprobante original del cobro.
      </small>
    </section>
  );
}
