import { integer, six } from "@/modules/inventory/decimal";
export type CostOption = {
  id: string;
  name: string;
  defaultCount: number;
  costs: (string | null)[];
};
export type CostGroup = {
  id: string;
  name: string;
  min: number;
  max: number;
  options: CostOption[];
};
export type ProductCost = {
  productId: string;
  status: "ready" | "pending" | "unconfigured";
  min: string | null;
  max: string | null;
  defaultCost: string | null;
  fixed: string | null;
  referenceItems: string[];
  groups: CostGroup[];
};
export function sumCosts(costs: (string | null)[]): string | null {
  return costs.some((c) => c === null)
    ? null
    : six(costs.reduce((n, c) => n + integer(c!), 0n));
}
export function groupCostRange(group: {
  min: number;
  max: number;
  options: { costs: (string | null)[] }[];
}) {
  type State = { min: bigint | null; max: bigint | null; unknown: boolean };
  let states = new Map<number, State>([
    [0, { min: 0n, max: 0n, unknown: false }],
  ]);
  for (const option of group.options) {
    // Convert each reachable amount once, rather than twice per DP transition.
    const costs = option.costs
      .slice(0, group.max + 1)
      .map((cost) => (cost === null ? null : integer(cost)));
    const next = new Map<number, State>();
    for (const [count, state] of states)
      for (let n = 0; n < costs.length && n + count <= group.max; n++) {
        const cost = costs[n];
        const old = next.get(count + n);
        const low =
          cost === null || state.min === null ? null : cost + state.min;
        const high =
          cost === null || state.max === null ? null : cost + state.max;
        next.set(count + n, {
          min:
            low === null
              ? (old?.min ?? null)
              : old?.min == null
                ? low
                : low < old.min
                  ? low
                  : old.min,
          max:
            high === null
              ? (old?.max ?? null)
              : old?.max == null
                ? high
                : high > old.max
                  ? high
                  : old.max,
          unknown: !!old?.unknown || state.unknown || cost === null,
        });
      }
    states = next;
  }
  const valid = [...states]
    .filter(([n]) => n >= group.min && n <= group.max)
    .map(([, s]) => s);
  if (
    !valid.length ||
    valid.some((s) => s.unknown || s.min === null || s.max === null)
  )
    return { min: null, max: null };
  return {
    min: six(valid.reduce((n, s) => (s.min! < n ? s.min! : n), valid[0].min!)),
    max: six(valid.reduce((n, s) => (s.max! > n ? s.max! : n), valid[0].max!)),
  };
}
export function selectedCost(
  model: Pick<ProductCost, "fixed" | "groups">,
  counts: Record<string, number>,
) {
  const costs: (string | null)[] = [model.fixed];
  for (const group of model.groups) {
    let count = 0;
    for (const option of group.options) {
      const n = counts[option.id] ?? option.defaultCount;
      if (!Number.isInteger(n) || n < 0 || n >= option.costs.length)
        return { valid: false, cost: null };
      count += n;
      costs.push(option.costs[n]);
    }
    if (count < group.min || count > group.max)
      return { valid: false, cost: null };
  }
  return { valid: true, cost: sumCosts(costs) };
}
