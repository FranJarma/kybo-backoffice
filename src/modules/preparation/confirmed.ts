import type { PrepList, PrepTask, PrepStatus } from "./types";

/** Patch only a committed task; a background refresh still owns queue freshness. */
export function confirmedPreparation(
  data: PrepList,
  task: PrepTask,
  active: boolean,
): PrepList {
  const previous = data.rows.find((row) => row.id === task.id);
  if (!previous || previous.revision >= task.revision) return data;
  const remove =
    active && (task.status === "delivered" || task.status === "cancelled");
  const counts = { ...data.counts };
  counts[previous.status] = Math.max(0, counts[previous.status] - 1);
  if (!remove) counts[task.status]++;
  const rank: Record<PrepStatus, number> = {
    pending: 0,
    preparing: 1,
    ready: 2,
    delivered: 3,
    cancelled: 4,
  };
  const known = new Map<string, PrepStatus>();
  for (const row of data.rows.filter((row) => row.orderId === task.orderId)) {
    for (const sibling of row.siblings)
      if (
        !known.has(sibling.id) ||
        rank[sibling.status] > rank[known.get(sibling.id)!]
      )
        known.set(sibling.id, sibling.status);
  }
  const siblings = task.siblings.map((sibling) => {
    const status = known.get(sibling.id);
    return status && rank[status] > rank[sibling.status]
      ? { ...sibling, status }
      : sibling;
  });
  return {
    ...data,
    counts,
    total: remove ? Math.max(0, data.total - 1) : data.total,
    rows: data.rows.flatMap((row) =>
      row.id === task.id
        ? remove
          ? []
          : [{ ...task, siblings }]
        : [
            {
              ...row,
              ...(row.orderId === task.orderId
                ? { siblings, orderTiming: task.orderTiming }
                : {}),
            },
          ],
    ),
  };
}
