import { z } from "zod";
import { AppError } from "@/lib/errors";
export const branchProductInput = z
  .object({
    enabled: z.boolean(),
    dispatchLocationId: z.uuid().nullable(),
    temporarilySoldOut: z.boolean().optional(),
    revision: z.number().int().min(0).optional(),
  })
  .strict()
  .refine(
    (v) => v.temporarilySoldOut === undefined || v.revision !== undefined,
    "Actualizá la configuración antes de cambiar el agotado.",
  );
export function nextBranchProduct(
  input: z.infer<typeof branchProductInput>,
  current?: { revision: number; temporarilySoldOut: boolean },
) {
  if (
    input.revision !== undefined &&
    input.revision !== (current?.revision ?? 0)
  )
    throw new AppError(
      "CONFLICT",
      "La configuración cambió. Volvé a seleccionar el producto antes de guardar.",
      409,
    );
  return {
    enabled: input.enabled,
    dispatchLocationId: input.dispatchLocationId,
    temporarilySoldOut:
      input.temporarilySoldOut ?? current?.temporarilySoldOut ?? false,
    revision: (current?.revision ?? 0) + 1,
  };
}
