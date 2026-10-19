import type { Actor } from "@/lib/access";
/** Provider costs are management data; never send them to the staff client. */
export function salesVisibility(actor: Actor, value: unknown): unknown {
  if (
    actor.role !== "staff" ||
    !value ||
    typeof value !== "object" ||
    !("payments" in value) ||
    !Array.isArray(value.payments)
  )
    return value;
  return {
    ...value,
    payments: value.payments.map((payment: Record<string, unknown>) => {
      const {
        commissionPercent: _percent,
        commissionAmount: _amount,
        settlementNet: _net,
        ...rest
      } = payment;
      void _percent;
      void _amount;
      void _net;
      return rest;
    }),
  };
}
