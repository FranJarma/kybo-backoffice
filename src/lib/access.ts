import { AppError } from "./errors";

export type Actor = {
  id: string;
  role: "admin" | "manager" | "staff";
  catalogManager?: boolean;
  branchId?: string;
  timeZone?: string;
};

export function requireCatalogAccess(actor: Actor | null): void {
  if (!actor)
    throw new AppError("UNAUTHORIZED", "Iniciá sesión para continuar.", 401);
  if (actor.role !== "admin" && actor.role !== "manager") {
    throw new AppError(
      "FORBIDDEN",
      "No tenés permiso para gestionar el catálogo.",
      403,
    );
  }
}
