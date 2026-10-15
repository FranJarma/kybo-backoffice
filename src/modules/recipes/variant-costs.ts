import { integer, six } from "@/modules/inventory/decimal";

export function variantTotals(
  common: (string | null)[],
  alternatives: (string | null)[][],
): (string | null)[] {
  return alternatives.map((alternative) => {
    const costs = [...common, ...alternative];
    if (costs.some((cost) => cost === null)) return null;
    return six(
      costs.reduce<bigint>((total, cost) => total + integer(cost!), 0n),
    );
  });
}
