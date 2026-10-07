import { AppError } from "@/lib/errors";
export type AvailableLot = {
  id: string;
  receivedOn: string;
  expiresOn: string | null;
  blocked: boolean;
  locationBlocked: boolean;
  quantity: bigint;
  reserved: bigint;
};
export function availableQuantity(lot: AvailableLot, today: string): bigint {
  if (
    lot.blocked ||
    lot.locationBlocked ||
    (lot.expiresOn !== null && lot.expiresOn <= today)
  )
    return 0n;
  return lot.quantity > lot.reserved ? lot.quantity - lot.reserved : 0n;
}
export function allocateFefo(
  lots: AvailableLot[],
  demand: bigint,
  today: string,
): { lotId: string; quantity: bigint }[] {
  if (demand <= 0n)
    throw new AppError("VALIDATION", "La reserva debe ser positiva.", 400);
  let remaining = demand;
  const allocations: { lotId: string; quantity: bigint }[] = [];
  for (const lot of [...lots].sort(
    (a, b) =>
      (a.expiresOn ?? "9999-12-31").localeCompare(
        b.expiresOn ?? "9999-12-31",
      ) ||
      a.receivedOn.localeCompare(b.receivedOn) ||
      a.id.localeCompare(b.id),
  )) {
    const available = availableQuantity(lot, today);
    const quantity = available < remaining ? available : remaining;
    if (quantity > 0n) allocations.push({ lotId: lot.id, quantity });
    remaining -= quantity;
    if (remaining === 0n) return allocations;
  }
  throw new AppError(
    "INSUFFICIENT_STOCK",
    "No hay existencias disponibles para reservar el pedido.",
    409,
  );
}
