import { parseWaste } from "@/modules/recipes/waste";
import { z } from "zod";
import { decimal } from "@/modules/inventory/decimal";
import { AppError } from "@/lib/errors";
const parse = <T>(schema: z.ZodType<T>, raw: unknown): T => {
  const r = schema.safeParse(raw);
  if (!r.success)
    throw new AppError("VALIDATION", "Revisá los campos del grupo.", 400);
  return r.data;
};
export const componentInput = z
  .object({
    itemId: z.uuid(),
    quantity: z.unknown().transform((v) => decimal(v, 6, true, true)!),
    wastePercent: z.unknown().transform(parseWaste),
    baseUnit: z.enum(["g", "ml", "unit"]).optional(),
  })
  .strict();
export const groupInput = z
  .object({
    requestId: z.uuid(),
    id: z.uuid().optional(),
    revision: z.number().int().positive().optional(),
    name: z.string().trim().min(1).max(100),
    options: z
      .array(
        z
          .object({
            key: z.string().trim().min(1).max(80),
            name: z.string().trim().min(1).max(100),
            kind: z.enum(["composition", "instruction"]),
            instruction: z.string().trim().max(500).nullish(),
            components: z.array(componentInput).max(30).default([]),
          })
          .strict(),
      )
      .min(1)
      .max(50),
  })
  .strict();
export const parseGroup = (raw: unknown) => parse(groupInput, raw);
export const bindingInput = z
  .object({
    groupVersionId: z.uuid().optional(),
    draft: groupInput.optional(),
    name: z.string().trim().min(1).max(100),
    min: z.number().int().min(0).max(100),
    max: z.number().int().min(0).max(100),
    factor: z.unknown().transform((v) => decimal(v, 6, true, true)!),
    options: z
      .array(
        z
          .object({
            optionId: z.uuid().optional(),
            optionKey: z.string().min(1).max(80).optional(),
            enabled: z.boolean(),
            defaultCount: z.number().int().min(0).max(100),
            maxCount: z.number().int().min(0).max(100),
            mode: z.enum(["inherit", "override"]),
            components: z.array(componentInput).max(30).default([]),
            prices: z
              .object({
                counter: z
                  .unknown()
                  .transform((v) => decimal(v, 2, false))
                  .optional(),
                pedidosya: z
                  .unknown()
                  .transform((v) => decimal(v, 2, false))
                  .optional(),
                ubereats: z
                  .unknown()
                  .transform((v) => decimal(v, 2, false))
                  .optional(),
              })
              .strict(),
          })
          .strict(),
      )
      .min(1)
      .max(50),
  })
  .strict();
export type BindingInput = z.output<typeof bindingInput>;
