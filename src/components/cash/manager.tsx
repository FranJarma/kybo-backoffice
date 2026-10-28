"use client";
import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type FormEvent,
} from "react";
import Link from "next/link";
import {
  ArrowDownLeft,
  ArrowUpRight,
  Banknote,
  CreditCard,
  History,
  Landmark,
  LockKeyhole,
  Plus,
  RefreshCw,
  WalletCards,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FieldCaption } from "@/components/ui/field-caption";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { OperationAlert } from "@/components/ui/operation-alert";
import { money } from "@/lib/number-format";
import { cents, integer } from "@/modules/inventory/decimal";
import { expenseCategories } from "@/modules/overheads/types";
import type { CashCommand, CashSnapshot } from "@/modules/cash/types";
import {
  editableMoney,
  newCloseDraft,
  parseMoney,
  previewMoney,
  posnetValues,
  zonedDateTime,
  type CloseDraft,
} from "./draft";
import {
  CashNotice,
  MoneyField,
  MoneyRow,
  cashBranchRequest,
  sessionDate,
  sessionTime,
} from "./shared";
import { CashCloseDialog } from "./close-dialog";
import { CashPosnetSummary, CashPosnetForm } from "./posnet";
import { useOperation } from "@/components/inventory/shared";
import "./cash.css";

type FormAction = "open" | "expense" | "withdraw" | "review";
type ActionDraft = {
  amount: string;
  reason: string;
  recipient: string;
  concept: string;
  category: keyof typeof expenseCategories;
  source: "cash" | "external";
};
const emptyAction = (): ActionDraft => ({
  amount: "",
  reason: "",
  recipient: "",
  concept: "",
  category: "other",
  source: "cash",
});
const titles: Record<FormAction, string> = {
  open: "Abrir caja",
  expense: "Registrar gasto",
  withdraw: "Retirar efectivo",
  review: "Revisar cierre",
};

export function CashManager({
  branchId,
  actorId,
  openingOnly = false,
  onDismiss,
}: {
  branchId: string;
  actorId: string;
  openingOnly?: boolean;
  onDismiss?: () => void;
}) {
  const [snapshot, setSnapshot] = useState<CashSnapshot>();
  const [selectedId, setSelectedId] = useState<string | null>(null),
    [generation, setGeneration] = useState(0);
  const [view, setView] = useState<"day" | "history">("day"),
    [onlyPending, setOnlyPending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(""),
    [notice, setNotice] = useState({ text: "", key: 0 });
  const [action, setAction] = useState<FormAction | null>(
      openingOnly ? "open" : null,
    ),
    [actionDraft, setActionDraft] = useState<ActionDraft>(emptyAction);
  const [closeOpen, setCloseOpen] = useState(false),
    [closeStep, setCloseStep] = useState(0);
  const [closeDraft, setCloseDraft] = useState<CloseDraft | null>(null),
    [draftSession, setDraftSession] = useState<string | null>(null);
  const lastCommand = useRef<CashCommand | null>(null);
  const initialFundInput = useRef<HTMLInputElement>(null);
  const openingFocusPending = useRef(false);
  const openingHistoryId = useId();
  const focusOpeningFund = useCallback(() => {
    const input = initialFundInput.current;
    if (!openingFocusPending.current || !input || input.matches(":disabled"))
      return false;
    input.focus();
    input.select();
    openingFocusPending.current = false;
    return true;
  }, []);
  const [attachPosnet, setAttachPosnet] = useState(false);
  const [reviewDraft, setReviewDraft] = useState<CloseDraft | null>(null);
  const [reviewUploads, setReviewUploads] = useState(0);
  const operation = useOperation<{ requestId: string; command: CashCommand }>(
    actorId,
    "cash",
    (raw) => {
      const result = raw as CashSnapshot;
      setSnapshot(result);
      setAction(null);
      setCloseOpen(false);
      if (!result.current || result.current.id !== draftSession) {
        setCloseDraft(null);
        setDraftSession(null);
      } else setCloseStep(0);
      setSelectedId(null);
      setView("day");
      setError("");
      setNotice((previous) => ({
        text:
          lastCommand.current?.action === "close"
            ? "Caja cerrada. El conteo y los comprobantes quedaron guardados."
            : lastCommand.current?.action === "review"
              ? "La revisión quedó registrada sin cambiar el cierre."
              : "La operación quedó registrada.",
        key: previous.key + 1,
      }));
      lastCommand.current = null;
      window.dispatchEvent(
        new CustomEvent("kybo:cash-changed", { detail: { branchId } }),
      );
      if (openingOnly) onDismiss?.();
    },
    branchId,
  );
  const busy = operation.busy || reviewUploads > 0;
  useEffect(() => {
    if (action !== "open") {
      openingFocusPending.current = false;
      return;
    }
    focusOpeningFund();
  }, [action, loading, busy, operation.locked, focusOpeningFund]);
  useEffect(() => {
    const controller = new AbortController();
    void cashBranchRequest<CashSnapshot>(
      branchId,
      `/api/cash${selectedId ? `?sessionId=${encodeURIComponent(selectedId)}` : ""}`,
      { signal: controller.signal },
    )
      .then((data) => {
        if (!controller.signal.aborted) {
          setSnapshot(data);
          setError("");
          if (openingOnly) {
            setActionDraft({
              ...emptyAction(),
              amount: editableMoney(data.lastClosed?.fund ?? null),
            });
          }
        }
      })
      .catch((error) => {
        if (!controller.signal.aborted) setError((error as Error).message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [selectedId, generation, branchId, openingOnly]);
  function refresh() {
    setLoading(true);
    setError("");
    setGeneration((value) => value + 1);
  }
  function selectSession(id: string | null) {
    if (id === selectedId) return;
    setLoading(true);
    setError("");
    setSelectedId(id);
  }
  function run(command: CashCommand) {
    if (operation.locked || reviewUploads > 0) return;
    setError("");
    lastCommand.current = command;
    operation.submit("/api/cash", { requestId: crypto.randomUUID(), command });
  }
  useEffect(() => {
    if (!operation.error) return;
    const timer = setTimeout(() => {
      setError(operation.error);
      if (operation.status === 409) {
        setCloseStep(0);
        setError(
          "La caja cambió mientras trabajabas. Conservamos tu borrador; revisá el efectivo y los movimientos actualizados antes de confirmar.",
        );
        void cashBranchRequest<CashSnapshot>(
          branchId,
          `/api/cash${selectedId ? `?sessionId=${encodeURIComponent(selectedId)}` : ""}`,
        )
          .then((refreshed) => {
            setSnapshot(refreshed);
            const command = lastCommand.current;
            if (
              command?.action === "close" &&
              refreshed.current?.id !== command.sessionId
            ) {
              setCloseOpen(false);
              setError(
                "Otra persona ya cerró esta jornada. Revisá su cierre en Historial. Tu borrador sigue asociado a esa jornada y no se aplicará a otra caja.",
              );
            }
          })
          .catch(() => {
            /* Preserve the last snapshot and the complete draft. */
          });
      }
    }, 0);
    return () => clearTimeout(timer);
  }, [
    operation.error,
    operation.errorAttempt,
    operation.status,
    branchId,
    selectedId,
  ]);
  function startAction(next: FormAction) {
    if (operation.locked) return;
    setError("");
    setActionDraft({
      ...emptyAction(),
      amount:
        next === "open"
          ? editableMoney(snapshot?.lastClosed?.fund ?? null)
          : "",
    });
    setAction(next);
    if (next === "review") {
      setAttachPosnet(false);
      setReviewDraft(newCloseDraft(snapshot!.timeZone));
    }
  }
  function startClosing() {
    if (operation.locked) return;
    if (!snapshot?.current) return;
    if (!closeDraft || draftSession !== snapshot.current.id) {
      setCloseDraft(newCloseDraft(snapshot.timeZone));
      setDraftSession(snapshot.current.id);
      setCloseStep(0);
    }
    setError("");
    setCloseOpen(true);
  }
  useEffect(() => {
    if (openingOnly) return;
    const requestOpening = (event: Event) => {
      if (
        (event as CustomEvent<{ branchId: string }>).detail?.branchId ===
          branchId &&
        !snapshot?.current &&
        snapshot?.capabilities.open
      )
        startAction("open");
    };
    window.addEventListener("kybo:cash-open", requestOpening);
    return () => window.removeEventListener("kybo:cash-open", requestOpening);
  });
  function submitAction(event: FormEvent) {
    event.preventDefault();
    if (
      action === "open" &&
      (!snapshot?.available ||
        snapshot.current ||
        !snapshot.capabilities.open ||
        loading)
    )
      return;
    try {
      if (action === "review" && snapshot?.selected) {
        if (!actionDraft.reason.trim())
          throw Error("Completá una observación de la revisión.");
        const posnet =
          attachPosnet && reviewDraft
            ? posnetValues(
                { ...reviewDraft, recordUnexpectedLot: true },
                snapshot.selected,
                {
                  ...snapshot.totals,
                  cardTotal:
                    snapshot.selected.posnet?.expected ??
                    snapshot.totals.cardTotal,
                  cardOperations:
                    snapshot.selected.posnet?.expectedOperations ??
                    snapshot.totals.cardOperations,
                },
              )
            : undefined;
        if (posnet && posnet.mode !== "registered")
          throw Error(
            "Cargá el comprobante real o desmarcá la opción de agregarlo.",
          );
        void run({
          action,
          sessionId: snapshot.selected.id,
          note: actionDraft.reason.trim(),
          ...(posnet ? { posnet } : {}),
        });
        return;
      }
      const amount = parseMoney(actionDraft.amount);
      if (action !== "open" && integer(amount) === 0n)
        throw Error("El importe debe ser mayor que cero.");
      if (action === "open")
        void run({ action, amount, reason: actionDraft.reason.trim() });
      else if (action === "expense") {
        if (!actionDraft.concept.trim())
          throw Error("Completá el concepto del gasto.");
        void run({
          action,
          amount,
          concept: actionDraft.concept.trim(),
          category: actionDraft.category,
          source: actionDraft.source,
        });
      } else if (action === "withdraw") {
        if (!actionDraft.reason.trim() || !actionDraft.recipient.trim())
          throw Error("Completá el motivo y quién recibe el retiro.");
        void run({
          action,
          amount,
          reason: actionDraft.reason.trim(),
          recipient: actionDraft.recipient.trim(),
        });
      }
    } catch (error) {
      setError((error as Error).message);
    }
  }
  const session = snapshot?.selected,
    current = snapshot?.current;
  const selectedOpen = session?.state === "open",
    capabilities = snapshot?.capabilities;
  const visibleSessions =
    snapshot?.sessions.filter(
      (row) => !onlyPending || (row.reviewRequired && !row.reviewedAt),
    ) ?? [];
  const today = snapshot ? zonedDateTime(new Date(), snapshot.timeZone) : "";
  const reopeningToday =
    !!snapshot?.lastClosed &&
    snapshot.lastClosed.businessDate === today.slice(0, 10);
  const overdue =
    current &&
    (today.slice(0, 10) > current.businessDate ||
      (today.slice(0, 10) === current.businessDate &&
        today.slice(11) >= current.closeTime));
  const recovery = operation.uncertain ? (
    <CashNotice error>
      <p>
        Hay una operación cuyo resultado falta confirmar. Reintentá el mismo
        envío antes de registrar otra.
      </p>
      {operation.error ? <p>{operation.error}</p> : null}
      <Button
        type="button"
        variant="outline"
        disabled={busy}
        onClick={() => {
          lastCommand.current =
            operation.pending?.payload.command ?? lastCommand.current;
          operation.retry();
        }}
      >
        Reintentar la misma operación
      </Button>
    </CashNotice>
  ) : null;
  return (
    <div className={openingOnly ? "kybo-cash" : "kybo-cash cash-page"}>
      {!openingOnly ? (
        <>
          <OperationAlert
            message={notice.text}
            eventKey={notice.key}
            title="Caja"
          />
          <header className="cash-page-heading">
            <div>
              <p className="cash-eyebrow">
                NEGOCIO · {snapshot?.branchName ?? "CAJA DIARIA"}
              </p>
              <h1>Caja</h1>
              <p>Apertura, movimientos y cierre de la jornada.</p>
            </div>
            <Button
              type="button"
              variant="outline"
              aria-label="Actualizar caja"
              disabled={busy || loading || closeOpen}
              onClick={refresh}
            >
              <RefreshCw size={16} />
              <span>Actualizar</span>
            </Button>
          </header>
          {recovery}
          {error && !operation.uncertain && !action && !closeOpen ? (
            <CashNotice error>{error}</CashNotice>
          ) : null}
          {loading && !snapshot ? (
            <p role="status" className="cash-empty">
              Consultando la caja…
            </p>
          ) : !snapshot ? (
            <div className="cash-empty">
              <LockKeyhole />
              <h2>No pudimos consultar la caja</h2>
              <p>Revisá tu acceso a esta sucursal y volvé a intentar.</p>
              <Button variant="outline" onClick={refresh}>
                Volver a intentar
              </Button>
            </div>
          ) : !snapshot.available ? (
            <div className="cash-empty">
              <WalletCards size={32} />
              <h2>Caja todavía no está disponible</h2>
              <p>
                La sucursal necesita completar la actualización de Caja antes de
                registrar movimientos.
              </p>
            </div>
          ) : (
            <>
              <nav className="cash-tabs" aria-label="Vistas de caja">
                <button
                  type="button"
                  aria-current={view === "day" ? "page" : undefined}
                  disabled={busy}
                  onClick={() => {
                    setView("day");
                    selectSession(null);
                  }}
                >
                  <Banknote size={18} />
                  Jornada
                </button>
                <button
                  type="button"
                  aria-current={view === "history" ? "page" : undefined}
                  disabled={busy}
                  onClick={() => setView("history")}
                >
                  <History size={18} />
                  Historial
                  {snapshot.pendingReviews > 0 ? (
                    <span>{snapshot.pendingReviews}</span>
                  ) : null}
                </button>
              </nav>
              {view === "history" ? (
                <section className="cash-card cash-history">
                  <div className="cash-section-heading">
                    <div>
                      <h2>Historial de cajas</h2>
                      <p>
                        Los cierres conservan el conteo original y sus
                        comprobantes.
                      </p>
                    </div>
                    <label className="cash-check">
                      <input
                        type="checkbox"
                        checked={onlyPending}
                        onChange={(event) =>
                          setOnlyPending(event.target.checked)
                        }
                      />
                      Solo pendientes de revisión
                    </label>
                  </div>
                  <div className="cash-history-list">
                    {visibleSessions.length ? (
                      visibleSessions.map((row) => (
                        <button
                          type="button"
                          key={row.id}
                          className={
                            selectedId === row.id ? "cash-history-selected" : ""
                          }
                          disabled={busy}
                          onClick={() => selectSession(row.id)}
                        >
                          <span>
                            <b>{sessionDate(row)}</b>
                            <small>
                              {row.state === "open"
                                ? `Abierta por ${row.openedByName}`
                                : `Cerrada por ${row.closedByName}`}
                            </small>
                          </span>
                          <span>
                            <b>
                              {row.state === "open"
                                ? "Abierta"
                                : money(row.difference)}
                            </b>
                            <small>
                              {row.reviewedAt
                                ? "Revisada"
                                : row.reviewRequired
                                  ? "Revisión pendiente"
                                  : row.state === "closed"
                                    ? "Sin diferencias"
                                    : "En curso"}
                            </small>
                          </span>
                        </button>
                      ))
                    ) : (
                      <p className="cash-empty">
                        No hay jornadas en esta vista.
                      </p>
                    )}
                  </div>
                </section>
              ) : null}
              {view === "day" && !current ? (
                <section className="cash-opening-panel">
                  <div className="cash-opening-icon">
                    <Banknote size={30} />
                  </div>
                  <div>
                    <span className="cash-badge cash-badge-neutral">
                      Caja cerrada
                    </span>
                    <h2>Empezá una nueva jornada</h2>
                    <p>
                      Contá el fondo de cambio y confirmá cuánto efectivo hay
                      para abrir.
                    </p>
                    {snapshot.lastClosed ? (
                      <p className="cash-muted">
                        Último fondo dejado:{" "}
                        <b>{money(snapshot.lastClosed.fund)}</b>
                        {snapshot.lastClosed.reviewRequired &&
                        !snapshot.lastClosed.reviewedAt
                          ? " · Revisión pendiente del cierre anterior"
                          : ""}
                      </p>
                    ) : (
                      <p className="cash-muted">
                        La primera apertura activa el control de caja para los
                        cobros del local.
                      </p>
                    )}
                  </div>
                  {capabilities?.open ? (
                    <Button
                      className="cash-primary"
                      disabled={loading || operation.locked}
                      onClick={() => startAction("open")}
                    >
                      <Plus />
                      Abrir caja
                    </Button>
                  ) : (
                    <p className="cash-muted">
                      Una persona autorizada debe abrir la caja.
                    </p>
                  )}
                </section>
              ) : null}
              {view === "day" && overdue ? (
                <CashNotice>
                  <b>
                    La caja sigue abierta después del horario previsto de cierre
                  </b>
                  <p>
                    Conserva la jornada del{" "}
                    {current ? sessionDate(current) : ""}. Los nuevos
                    movimientos pertenecen a esta misma caja hasta que la
                    cierres.
                  </p>
                </CashNotice>
              ) : null}
              {session &&
              ((view === "day" && !!current) ||
                (view === "history" && !!selectedId) ||
                (view === "day" && !current)) ? (
                <>
                  <section className="cash-session-heading">
                    <div>
                      <span
                        className={`cash-badge ${selectedOpen ? "" : session.reviewRequired && !session.reviewedAt ? "cash-badge-amber" : "cash-badge-neutral"}`}
                      >
                        {selectedOpen
                          ? "Caja abierta"
                          : session.reviewedAt
                            ? "Cerrada · revisada"
                            : session.reviewRequired
                              ? "Cerrada · revisión pendiente"
                              : "Caja cerrada"}
                      </span>
                      <h2>Jornada del {sessionDate(session)}</h2>
                      <p>
                        {selectedOpen
                          ? `Abierta por ${session.openedByName} · ${sessionTime(session.openedAt, snapshot.timeZone)}`
                          : `Cerrada por ${session.closedByName} · ${sessionTime(session.closedAt!, snapshot.timeZone)}`}{" "}
                        · Cierre previsto {session.closeTime}
                      </p>
                    </div>
                    {selectedOpen && view === "day" ? (
                      <div className="cash-session-actions">
                        {capabilities?.expense ? (
                          <Button
                            variant="outline"
                            disabled={loading || operation.locked}
                            onClick={() => startAction("expense")}
                          >
                            <Plus />
                            Registrar gasto
                          </Button>
                        ) : null}
                        {capabilities?.withdraw ? (
                          <Button
                            variant="outline"
                            disabled={loading || operation.locked}
                            onClick={() => startAction("withdraw")}
                          >
                            <ArrowUpRight />
                            Retirar efectivo
                          </Button>
                        ) : null}
                        {capabilities?.close ? (
                          <Button
                            className="cash-primary"
                            disabled={loading || operation.locked}
                            onClick={startClosing}
                          >
                            <LockKeyhole />
                            {draftSession === current?.id
                              ? "Continuar cierre"
                              : "Cerrar caja"}
                          </Button>
                        ) : null}
                      </div>
                    ) : null}
                  </section>
                  <div className="cash-dashboard">
                    <div className="cash-main-column">
                      {selectedOpen ? (
                        <section className="cash-balance">
                          <p className="cash-eyebrow">
                            EFECTIVO ESPERADO EN EL CAJÓN
                          </p>
                          <strong>{money(snapshot.totals.expectedCash)}</strong>
                          <p>
                            Fondo inicial + cobros − devoluciones y salidas de
                            efectivo.
                          </p>
                          <div className="cash-balance-breakdown">
                            <span>
                              Fondo inicial
                              <b>{money(snapshot.totals.opening)}</b>
                            </span>
                            <span>
                              Cobros del día
                              <b>{money(snapshot.totals.cashCollections)}</b>
                            </span>
                            <span>
                              Salidas del día
                              <b>
                                {money(
                                  cents(
                                    integer(snapshot.totals.cashRefunds) +
                                      integer(snapshot.totals.expenses) +
                                      integer(
                                        snapshot.totals.supplierPayments,
                                      ) +
                                      integer(snapshot.totals.withdrawals),
                                  ),
                                )}
                              </b>
                            </span>
                          </div>
                        </section>
                      ) : (
                        <section className="cash-card cash-closed-summary">
                          <div className="cash-section-heading">
                            <h2>Arqueo confirmado</h2>
                            <LockKeyhole size={20} />
                          </div>
                          <MoneyRow
                            label="Esperado antes del retiro de cierre"
                            amount={session.expectedClosing}
                          />
                          <MoneyRow
                            label="Contado antes del retiro"
                            amount={session.counted}
                          />
                          <MoneyRow
                            label="Retiro al cerrar"
                            amount={session.withdrawal}
                          />
                          <MoneyRow
                            label="Fondo dejado"
                            amount={session.fund}
                            strong
                          />
                          <MoneyRow
                            label="Diferencia de efectivo"
                            amount={session.difference}
                            strong
                          />
                          {session.reason ? (
                            <p className="cash-reason">{session.reason}</p>
                          ) : null}
                          {session.reviewedAt ? (
                            <CashNotice>
                              Revisada por {session.reviewedByName} ·{" "}
                              {sessionTime(
                                session.reviewedAt,
                                snapshot.timeZone,
                              )}
                              <p>{session.reviewNote}</p>
                            </CashNotice>
                          ) : session.reviewRequired && capabilities?.review ? (
                            <Button
                              variant="outline"
                              disabled={loading || operation.locked}
                              onClick={() => startAction("review")}
                            >
                              Registrar revisión
                            </Button>
                          ) : null}
                        </section>
                      )}
                      <section className="cash-card cash-ledger">
                        <div className="cash-section-heading">
                          <div>
                            <h2>Movimientos de la jornada</h2>
                            <p>
                              Cada cobro y salida se registra desde su operación
                              de origen.
                            </p>
                          </div>
                          <span className="cash-count">
                            {snapshot.movements.length}
                          </span>
                        </div>
                        <div className="cash-movement-list">
                          {snapshot.movements.length ? (
                            snapshot.movements.map((movement) => (
                              <div key={movement.id} className="cash-movement">
                                <span
                                  className={`cash-movement-icon ${integer(movement.amount) < 0n ? "cash-outgoing" : ""}`}
                                >
                                  {integer(movement.amount) < 0n ? (
                                    <ArrowUpRight size={17} />
                                  ) : (
                                    <ArrowDownLeft size={17} />
                                  )}
                                </span>
                                <div className="cash-movement-description">
                                  <b>{movement.concept}</b>
                                  <small>
                                    {movement.methodName} · {movement.actorName}{" "}
                                    ·{" "}
                                    {sessionTime(
                                      movement.createdAt,
                                      snapshot.timeZone,
                                    )}
                                  </small>
                                  {movement.reference ? (
                                    <small>{movement.reference}</small>
                                  ) : null}
                                </div>
                                <strong
                                  className={
                                    integer(movement.amount) < 0n
                                      ? "cash-negative"
                                      : ""
                                  }
                                >
                                  {money(movement.amount)}
                                </strong>
                              </div>
                            ))
                          ) : (
                            <p className="cash-empty">
                              Todavía no hay movimientos en esta jornada.
                            </p>
                          )}
                        </div>
                      </section>
                    </div>
                    <aside className="cash-side-column">
                      <section className="cash-card cash-other-methods">
                        <p className="cash-eyebrow">OTROS MEDIOS DE COBRO</p>
                        <h2>Fuera del cajón</h2>
                        <div className="cash-other-row">
                          <CreditCard size={20} />
                          <span>
                            Tarjetas
                            <small>
                              {snapshot.totals.cardOperations} operaciones
                            </small>
                          </span>
                          <b>{money(snapshot.totals.cardTotal)}</b>
                        </div>
                        <div className="cash-other-row">
                          <Landmark size={20} />
                          <span>Transferencias</span>
                          <b>{money(snapshot.totals.transferTotal)}</b>
                        </div>
                        <div className="cash-other-row">
                          <WalletCards size={20} />
                          <span>Otros medios</span>
                          <b>{money(snapshot.totals.otherTotal)}</b>
                        </div>
                        <p>
                          Estos cobros no aumentan el efectivo físico de la
                          caja.
                        </p>
                      </section>
                      {!selectedOpen ? (
                        <div className="cash-card">
                          <CashPosnetSummary
                            branchId={branchId}
                            posnet={session.posnet}
                            title={
                              session.posnetReview
                                ? "Posnet al cerrar"
                                : "Posnet"
                            }
                            timeZone={snapshot.timeZone}
                          />
                          {session.posnetReview ? (
                            <>
                              <h3>Comprobante agregado durante la revisión</h3>
                              <CashPosnetSummary
                                branchId={session.branchId}
                                timeZone={session.timeZone}
                                posnet={session.posnetReview}
                              />
                            </>
                          ) : null}
                        </div>
                      ) : null}
                      {capabilities?.supplier && view === "day" ? (
                        <section className="cash-card cash-help">
                          <h3>Pagos a proveedores</h3>
                          <p>
                            Registrá el pago o anticipo en Compras. Si sale de
                            esta caja, aparecerá aquí una sola vez.
                          </p>
                          <Link href="/inventory/purchases">
                            Ir a Compras →
                          </Link>
                        </section>
                      ) : null}
                    </aside>
                  </div>
                </>
              ) : null}
            </>
          )}
        </>
      ) : null}
      <Dialog
        open={action !== null}
        onOpenChange={(value) => {
          if (!value && !busy) {
            setAction(null);
            setError("");
            if (openingOnly) onDismiss?.();
          }
        }}
      >
        <DialogContent
          showCloseButton={false}
          onOpenAutoFocus={(event) => {
            if (action !== "open") return;
            openingFocusPending.current = true;
            if (focusOpeningFund()) event.preventDefault();
          }}
          className={`kybo-cash cash-action-dialog ${attachPosnet && action === "review" ? "cash-review-dialog" : ""}`}
        >
          <div className="cash-section-heading">
            <DialogTitle>{action ? titles[action] : "Caja"}</DialogTitle>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label="Cerrar formulario"
              disabled={busy}
              onClick={() => {
                setAction(null);
                setError("");
                if (openingOnly) onDismiss?.();
              }}
            >
              <X />
            </Button>
          </div>
          <DialogDescription>
            {action === "open"
              ? "Confirmá el efectivo real que hay para comenzar."
              : action === "expense"
                ? "El gasto se incorpora al resumen mensual sin volver a cargarlo."
                : action === "review"
                  ? "La observación se agrega al cierre original y no mueve dinero."
                  : "El retiro disminuye el efectivo de la caja y conserva su destino."}
          </DialogDescription>
          <form onSubmit={submitAction} className="cash-stack">
            {recovery}
            {openingOnly && loading ? (
              <p role="status">Consultando el fondo de la caja…</p>
            ) : null}
            {openingOnly &&
            !loading &&
            (!snapshot?.available ||
              snapshot.current ||
              !snapshot.capabilities.open ||
              error) &&
            !operation.uncertain ? (
              <CashNotice error>
                {error ||
                  (snapshot?.current
                    ? "La caja ya está abierta. Podés consultar su jornada desde Caja."
                    : !snapshot?.available
                      ? "No se pudo consultar la caja. Cerrá el formulario y volvé a intentar."
                      : "Ya no tenés permiso para abrir esta caja.")}
              </CashNotice>
            ) : null}
            <fieldset
              className="cash-stack"
              disabled={
                operation.locked ||
                reviewUploads > 0 ||
                (openingOnly &&
                  (loading ||
                    !snapshot?.available ||
                    !!snapshot.current ||
                    !snapshot.capabilities.open))
              }
            >
              {error && !operation.uncertain && !openingOnly ? (
                <CashNotice error>{error}</CashNotice>
              ) : null}
              {action !== "review" ? (
                <MoneyField
                  required
                  inputRef={action === "open" ? initialFundInput : undefined}
                  descriptionId={
                    action === "open" ? openingHistoryId : undefined
                  }
                  label={
                    action === "open" ? "Fondo inicial contado" : "Importe"
                  }
                  value={actionDraft.amount}
                  disabled={busy}
                  onChange={(amount) =>
                    setActionDraft((draft) => ({ ...draft, amount }))
                  }
                />
              ) : null}
              {action === "open" ? (
                <p
                  id={openingHistoryId}
                  className="cash-muted"
                  data-cash-opening-history
                >
                  {loading ? (
                    "Consultando el último cierre…"
                  ) : !snapshot ? (
                    "No se pudo consultar el último cierre."
                  ) : snapshot?.lastClosed ? (
                    <>
                      Fondo dejado en el último cierre:{" "}
                      <strong>{money(snapshot.lastClosed.fund)}</strong>.
                    </>
                  ) : (
                    "No hay cierres anteriores en esta sucursal."
                  )}
                </p>
              ) : null}
              {action === "open" && snapshot?.lastClosed ? (
                <>
                  {reopeningToday ||
                  (previewMoney(actionDraft.amount) !== null &&
                    previewMoney(actionDraft.amount) !==
                      integer(snapshot.lastClosed.fund ?? "0.00")) ? (
                    <label className="cash-field">
                      <FieldCaption required>
                        {reopeningToday
                          ? "Motivo de nueva apertura"
                          : "Motivo de la diferencia de apertura"}
                      </FieldCaption>
                      <textarea
                        aria-label={
                          reopeningToday
                            ? "Motivo de nueva apertura"
                            : "Motivo de la diferencia de apertura"
                        }
                        value={actionDraft.reason}
                        required
                        maxLength={1000}
                        disabled={busy}
                        onChange={(event) =>
                          setActionDraft((draft) => ({
                            ...draft,
                            reason: event.target.value,
                          }))
                        }
                      />
                    </label>
                  ) : null}
                </>
              ) : null}
              {action === "expense" ? (
                <>
                  <label className="cash-field">
                    <FieldCaption required>Concepto del gasto</FieldCaption>
                    <Input
                      value={actionDraft.concept}
                      required
                      maxLength={200}
                      disabled={busy}
                      onChange={(event) =>
                        setActionDraft((draft) => ({
                          ...draft,
                          concept: event.target.value,
                        }))
                      }
                    />
                  </label>
                  <label className="cash-field">
                    <FieldCaption required>Categoría</FieldCaption>
                    <select
                      required
                      value={actionDraft.category}
                      disabled={busy}
                      onChange={(event) =>
                        setActionDraft((draft) => ({
                          ...draft,
                          category: event.target
                            .value as ActionDraft["category"],
                        }))
                      }
                    >
                      {Object.entries(expenseCategories).map(([id, label]) => (
                        <option value={id} key={id}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </label>
                  {capabilities?.externalExpense ? (
                    <fieldset className="cash-source">
                      <legend>
                        <FieldCaption required>Origen del dinero</FieldCaption>
                      </legend>
                      <label>
                        <input
                          type="radio"
                          name="expense-source"
                          required
                          value="cash"
                          checked={actionDraft.source === "cash"}
                          disabled={busy}
                          onChange={() =>
                            setActionDraft((draft) => ({
                              ...draft,
                              source: "cash",
                            }))
                          }
                        />
                        Efectivo de esta caja
                      </label>
                      <label>
                        <input
                          type="radio"
                          name="expense-source"
                          value="external"
                          checked={actionDraft.source === "external"}
                          disabled={busy}
                          onChange={() =>
                            setActionDraft((draft) => ({
                              ...draft,
                              source: "external",
                            }))
                          }
                        />
                        Pagado fuera de caja
                      </label>
                    </fieldset>
                  ) : (
                    <p className="cash-muted">
                      Se descontará del efectivo de esta caja.
                    </p>
                  )}
                </>
              ) : null}
              {action === "withdraw" ? (
                <label className="cash-field">
                  <FieldCaption required>Quién recibe / destino</FieldCaption>
                  <Input
                    value={actionDraft.recipient}
                    required
                    maxLength={160}
                    disabled={busy}
                    onChange={(event) =>
                      setActionDraft((draft) => ({
                        ...draft,
                        recipient: event.target.value,
                      }))
                    }
                  />
                </label>
              ) : null}
              {action === "review" && snapshot?.selected ? (
                <>
                  <label className="cash-switch">
                    <input
                      type="checkbox"
                      checked={attachPosnet}
                      aria-label="Agregar comprobante del posnet"
                      onChange={(event) =>
                        setAttachPosnet(event.target.checked)
                      }
                    />
                    <span>Agregar comprobante del posnet</span>
                  </label>
                  {attachPosnet && reviewDraft ? (
                    <CashPosnetForm
                      draft={{ ...reviewDraft, recordUnexpectedLot: true }}
                      session={snapshot.selected}
                      movements={snapshot.movements}
                      totals={{
                        ...snapshot.totals,
                        cardTotal:
                          snapshot.selected.posnet?.expected ??
                          snapshot.totals.cardTotal,
                        cardOperations:
                          snapshot.selected.posnet?.expectedOperations ??
                          snapshot.totals.cardOperations,
                      }}
                      disabled={busy || operation.uncertain}
                      onChange={setReviewDraft}
                      onError={setError}
                      onUploading={(uploading) =>
                        setReviewUploads((value) =>
                          Math.max(0, value + (uploading ? 1 : -1)),
                        )
                      }
                    />
                  ) : null}
                </>
              ) : null}
              {action === "withdraw" || action === "review" ? (
                <label className="cash-field">
                  <FieldCaption required>
                    {action === "review"
                      ? "Observación de la revisión"
                      : "Motivo del retiro"}
                  </FieldCaption>
                  <textarea
                    aria-label={
                      action === "review"
                        ? "Observación de la revisión"
                        : "Motivo del retiro"
                    }
                    value={actionDraft.reason}
                    required
                    maxLength={1000}
                    disabled={busy}
                    onChange={(event) =>
                      setActionDraft((draft) => ({
                        ...draft,
                        reason: event.target.value,
                      }))
                    }
                  />
                </label>
              ) : null}
              <div className="cash-form-footer">
                <Button
                  type="button"
                  variant="outline"
                  disabled={busy}
                  onClick={() => {
                    setAction(null);
                    setError("");
                    if (openingOnly) onDismiss?.();
                  }}
                >
                  Cancelar
                </Button>
                <Button className="cash-primary" type="submit" disabled={busy}>
                  {busy ? "Guardando…" : action ? titles[action] : "Confirmar"}
                </Button>
              </div>
            </fieldset>
          </form>
        </DialogContent>
      </Dialog>
      {snapshot && closeDraft ? (
        <CashCloseDialog
          open={closeOpen}
          snapshot={snapshot}
          sessionId={draftSession!}
          draft={closeDraft}
          onChange={setCloseDraft}
          step={closeStep}
          onStep={setCloseStep}
          busy={busy}
          uncertain={operation.uncertain}
          recovery={recovery}
          error={operation.uncertain ? "" : error}
          onError={setError}
          onDismiss={() => {
            setCloseOpen(false);
            setError("");
          }}
          onConfirm={(command) => void run(command)}
        />
      ) : null}
    </div>
  );
}
