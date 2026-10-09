import { AppError } from "@/lib/errors";

// Work in cents; largest remainders make the allocation exact and deterministic.
export function allocateShipping(
  cost: bigint,
  net: (bigint | null)[],
  manual?: bigint[],
): bigint[] {
  const fail = (message: string): never => {
    throw new AppError("VALIDATION", message, 400);
  };
  if (cost < 0n || !net.length || net.some((v) => v !== null && v < 0n))
    fail("Revisá el costo de envío y los importes.");
  if (
    manual &&
    (manual.length !== net.length ||
      manual.some((v) => v < 0n) ||
      manual.reduce((a, b) => a + b, 0n) !== cost)
  )
    fail("El reparto manual debe coincidir con el costo de envío.");
  if (cost === 0n) return net.map(() => 0n);
  if (net.some((v) => v === null))
    fail("Completá los precios de la mercadería antes de distribuir el envío.");
  if (manual) return manual;
  const total = net.reduce<bigint>((a, b) => a + b!, 0n);
  if (total === 0n)
    fail("Usá reparto manual cuando la mercadería no tiene importe.");
  const parts = net.map((v, i) => ({
    i,
    amount: (cost * v!) / total,
    remainder: (cost * v!) % total,
  }));
  let left = cost - parts.reduce((sum, p) => sum + p.amount, 0n);
  for (const p of [...parts].sort((a, b) =>
    a.remainder === b.remainder
      ? a.i - b.i
      : a.remainder > b.remainder
        ? -1
        : 1,
  )) {
    if (left-- > 0n) p.amount++;
  }
  return parts.map((p) => p.amount);
}
