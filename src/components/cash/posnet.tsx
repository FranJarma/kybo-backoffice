"use client";
/* eslint-disable @next/next/no-img-element -- Private receipts require the current authenticated session. */
import { CreditCard, Plus, ReceiptText, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FieldCaption } from "@/components/ui/field-caption";
import { cents, integer } from "@/modules/inventory/decimal";
import { money } from "@/lib/number-format";
import type {
  CashMovement,
  CashPosnetClose,
  CashSession,
  CashTotals,
} from "@/modules/cash/types";
import {
  blankLot,
  previewMoney,
  type CloseDraft,
  type LotDraft,
} from "./draft";
import {
  CashNotice,
  MoneyField,
  MoneyRow,
  sessionTime,
  cashPhotoUrl,
} from "./shared";
import { CashPhotoPicker } from "./photo-picker";
import { CashCardPayments } from "./card-payments";

export function CashPosnetForm({
  draft,
  session,
  totals,
  movements,
  disabled,
  onChange,
  onError,
  onUploading,
}: {
  draft: CloseDraft;
  session: CashSession;
  totals: CashTotals;
  movements: CashMovement[];
  disabled: boolean;
  onChange: (draft: CloseDraft) => void;
  onError: (message: string) => void;
  onUploading: (busy: boolean) => void;
}) {
  const values = draft.lots.map((lot) => previewMoney(lot.total, true));
  const complete =
    values.every((value) => value !== null) &&
    draft.lots.every((lot) => /^\d+$/.test(lot.operations));
  const total = values.reduce<bigint>((sum, value) => sum + (value ?? 0n), 0n);
  const operations = draft.lots.reduce(
    (sum, lot) => sum + Number(lot.operations || 0),
    0,
  );
  const difference = total - integer(totals.cardTotal);
  const different =
    complete && (difference !== 0n || operations !== totals.cardOperations);
  const comparisonAvailable = draft.mode !== "pending" && complete;
  const comparisonState =
    draft.mode === "pending"
      ? "pending"
      : !complete
        ? "incomplete"
        : different
          ? "difference"
          : "matched";
  function patch(id: string, change: Partial<LotDraft>) {
    onChange({
      ...draft,
      lots: draft.lots.map((lot) =>
        lot.id === id ? { ...lot, ...change } : lot,
      ),
    });
  }
  if (
    totals.cardOperations === 0 &&
    integer(totals.cardTotal) === 0n &&
    !draft.recordUnexpectedLot
  )
    return (
      <div className="cash-empty">
        <CreditCard size={32} />
        <h3>No hay cobros con tarjeta en esta jornada</h3>
        <p>Podés continuar sin registrar un lote.</p>
        <Button
          type="button"
          variant="outline"
          disabled={disabled}
          onClick={() => onChange({ ...draft, recordUnexpectedLot: true })}
        >
          Registrar un lote del posnet
        </Button>
      </div>
    );
  return (
    <div className="cash-posnet-workspace">
      <section
        className="cash-posnet-totals"
        aria-label="Conciliación de tarjetas"
      >
        <div className="cash-posnet-metric">
          <span>Registrado en Kybo</span>
          <strong>{money(totals.cardTotal)}</strong>
          <small>
            {totals.cardOperations}{" "}
            {totals.cardOperations === 1 ? "operación" : "operaciones"} con
            tarjeta
          </small>
        </div>
        <div className="cash-posnet-metric">
          <span>Total de los lotes</span>
          <strong>{comparisonAvailable ? money(cents(total)) : "—"}</strong>
          <small>
            {draft.mode === "pending"
              ? "Cierre de lote pendiente"
              : comparisonAvailable
                ? `${operations} ${operations === 1 ? "operación" : "operaciones"} en el posnet`
                : "Ingresá el total y las operaciones"}
          </small>
        </div>
        <div className="cash-posnet-metric" data-state={comparisonState}>
          <span>Diferencia</span>
          <strong>
            {comparisonAvailable ? money(cents(difference)) : "—"}
          </strong>
          <small className="cash-posnet-state" role="status">
            {draft.mode === "pending"
              ? "Pendiente para el encargado"
              : !complete
                ? "Completá los datos del lote"
                : different
                  ? "Hay una diferencia"
                  : "Importes y operaciones coinciden"}
          </small>
        </div>
      </section>
      <div className="cash-posnet-grid">
        <section
          className="cash-posnet-entry cash-stack"
          aria-label="Datos del cierre del posnet"
        >
          {draft.mode === "registered" ? (
            <>
              {draft.lots.map((lot, index) => (
                <section
                  key={lot.id}
                  className="cash-lot"
                  aria-label={`Lote ${index + 1}`}
                >
                  <div className="cash-section-heading">
                    <h4>
                      <ReceiptText size={17} />
                      Datos del lote {index + 1}
                    </h4>
                    {draft.lots.length > 1 ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Quitar lote ${index + 1}`}
                        disabled={disabled}
                        onClick={() =>
                          onChange({
                            ...draft,
                            lots: draft.lots.filter((row) => row.id !== lot.id),
                          })
                        }
                      >
                        <X />
                      </Button>
                    ) : null}
                  </div>
                  <div className="cash-fields-grid">
                    <label className="cash-field">
                      <FieldCaption required>Número de lote</FieldCaption>
                      <Input
                        required
                        aria-label={`Número de lote ${index + 1}`}
                        value={lot.number}
                        maxLength={80}
                        disabled={disabled}
                        onChange={(event) =>
                          patch(lot.id, { number: event.target.value })
                        }
                      />
                    </label>
                    <label className="cash-field">
                      <FieldCaption required>
                        Fecha y hora del comprobante
                      </FieldCaption>
                      <Input
                        required
                        type="datetime-local"
                        aria-label={`Fecha y hora del lote ${index + 1}`}
                        value={lot.closedAt}
                        disabled={disabled}
                        onChange={(event) =>
                          patch(lot.id, { closedAt: event.target.value })
                        }
                      />
                      <small>Hora de la sucursal</small>
                    </label>
                    <MoneyField
                      label={`Total del lote ${index + 1}`}
                      required
                      hint="Total bruto, antes de comisiones."
                      value={lot.total}
                      disabled={disabled}
                      onChange={(total) => patch(lot.id, { total })}
                    />
                    <label className="cash-field">
                      <FieldCaption required>
                        Cantidad de operaciones
                      </FieldCaption>
                      <Input
                        required
                        inputMode="numeric"
                        aria-label={`Operaciones del lote ${index + 1}`}
                        value={lot.operations}
                        disabled={disabled}
                        onChange={(event) =>
                          patch(lot.id, { operations: event.target.value })
                        }
                      />
                    </label>
                  </div>
                  <CashPhotoPicker
                    branchId={session.branchId}
                    sessionId={session.id}
                    photo={lot.photo}
                    index={index}
                    disabled={disabled}
                    onChange={(photo) => patch(lot.id, { photo })}
                    onError={onError}
                    onUploading={onUploading}
                  />
                </section>
              ))}
              <Button
                type="button"
                variant="outline"
                className="cash-add-lot"
                disabled={disabled || draft.lots.length >= 20}
                onClick={() =>
                  onChange({
                    ...draft,
                    lots: [...draft.lots, blankLot(session.timeZone)],
                  })
                }
              >
                <Plus />
                Agregar otro lote de este equipo
              </Button>
              {different ? (
                <>
                  <CashNotice>
                    <b>Los datos del posnet no coinciden</b>
                    <p>
                      {money(cents(difference))} de diferencia · {operations}{" "}
                      operaciones en el equipo / {totals.cardOperations} en la
                      app.
                    </p>
                  </CashNotice>
                  <label className="cash-field">
                    <FieldCaption required>
                      Motivo de la diferencia del posnet
                    </FieldCaption>
                    <textarea
                      required
                      aria-label="Motivo de la diferencia del posnet"
                      value={draft.posnetReason}
                      maxLength={1000}
                      disabled={disabled}
                      onChange={(event) =>
                        onChange({ ...draft, posnetReason: event.target.value })
                      }
                    />
                  </label>
                </>
              ) : null}
              <Button
                type="button"
                variant="link"
                className="cash-exception"
                disabled={disabled}
                onClick={() => onChange({ ...draft, mode: "pending" })}
              >
                No pude registrar el cierre del posnet
              </Button>
            </>
          ) : (
            <>
              <CashNotice>
                <b>El posnet quedará pendiente</b>
                <p>
                  Podés cerrar la caja dejando un motivo. El encargado deberá
                  revisar el lote después.
                </p>
              </CashNotice>
              <label className="cash-field">
                <FieldCaption required>
                  Motivo del cierre de lote pendiente
                </FieldCaption>
                <textarea
                  required
                  aria-label="Motivo del cierre de lote pendiente"
                  value={draft.posnetReason}
                  disabled={disabled}
                  maxLength={1000}
                  onChange={(event) =>
                    onChange({ ...draft, posnetReason: event.target.value })
                  }
                />
              </label>
              <Button
                variant="link"
                type="button"
                disabled={disabled}
                onClick={() => onChange({ ...draft, mode: "registered" })}
              >
                Volver a registrar el comprobante
              </Button>
            </>
          )}
        </section>
        <aside
          className="cash-posnet-payments"
          aria-label="Comprobantes para comparar"
        >
          <CashCardPayments movements={movements} session={session} />
        </aside>
      </div>
    </div>
  );
}

export function CashPosnetSummary({
  posnet,
  timeZone,
  branchId,
  title = "Posnet",
}: {
  posnet: CashPosnetClose | null;
  timeZone: string;
  branchId: string;
  title?: string;
}) {
  if (!posnet) return null;
  return (
    <section className="cash-posnet-summary" aria-label="Resumen del posnet">
      <div className="cash-section-heading">
        <h3>
          <CreditCard size={19} />
          {title}
        </h3>
        <span
          className={`cash-badge ${posnet.needsReview ? "cash-badge-amber" : ""}`}
        >
          {posnet.mode === "none"
            ? "Sin movimientos"
            : posnet.mode === "pending"
              ? "Lote pendiente"
              : posnet.needsReview
                ? "Con diferencia"
                : "Coincide"}
        </span>
      </div>
      {posnet.mode !== "none" ? (
        <>
          <MoneyRow label="Registrado en la app" amount={posnet.expected} />
          <MoneyRow label="Total de los lotes" amount={posnet.total} />
          <MoneyRow label="Diferencia de tarjetas" amount={posnet.difference} />
          <p className="cash-muted">
            Operaciones del posnet / app: {posnet.operations ?? "—"} /{" "}
            {posnet.expectedOperations}
          </p>
          {posnet.lots.map((lot, index) => (
            <details className="cash-saved-lot" key={`${lot.number}-${index}`}>
              <summary>
                Lote {lot.number} · {money(lot.total)} · Ver comprobante
              </summary>
              <p>
                {sessionTime(lot.closedAt, timeZone)} · {lot.operations}{" "}
                operaciones
              </p>
              <img
                src={cashPhotoUrl(lot.photoId, branchId)}
                alt={`Comprobante del lote ${lot.number}`}
                loading="lazy"
              />
            </details>
          ))}
          {posnet.reason ? (
            <p className="cash-reason">{posnet.reason}</p>
          ) : null}
        </>
      ) : null}
    </section>
  );
}
