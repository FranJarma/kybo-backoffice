"use client";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { ArrowLeft, ArrowRight, Check, LockKeyhole, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FieldCaption } from "@/components/ui/field-caption";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { cents, integer } from "@/modules/inventory/decimal";
import { money } from "@/lib/number-format";
import type { CashCommand, CashSnapshot } from "@/modules/cash/types";
import {
  cashCloseValues,
  closingCommand,
  posnetValues,
  previewMoney,
  type CloseDraft,
} from "./draft";
import { CashNotice, MoneyField, MoneyRow, sessionDate } from "./shared";
import { CashPosnetForm } from "./posnet";

export function CashCloseDialog({
  open,
  snapshot,
  sessionId,
  draft,
  onChange,
  step,
  onStep,
  busy,
  uncertain = false,
  recovery,
  error,
  onError,
  onDismiss,
  onConfirm,
}: {
  open: boolean;
  snapshot: CashSnapshot;
  sessionId: string;
  draft: CloseDraft;
  onChange: (draft: CloseDraft) => void;
  step: number;
  onStep: (step: number) => void;
  busy: boolean;
  uncertain?: boolean;
  recovery?: ReactNode;
  error: string;
  onError: (message: string) => void;
  onDismiss: () => void;
  onConfirm: (command: CashCommand) => void;
}) {
  const [uploads, setUploads] = useState(0);
  const heading = useRef<HTMLHeadingElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const countedInput = useRef<HTMLInputElement>(null);
  const focusStep = useCallback(() => {
    const input = countedInput.current;
    const target =
      step === 0 && input && !input.matches(":disabled")
        ? input
        : heading.current;
    if (!target) return false;
    if (document.activeElement !== target) {
      target.focus({ preventScroll: true });
      if (target === input) input.select();
    }
    return document.activeElement === target;
  }, [step]);
  useEffect(() => {
    if (open) {
      content.current?.scrollTo({ top: 0 });
      focusStep();
    }
  }, [open, focusStep]);
  useEffect(() => {
    if (open && error) content.current?.scrollTo({ top: 0 });
  }, [open, error]);
  const session = snapshot.current;
  if (!session || session.id !== sessionId) return null;
  const totals = snapshot.totals,
    counted = previewMoney(draft.counted),
    withdrawal = previewMoney(draft.withdrawal || "0");
  const difference =
    counted === null ? null : counted - integer(totals.expectedCash);
  const fund =
    counted === null || withdrawal === null ? null : counted - withdrawal;
  const locked = busy || uploads > 0 || uncertain;
  function advance() {
    try {
      if (step === 0)
        cashCloseValues(draft, totals, snapshot.capabilities.withdraw);
      if (step === 1) posnetValues(draft, session!, totals);
      onError("");
      onStep(step + 1);
    } catch (error) {
      onError((error as Error).message);
    }
  }
  function confirm() {
    const result = closingCommand(
      draft,
      session!,
      totals,
      snapshot.capabilities.withdraw,
    );
    if (result.error) onError(result.error);
    else if (result.command) onConfirm(result.command);
  }
  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        if (!value && !busy && uploads === 0) onDismiss();
      }}
    >
      <DialogContent
        showCloseButton={false}
        onOpenAutoFocus={(event) => {
          if (focusStep()) event.preventDefault();
        }}
        className="kybo-cash cash-close-dialog"
      >
        <div className="cash-close-header">
          <div>
            <DialogTitle>Cerrar caja</DialogTitle>
            <DialogDescription>
              {snapshot.branchName} · Jornada del {sessionDate(session)}
            </DialogDescription>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Guardar borrador y salir del cierre"
            disabled={busy || uploads > 0}
            onClick={onDismiss}
          >
            <X />
          </Button>
        </div>
        <ol className="cash-steps" aria-label="Pasos del cierre">
          {["Efectivo", "Posnet", "Revisar"].map((label, index) => (
            <li
              key={label}
              className={
                step === index
                  ? "cash-step-current"
                  : step > index
                    ? "cash-step-done"
                    : ""
              }
              aria-current={step === index ? "step" : undefined}
            >
              <span>{step > index ? <Check size={15} /> : index + 1}</span>
              {label}
            </li>
          ))}
        </ol>
        {error ? <CashNotice error>{error}</CashNotice> : null}
        {recovery}
        <div ref={content} className="cash-close-body">
          <h2 ref={heading} tabIndex={-1} className="cash-step-heading">
            {
              [
                "Contá el efectivo de la caja",
                "Registrá el cierre de tarjetas",
                "Revisá antes de confirmar",
              ][step]
            }
          </h2>
          {step === 0 ? (
            <div className="cash-close-grid">
              <div className="cash-stack">
                <section
                  className="cash-count-comparison"
                  aria-label="Control de efectivo"
                >
                  <div
                    className="cash-system-amount"
                    role="group"
                    aria-label="Efectivo esperado según el sistema"
                  >
                    <div>
                      <p>Efectivo esperado</p>
                      <small>Según el sistema</small>
                    </div>
                    <strong>{money(totals.expectedCash)}</strong>
                  </div>
                  <div className="cash-counted-amount">
                    <MoneyField
                      label="Efectivo contado"
                      required
                      inputRef={countedInput}
                      value={draft.counted}
                      onChange={(counted) => onChange({ ...draft, counted })}
                      disabled={locked}
                    />
                  </div>
                </section>
                <p className="cash-muted">
                  Contá todo lo que hay en el cajón antes de hacer un nuevo
                  retiro de cierre.
                </p>
                <div
                  className={`cash-difference ${difference !== null && difference !== 0n ? "cash-difference-amber" : ""}`}
                >
                  <span>Diferencia de efectivo</span>
                  <b>{difference === null ? "—" : money(cents(difference))}</b>
                </div>
                {difference !== null && difference !== 0n ? (
                  <label className="cash-field">
                    <FieldCaption required>
                      Motivo de la diferencia de efectivo
                    </FieldCaption>
                    <textarea
                      required
                      aria-label="Motivo de la diferencia de efectivo"
                      maxLength={1000}
                      value={draft.reason}
                      onChange={(event) =>
                        onChange({ ...draft, reason: event.target.value })
                      }
                      disabled={locked}
                    />
                  </label>
                ) : null}
                {snapshot.capabilities.withdraw ? (
                  <MoneyField
                    label="Nuevo retiro al cerrar"
                    optional
                    value={draft.withdrawal}
                    disabled={locked}
                    hint="Si ya registraste un retiro durante el día, no lo cargues de nuevo."
                    onChange={(value) =>
                      onChange({ ...draft, withdrawal: value })
                    }
                  />
                ) : (
                  <p className="cash-muted">
                    El cierre dejará todo el efectivo contado como fondo. Los
                    retiros los realiza el encargado.
                  </p>
                )}
                {session.targetFund !== null ? (
                  <div className="cash-target">
                    <span>Fondo objetivo: {money(session.targetFund)}</span>
                    {snapshot.capabilities.withdraw &&
                    counted !== null &&
                    counted > integer(session.targetFund) ? (
                      <Button
                        variant="link"
                        type="button"
                        disabled={locked}
                        onClick={() =>
                          onChange({
                            ...draft,
                            withdrawal: cents(
                              counted - integer(session.targetFund!),
                            ).replace(".", ","),
                          })
                        }
                      >
                        Sugerir excedente
                      </Button>
                    ) : null}
                  </div>
                ) : null}
                <MoneyRow
                  label="Fondo que quedará en la caja"
                  amount={fund === null ? null : cents(fund)}
                  strong
                />
              </div>
              <aside className="cash-close-reference">
                <p className="cash-eyebrow">MOVIMIENTOS DE LA JORNADA</p>
                <h3>Cómo se calcula el efectivo</h3>
                <MoneyRow label="Fondo inicial" amount={totals.opening} />
                <MoneyRow
                  label="Cobros en efectivo"
                  amount={totals.cashCollections}
                />
                <MoneyRow label="Devoluciones" amount={totals.cashRefunds} />
                <MoneyRow label="Gastos" amount={totals.expenses} />
                <MoneyRow
                  label="Pagos a proveedores"
                  amount={totals.supplierPayments}
                />
                <MoneyRow
                  label="Retiros ya registrados"
                  amount={totals.withdrawals}
                />
                <small>
                  Los cobros con tarjeta y transferencia se controlan por
                  separado.
                </small>
              </aside>
            </div>
          ) : null}
          {step === 1 ? (
            <CashPosnetForm
              draft={draft}
              session={session}
              totals={totals}
              movements={snapshot.movements}
              disabled={locked}
              onChange={onChange}
              onError={onError}
              onUploading={(value) =>
                setUploads((current) => current + (value ? 1 : -1))
              }
            />
          ) : null}
          {step === 2 ? (
            <div className="cash-close-grid">
              <div className="cash-review-card">
                <p className="cash-eyebrow">EFECTIVO</p>
                <MoneyRow
                  label="Esperado antes del retiro"
                  amount={totals.expectedCash}
                />
                <MoneyRow
                  label="Contado antes del retiro"
                  amount={counted === null ? null : cents(counted)}
                />
                <MoneyRow
                  label="Diferencia de arqueo"
                  amount={difference === null ? null : cents(difference)}
                  strong
                />
                <MoneyRow
                  label="Nuevo retiro de cierre"
                  amount={withdrawal === null ? null : cents(withdrawal)}
                />
                <MoneyRow
                  label="Fondo que queda"
                  amount={fund === null ? null : cents(fund)}
                  strong
                />
                {draft.reason ? (
                  <p className="cash-reason">{draft.reason}</p>
                ) : null}
              </div>
              <div className="cash-review-card">
                <p className="cash-eyebrow">POSNET</p>
                <MoneyRow
                  label="Tarjetas en la app"
                  amount={totals.cardTotal}
                />
                <p>
                  {totals.cardOperations === 0 && totals.cardTotal === "0.00"
                    ? "Sin movimientos de tarjeta"
                    : draft.mode === "pending"
                      ? "Lote pendiente de revisión"
                      : `${draft.lots.length} lote${draft.lots.length === 1 ? "" : "s"} con comprobante privado`}
                </p>
                {draft.mode === "registered" && totals.cardOperations > 0
                  ? draft.lots.map((lot) => (
                      <MoneyRow
                        key={lot.id}
                        label={`Lote ${lot.number} · ${lot.operations} ${Number(lot.operations) === 1 ? "operación" : "operaciones"}`}
                        amount={cents(previewMoney(lot.total, true) ?? 0n)}
                      />
                    ))
                  : null}
                {draft.posnetReason ? (
                  <p className="cash-reason">{draft.posnetReason}</p>
                ) : null}
              </div>
              <CashNotice>
                El cierre conserva este conteo y los comprobantes. Las
                diferencias quedan para revisión del encargado y permiten abrir
                la próxima jornada.
              </CashNotice>
            </div>
          ) : null}
        </div>
        <footer className="cash-close-footer">
          <Button
            variant="outline"
            type="button"
            disabled={locked}
            onClick={() => {
              if (step === 0) onDismiss();
              else {
                onError("");
                onStep(step - 1);
              }
            }}
          >
            <ArrowLeft />
            {step === 0 ? "Guardar y salir" : "Atrás"}
          </Button>
          <span className="cash-close-footer-note">
            {uploads > 0
              ? "Guardando foto…"
              : "El borrador se conserva al volver atrás."}
          </span>
          {step < 2 ? (
            <Button
              type="button"
              className="cash-primary"
              disabled={locked}
              onClick={advance}
            >
              Continuar
              <ArrowRight />
            </Button>
          ) : (
            <Button
              type="button"
              className="cash-primary"
              disabled={locked || !snapshot.capabilities.close}
              onClick={confirm}
            >
              <LockKeyhole />
              {busy ? "Confirmando…" : "Confirmar cierre"}
            </Button>
          )}
        </footer>
      </DialogContent>
    </Dialog>
  );
}
