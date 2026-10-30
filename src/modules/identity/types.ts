export type IdentityConfig = { rpId: string; origin: string; secret: string };
export type ConfirmationBinding = {
  action: "attendance-punch" | "production-start" | "cash-close";
  branchId: string;
  requestId: string;
  payload: unknown;
};
