import { z } from "zod";
import { AppError } from "@/lib/errors";
import { decimal } from "@/modules/inventory/decimal";
export const positiveQuantity = z
  .unknown()
  .transform((v) => decimal(v, 6, true, true)!);
const unit = z.enum(["g", "ml", "unit"]);
const recipe = z
  .object({
    requestId: z.uuid(),
    id: z.uuid().optional(),
    revision: z.number().int().positive().optional(),
    kind: z.enum(["product", "preparation"]),
    targetId: z.uuid(),
    targetUnit: unit.optional(),
    yieldQuantity: positiveQuantity,
    notes: z
      .string()
      .trim()
      .max(2000)
      .nullish()
      .transform((v) => v || null),
    lines: z
      .array(
        z
          .object({
            optional: z.boolean().default(false),
            options: z
              .array(
                z
                  .object({
                    ingredientId: z.uuid(),
                    quantity: positiveQuantity,
                    baseUnit: unit.optional(),
                  })
                  .strict(),
              )
              .min(1)
              .max(5),
          })
          .strict(),
      )
      .min(1)
      .max(30),
  })
  .strict();
const choice = z
  .object({ lineId: z.uuid(), optionId: z.uuid().nullable() })
  .strict();
const selection = z
  .object({
    revision: z.number().int().positive(),
    selections: z.array(choice).max(30),
  })
  .strict();
export function parse<T>(schema: z.ZodType<T>, raw: unknown): T {
  const result = schema.safeParse(raw);
  if (!result.success)
    throw new AppError(
      "VALIDATION",
      "Revisá los datos y las cantidades de la receta.",
      400,
    );
  return result.data;
}
export const parseRecipe = (raw: unknown) => parse(recipe, raw);
export const parseSelections = (raw: unknown) => parse(selection, raw);
