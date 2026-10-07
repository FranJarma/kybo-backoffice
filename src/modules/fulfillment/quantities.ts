import { AppError } from "@/lib/errors";
export type LineProgress = {
  mode: "recipe" | "direct";
  ordered: number;
  completed: number;
  delivered: number;
  cancelled: number;
};
const conflict = (): never => {
  throw new AppError(
    "FULFILLMENT_CONFLICT",
    "La cantidad supera lo pendiente del pedido.",
    409,
  );
};
export function completionPortion(
  remainingQuantity: bigint,
  completedUnits: number,
  remainingUnits: number,
): bigint {
  if (
    remainingQuantity < 0n ||
    !Number.isSafeInteger(completedUnits) ||
    !Number.isSafeInteger(remainingUnits) ||
    completedUnits <= 0 ||
    completedUnits > remainingUnits
  )
    conflict();
  return completedUnits === remainingUnits
    ? remainingQuantity
    : (remainingQuantity * BigInt(completedUnits)) / BigInt(remainingUnits);
}
export function transitionLine(
  line: LineProgress,
  action: "complete" | "deliver",
  quantity: number,
): { next: LineProgress; consume: number } {
  if (!Number.isSafeInteger(quantity) || quantity <= 0) conflict();
  const next = { ...line };
  if (action === "complete") {
    if (
      line.mode !== "recipe" ||
      quantity + line.completed + line.cancelled > line.ordered
    )
      conflict();
    next.completed += quantity;
    return { next, consume: quantity };
  }
  const ready =
    line.mode === "direct" ? line.ordered - line.cancelled : line.completed;
  if (quantity + line.delivered > ready) conflict();
  next.delivered += quantity;
  return { next, consume: line.mode === "direct" ? quantity : 0 };
}
export function cancellationDisposition(
  state: "pending" | "preparing" | "ready" | "delivered",
  ordered: number,
  completed: number,
) {
  if (
    !Number.isSafeInteger(ordered) ||
    !Number.isSafeInteger(completed) ||
    ordered < 0 ||
    completed < 0 ||
    completed > ordered
  )
    conflict();
  const remaining = ordered - completed;
  return {
    release: state === "pending" ? remaining : 0,
    pending: state === "preparing" ? remaining : 0,
  };
}
