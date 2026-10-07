import { z } from "zod";
export const itemSchema = z
  .object({
    code: z
      .string()
      .trim()
      .min(1)
      .max(64)
      .regex(/^[A-Za-z0-9][A-Za-z0-9._-]*$/)
      .transform((v) => v.toUpperCase()),
    name: z.string().trim().min(1).max(160),
    class: z.enum(["food", "beverage", "packaging", "cleaning", "other"]),
    baseUnit: z.enum(["g", "ml", "unit"]),
    purchasable: z.boolean(),
    recipeUsable: z.boolean(),
    unitCost: z
      .string()
      .regex(/^\d{1,12}\.\d{6}$/)
      .nullable(),
  })
  .strict()
  .refine((v) => v.class !== "cleaning" || !v.recipeUsable, {
    path: ["recipeUsable"],
    message: "Los artículos de limpieza no pueden formar parte de una receta.",
  });
export type ItemInput = z.infer<typeof itemSchema>;
