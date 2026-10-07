import { z } from "zod";
import { decimal } from "@/modules/inventory/decimal";
import { parse, positiveQuantity } from "@/modules/recipes/validation";
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((v) => v || null);
const production = z
  .object({
    locationId: z.uuid(),
    recipeId: z.uuid(),
    revision: z.number().int().positive(),
    multiplier: positiveQuantity,
    actualOutput: positiveQuantity,
    producedOn: z.iso.date(),
    expiresOn: z.iso
      .date()
      .nullish()
      .transform((v) => v || null),
    lotCode: optionalText(120),
    notes: optionalText(2000),
    selections: z
      .array(
        z
          .object({
            lineId: z.uuid(),
            optionId: z.uuid().nullable(),
            quantity: z.unknown().transform((v) => decimal(v, 6)!),
          })
          .strict(),
      )
      .min(1)
      .max(30),
  })
  .strict();
export const parseProduction = (raw: unknown) => parse(production, raw);
export const parseProductionOperation = (raw: unknown) =>
  parse(
    production.extend({
      requestId: z.uuid(),
      previewToken: z.string().regex(/^[a-f0-9]{64}$/),
    }),
    raw,
  );
export type ParsedProduction = ReturnType<typeof parseProduction>;
