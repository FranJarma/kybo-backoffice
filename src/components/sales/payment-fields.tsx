import { useId } from "react";
import { ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { money } from "@/lib/number-format";
import { cashChange, paymentAmountCents } from "./payment-math";
import { Control } from "./shared";

export const paymentReferenceLimit = 120;

export function transferReference(holder: string, reference: string) {
  const name = holder.trim();
  const operation = reference.trim();
  if (!name) return operation;
  return operation
    ? `Titular: ${name} · Operación: ${operation}`
    : `Titular: ${name}`;
}

export function CashPaymentFields({
  amount,
  position,
  split,
  received,
  reference,
  onReceived,
  onReference,
}: {
  amount: string;
  position: number;
  split: boolean;
  received: string;
  reference: string;
  onReceived: (value: string) => void;
  onReference: (value: string) => void;
}) {
  const messageId = useId();
  const change = cashChange(received, amount);
  const validAmount = paymentAmountCents(amount) !== null;
  let error = "";
  if (received.trim()) {
    if (paymentAmountCents(received) === null)
      error = "Ingresá un importe válido en efectivo.";
    else if (validAmount && !change.valid)
      error = "El efectivo recibido no cubre el cobro.";
  }

  return (
    <div className="pos-payment-fields pos-payment-cash">
      <Control
        label={split ? `Efectivo recibido ${position}` : "Efectivo recibido"}
        required
      >
        <span className="pos-payment-currency-field">
          <span aria-hidden="true">$</span>
          <Input
            aria-label={`Efectivo recibido ${position}`}
            aria-describedby={error ? messageId : undefined}
            aria-invalid={!!error}
            required
            className="pos-payment-received"
            inputMode="decimal"
            placeholder="0,00"
            value={received}
            onChange={(event) => onReceived(event.target.value)}
          />
        </span>
      </Control>
      {error && (
        <p id={messageId} className="pos-payment-field-error">
          {error}
        </p>
      )}
      <div className="pos-payment-shortcuts">
        <Button
          type="button"
          variant="outline"
          aria-label="Importe exacto"
          disabled={!validAmount}
          onClick={() => onReceived(amount)}
        >
          Exacto
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => onReceived("20000")}
        >
          $ 20.000
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => onReceived("50000")}
        >
          $ 50.000
        </Button>
      </div>
      <div className="pos-payment-cash-result">
        <p className="pos-payment-change" aria-live="polite">
          Vuelto:
          <strong>{change.change === null ? "—" : money(change.change)}</strong>
        </p>
        <OptionalPaymentReference
          position={position}
          reference={reference}
          onReference={onReference}
        />
      </div>
    </div>
  );
}

export function TransferPaymentFields({
  holder,
  reference,
  referenceTooLong,
  verified,
  onHolder,
  onReference,
  onVerified,
}: {
  holder: string;
  reference: string;
  referenceTooLong: boolean;
  verified: boolean;
  onHolder: (value: string) => void;
  onReference: (value: string) => void;
  onVerified: (value: boolean) => void;
}) {
  const referenceErrorId = useId();
  return (
    <div className="pos-payment-fields">
      <Control label="Titular de la transferencia" optional>
        <Input
          value={holder}
          maxLength={paymentReferenceLimit}
          autoComplete="off"
          aria-invalid={referenceTooLong}
          aria-describedby={referenceTooLong ? referenceErrorId : undefined}
          onChange={(event) => onHolder(event.target.value)}
        />
      </Control>
      <Control label="Número de operación o referencia" optional>
        <Input
          value={reference}
          maxLength={paymentReferenceLimit}
          autoComplete="off"
          aria-invalid={referenceTooLong}
          aria-describedby={referenceTooLong ? referenceErrorId : undefined}
          onChange={(event) => onReference(event.target.value)}
        />
      </Control>
      {referenceTooLong && (
        <p id={referenceErrorId} className="pos-payment-field-error">
          El titular y la operación admiten hasta 120 caracteres en total.
        </p>
      )}
      <label className="pos-payment-verification">
        <input
          type="checkbox"
          required
          checked={verified}
          onChange={(event) => onVerified(event.target.checked)}
        />
        Acreditación verificada
      </label>
    </div>
  );
}

export function CardPaymentField({
  label,
  reference,
  onReference,
  focus,
}: {
  label: string;
  reference: string;
  onReference: (value: string) => void;
  focus: boolean;
}) {
  const helpId = useId();
  return (
    <div className="pos-payment-fields">
      <Control label={label} required>
        <Input
          autoFocus={focus}
          autoComplete="off"
          required
          aria-describedby={helpId}
          aria-invalid={reference.length > 0 && !reference.trim()}
          value={reference}
          maxLength={paymentReferenceLimit}
          placeholder="Ej. 000123"
          onChange={(event) => onReference(event.target.value)}
        />
      </Control>
      <p id={helpId} className="pos-payment-help">
        Copiá el número del ticket del posnet.
      </p>
    </div>
  );
}

export function OptionalPaymentReference({
  position,
  reference,
  onReference,
}: {
  position: number;
  reference: string;
  onReference: (value: string) => void;
}) {
  return (
    <details className="pos-payment-reference">
      <summary>
        <ChevronRight size={16} aria-hidden="true" />
        Referencia (opcional)
      </summary>
      <Control label={`Referencia ${position}`} optional>
        <Input
          value={reference}
          maxLength={paymentReferenceLimit}
          placeholder="Número de operación o comprobante"
          onChange={(event) => onReference(event.target.value)}
        />
      </Control>
    </details>
  );
}
