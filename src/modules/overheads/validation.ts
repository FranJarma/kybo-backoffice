import { z } from "zod";
import { AppError } from "@/lib/errors";
import { decimal, integer } from "@/modules/inventory/decimal";
import { expenseCategories } from "./types";

export const expenseMonth = z
  .string()
  .regex(/^20\d{2}-(0[1-9]|1[0-2])$/, "Elegí un mes válido.");
const amount = z
  .string()
  .max(80, "El importe es demasiado largo.")
  .nullable()
  .transform((value) => value?.trim() ?? null)
  .superRefine((value, ctx) => {
    try {
      decimal(value, 2, false);
    } catch (error) {
      ctx.addIssue({ code: "custom", message: (error as Error).message });
    }
  });
export const expenseEntrySchema = z
  .object({
    category: z.enum(
      Object.keys(expenseCategories) as [
        keyof typeof expenseCategories,
        ...(keyof typeof expenseCategories)[],
      ],
      { error: "Seleccioná un tipo de gasto." },
    ),
    concept: z
      .string()
      .trim()
      .max(120, "Usá hasta 120 caracteres.")
      .default(""),
    budget: amount,
    actual: amount,
    notes: z.string().trim().max(1000, "Usá hasta 1000 caracteres."),
  })
  .strict()
  .superRefine((entry, ctx) => {
    if (entry.category === "other" && !entry.concept)
      ctx.addIssue({
        code: "custom",
        path: ["concept"],
        message: "Describí el gasto al elegir «Otros».",
      });
  })
  .transform((entry) => ({
    ...entry,
    concept: entry.concept || expenseCategories[entry.category],
  }));
export const expenseCommandSchema = z
  .object({
    action: z.enum(["save", "close", "revise"]),
    month: expenseMonth,
    revision: z.number().int().min(0),
    expectedUnits: z
      .number({ error: "Ingresá una cantidad entera." })
      .int("Ingresá una cantidad entera.")
      .min(1, "La cantidad debe ser mayor que cero.")
      .max(1000000000, "La cantidad es demasiado grande.")
      .nullable()
      .optional(),
    entries: z
      .array(expenseEntrySchema)
      .max(100, "Podés cargar hasta 100 gastos por mes.")
      .optional(),
    iibbRate: amount.optional().superRefine((value, ctx) => {
      try {
        const rate = decimal(value, 2, false);
        if (rate !== null && integer(rate) > 10000n)
          ctx.addIssue({
            code: "custom",
            message: "La alícuota debe estar entre 0 y 100%.",
          });
      } catch {
        /* The amount validator already reports its format. */
      }
    }),
    confirmed: z.boolean().optional(),
    reason: z
      .string()
      .trim()
      .max(1000, "Usá hasta 1000 caracteres.")
      .optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.action !== "close" && !value.entries)
      ctx.addIssue({
        code: "custom",
        path: ["entries"],
        message: "Completá el detalle de gastos.",
      });
    if (value.action !== "close" && value.expectedUnits === undefined)
      ctx.addIssue({
        code: "custom",
        path: ["expectedUnits"],
        message: "Indicá la cantidad prevista o dejala pendiente.",
      });
    if (value.action === "revise" && !value.reason)
      ctx.addIssue({
        code: "custom",
        path: ["reason"],
        message: "Indicá el motivo de la revisión.",
      });
    if (value.action === "revise")
      value.entries?.forEach((entry, index) => {
        if (entry.actual === null || entry.actual === "")
          ctx.addIssue({
            code: "custom",
            path: ["entries", index, "actual"],
            message:
              "Completá el importe real para revisar el cierre; usá 0 si no hubo gasto.",
          });
      });
  });

function fieldLabel(path: PropertyKey[]) {
  const labels: Record<string, string> = {
    month: "Mes de gastos",
    expectedUnits: "Unidades previstas",
    iibbRate: "Alícuota estimada de IIBB",
    reason: "Motivo de la revisión",
    concept: "Descripción",
    category: "Tipo",
    budget: "Presupuesto",
    actual: "Real",
    notes: "Observaciones",
  };
  if (path[0] === "entries" && typeof path[1] === "number")
    return `${labels[String(path[2])] ?? "Datos"} del gasto ${path[1] + 1}`;
  return labels[String(path[0])] ?? "Datos del mes";
}
export function expenseValidationFeedback(error: z.ZodError) {
  const first = error.issues[0];
  const fields = Object.fromEntries(
    error.issues.map((issue) => [issue.path.join("."), issue.message]),
  );
  return {
    error: first
      ? `${fieldLabel(first.path)}: ${first.message}`
      : "Revisá los datos del mes.",
    fields,
  };
}

export class ExpenseValidationError extends AppError {
  readonly fields: Record<string, string>;
  constructor(error: z.ZodError) {
    const feedback = expenseValidationFeedback(error);
    super("VALIDATION", feedback.error, 400);
    this.fields = feedback.fields;
  }
}
