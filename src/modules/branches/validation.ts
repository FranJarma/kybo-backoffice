import { z } from "zod";
const code = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._-]*$/)
  .transform((v) => v.toUpperCase());
export const locationSchema = z
  .object({ code, name: z.string().trim().min(1).max(160) })
  .strict();
export const branchSchema = locationSchema
  .extend({
    timeZone: z.string().refine((v) => {
      try {
        new Intl.DateTimeFormat("en", { timeZone: v });
        return true;
      } catch {
        return false;
      }
    }, "Zona horaria inválida."),
    locations: z
      .array(locationSchema)
      .min(1)
      .max(100)
      .refine(
        (v) => new Set(v.map((x) => x.code)).size === v.length,
        "No repitas códigos de ubicación.",
      ),
  })
  .strict();
