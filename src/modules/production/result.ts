export type ProductionResult = {
  actualQuantity: string;
  consumption: { itemId: string; quantity: string }[];
  lotId: string;
  totalCost: string | null;
  quantitySource?: string;
  revision?: number;
};

export function latestProductionResult(
  events: { action: string; after: unknown }[],
): ProductionResult | null {
  const eligible = events
    .filter((e) => e.action === "finish" || e.action === "review-result")
    .map((e) => e.after as ProductionResult)
    .filter(
      (e) =>
        typeof e.lotId === "string" &&
        Array.isArray(e.consumption) &&
        typeof e.actualQuantity === "string",
    );
  return (
    eligible.sort((a, b) => (b.revision ?? 0) - (a.revision ?? 0))[0] ?? null
  );
}
