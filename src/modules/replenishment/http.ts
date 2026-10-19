import { AppError } from "@/lib/errors";

/** A missing additive migration must never look like an empty, healthy stock snapshot. */
export function replenishmentError(error: unknown): unknown {
  let cause = error;
  for (
    let depth = 0;
    depth < 5 && cause && typeof cause === "object";
    depth++
  ) {
    const candidate = cause as { code?: string; cause?: unknown };
    if (candidate.code === "42P01")
      return new AppError(
        "REPLENISHMENT_NOT_READY",
        "Los avisos de reposición requieren actualizar la base de datos. Las ventas pueden continuar.",
        503,
      );
    if (candidate.code === "23505")
      return new AppError(
        "REPLENISHMENT_CONFLICT",
        "Ya existe una regla para este artículo y ubicación. Actualizá los avisos.",
        409,
      );
    cause = candidate.cause;
  }
  return error;
}
