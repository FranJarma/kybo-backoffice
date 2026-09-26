import type { Timing } from "./types";
type Clock = {
  status: string;
  enqueuedAt: string;
  startedAt: string | null;
  readyAt: string | null;
  deliveredAt: string | null;
};
const seconds = (end: number, start: number) =>
  Math.max(0, Math.round((end - start) / 1000));
export function orderTiming(tasks: Clock[]): Timing {
  const empty: Timing = {
    waitSeconds: null,
    prepSeconds: null,
    handoffSeconds: null,
    totalSeconds: null,
  };
  if (!tasks.length || tasks.some((t) => t.status === "cancelled"))
    return empty;
  const entered = Math.min(...tasks.map((t) => Date.parse(t.enqueuedAt)));
  const starts = tasks.flatMap((t) =>
    t.startedAt ? [Date.parse(t.startedAt)] : [],
  );
  if (!starts.length) return empty;
  const start = Math.min(...starts);
  const ready = tasks.every((t) => t.readyAt !== null)
    ? Math.max(...tasks.map((t) => Date.parse(t.readyAt!)))
    : null;
  const delivered = tasks.every((t) => t.deliveredAt !== null)
    ? Math.max(...tasks.map((t) => Date.parse(t.deliveredAt!)))
    : null;
  return {
    waitSeconds: seconds(start, entered),
    prepSeconds: ready === null ? null : seconds(ready, start),
    handoffSeconds:
      ready === null || delivered === null ? null : seconds(delivered, ready),
    totalSeconds: delivered === null ? null : seconds(delivered, entered),
  };
}
