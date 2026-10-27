import { AppError } from "@/lib/errors";
export function dailyOperationError(error: unknown) {
  let cause = error;
  for (let i = 0; i < 5 && cause && typeof cause === "object"; i++) {
    const c = cause as { code?: string; cause?: unknown };
    if (c.code === "42P01")
      return new AppError(
        "DAILY_NOT_READY",
        "Operación del día requiere actualizar la base de datos. Todavía no está habilitada; las ventas pueden continuar.",
        503,
      );
    if (["23505", "40001", "40P01"].includes(c.code ?? ""))
      return new AppError(
        "DAILY_CONFLICT",
        "Los datos cambiaron. Actualizá antes de continuar.",
        409,
      );
    cause = c.cause;
  }
  return error;
}
