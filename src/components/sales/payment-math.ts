import { cents, decimal, integer } from "@/modules/inventory/decimal";

/** Received cash is only a change aid; callers submit the collection amount. */
export function cashChange(
  received: string,
  collection: string,
): { valid: boolean; change: string | null } {
  if (!received.trim()) return { valid: true, change: null };
  try {
    const difference =
      integer(decimal(received, 2, true, true)!) -
      integer(decimal(collection, 2, true, true)!);
    return {
      valid: difference >= 0n,
      change: difference >= 0n ? cents(difference) : null,
    };
  } catch {
    return { valid: false, change: null };
  }
}
