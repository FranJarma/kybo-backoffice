import { AppError } from "@/lib/errors";
type Account = {
  role: string;
  disabled: boolean;
  catalogManager: boolean;
} | null;
function active(account: Account): asserts account is NonNullable<Account> {
  if (
    !account ||
    account.disabled ||
    !["admin", "manager", "staff"].includes(account.role)
  )
    throw new AppError(
      "FORBIDDEN",
      "Tu acceso operativo no está habilitado.",
      403,
    );
}
export function authorizeBranch(
  account: Account,
  membership: string | null,
): "admin" | "manager" | "staff" {
  active(account);
  if (account.role === "admin") return "admin";
  if (membership !== "manager" && membership !== "staff")
    throw new AppError("FORBIDDEN", "No tenés acceso a esta sucursal.", 403);
  return membership;
}
export function authorizeCatalog(account: Account): void {
  active(account);
  if (account.role !== "admin" && !account.catalogManager)
    throw new AppError(
      "FORBIDDEN",
      "No tenés permiso para gestionar el catálogo compartido.",
      403,
    );
}
