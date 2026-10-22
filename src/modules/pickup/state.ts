export type PickupState = "preparing" | "ready" | "delivered" | "cancelled";
type Progress = {
  mode: string;
  ordered: number;
  completed: number;
  delivered: number;
  cancelled: number;
};

/** Inputs include every operational line (combo children, never combo headers). */
export function pickupState(
  saleStatus: string,
  lines: (Progress | null)[],
  tasks: string[],
): PickupState {
  if (saleStatus === "cancelled") return "cancelled";
  if (!lines.length || lines.some((line) => !line)) return "preparing";
  const progress = lines as Progress[];
  if (progress.every((l) => l.cancelled === l.ordered)) return "cancelled";
  if (progress.every((l) => l.delivered + l.cancelled === l.ordered))
    return "delivered";
  const recipes = progress.filter(
    (l) => l.mode === "recipe" && l.cancelled < l.ordered,
  );
  if (
    recipes.length &&
    (!tasks.length ||
      tasks.some((s) => !["ready", "delivered", "cancelled"].includes(s)))
  )
    return "preparing";
  if (recipes.some((l) => l.completed + l.cancelled < l.ordered))
    return "preparing";
  return "ready";
}
