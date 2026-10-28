import type {
  CashCommand,
  CashPosnetInput,
  CashSession,
  CashTotals,
} from "@/modules/cash/types";
import { cents, decimal, integer } from "@/modules/inventory/decimal";

export type LotDraft = {
  id: string;
  number: string;
  closedAt: string;
  operations: string;
  total: string;
  photo: { id: string; url: string } | null;
};
export type CloseDraft = {
  recordUnexpectedLot?: boolean;
  counted: string;
  withdrawal: string;
  reason: string;
  mode: "registered" | "pending";
  posnetReason: string;
  lots: LotDraft[];
};
export function parseMoney(value: string, signed = false): string {
  const text = value.trim();
  return signed && text.startsWith("-")
    ? `-${decimal(text.slice(1), 2)}`
    : decimal(text, 2)!;
}
export function previewMoney(value: string, signed = false): bigint | null {
  try {
    return integer(parseMoney(value, signed));
  } catch {
    return null;
  }
}
export function editableMoney(value: string | null) {
  return value?.replace(".", ",") ?? "";
}
export function zonedDateTime(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const p = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
}
function toInstant(value: string, timeZone: string) {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value))
    throw Error("Completá la fecha y hora de cada lote.");
  const target = Date.parse(`${value}:00Z`);
  let guess = target;
  for (let i = 0; i < 3; i++)
    guess +=
      target - Date.parse(`${zonedDateTime(new Date(guess), timeZone)}:00Z`);
  if (
    !Number.isFinite(guess) ||
    zonedDateTime(new Date(guess), timeZone) !== value
  )
    throw Error("Revisá la fecha y hora del lote.");
  return new Date(guess).toISOString();
}
export function blankLot(timeZone: string): LotDraft {
  return {
    id: crypto.randomUUID(),
    number: "",
    closedAt: zonedDateTime(new Date(), timeZone),
    operations: "",
    total: "",
    photo: null,
  };
}
export function newCloseDraft(timeZone: string): CloseDraft {
  return {
    counted: "",
    withdrawal: "0",
    reason: "",
    mode: "registered",
    posnetReason: "",
    lots: [blankLot(timeZone)],
  };
}
export function cashCloseValues(
  draft: CloseDraft,
  totals: CashTotals,
  canWithdraw: boolean,
) {
  const counted = parseMoney(draft.counted),
    withdrawal = parseMoney(draft.withdrawal || "0");
  if (integer(withdrawal) > integer(counted))
    throw Error("El retiro no puede superar el efectivo contado.");
  if (!canWithdraw && integer(withdrawal) > 0n)
    throw Error("No tenés permiso para incluir un retiro en el cierre.");
  const difference = integer(counted) - integer(totals.expectedCash);
  if (difference !== 0n && !draft.reason.trim())
    throw Error("Completá el motivo de la diferencia de efectivo.");
  return {
    counted,
    withdrawal,
    difference: cents(difference),
    fund: cents(integer(counted) - integer(withdrawal)),
  };
}
export function posnetValues(
  draft: CloseDraft,
  session: CashSession,
  totals: CashTotals,
): CashPosnetInput {
  if (
    totals.cardOperations === 0 &&
    integer(totals.cardTotal) === 0n &&
    !draft.recordUnexpectedLot
  )
    return { mode: "none", lots: [] };
  if (draft.mode === "pending") {
    if (!draft.posnetReason.trim())
      throw Error("Completá el motivo del cierre de posnet pendiente.");
    return { mode: "pending", reason: draft.posnetReason.trim(), lots: [] };
  }
  if (!draft.lots.length) throw Error("Agregá al menos un lote.");
  const lots = draft.lots.map((lot) => {
    if (!lot.photo) throw Error("Agregá la foto del comprobante de cada lote.");
    if (!lot.number.trim()) throw Error("Completá el número de cada lote.");
    if (
      !/^\d+$/.test(lot.operations) ||
      !Number.isSafeInteger(Number(lot.operations)) ||
      Number(lot.operations) < 1 ||
      Number(lot.operations) > 1_000_000
    )
      throw Error("Completá una cantidad válida de operaciones por lote.");
    return {
      number: lot.number.trim(),
      closedAt: toInstant(lot.closedAt, session.timeZone),
      operations: Number(lot.operations),
      total: parseMoney(lot.total, true),
      photoId: lot.photo.id,
    };
  });
  const total = lots.reduce((sum, lot) => sum + integer(lot.total), 0n);
  const operations = lots.reduce((sum, lot) => sum + lot.operations, 0);
  if (
    (total !== integer(totals.cardTotal) ||
      operations !== totals.cardOperations) &&
    !draft.posnetReason.trim()
  )
    throw Error("Completá el motivo de la diferencia del posnet.");
  return { mode: "registered", reason: draft.posnetReason.trim(), lots };
}
export function closingCommand(
  draft: CloseDraft,
  session: CashSession,
  totals: CashTotals,
  canWithdraw: boolean,
): { command?: Extract<CashCommand, { action: "close" }>; error?: string } {
  try {
    const { counted, withdrawal } = cashCloseValues(draft, totals, canWithdraw);
    return {
      command: {
        action: "close",
        sessionId: session.id,
        expectedRevision: session.revision,
        counted,
        withdrawal,
        reason: draft.reason.trim(),
        posnet: posnetValues(draft, session, totals),
      },
    };
  } catch (error) {
    return { error: (error as Error).message };
  }
}
