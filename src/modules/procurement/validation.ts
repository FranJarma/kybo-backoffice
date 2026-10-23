import { z } from "zod";
import { decimal } from "../inventory/decimal";
const date = z.iso.date();
export const createOrderSchema = z
  .object({
    requestId: z.uuid(),
    supplierId: z.uuid(),
    orderedOn: date,
    expectedOn: date.nullable(),
    notes: z.string().trim().max(2000).default(""),
    lines: z
      .array(
        z
          .object({
            itemId: z.uuid(),
            presentationId: z.uuid().nullish(),
            quantity: z.string().transform((v) => decimal(v, 6, true, true)!),
          })
          .strict(),
      )
      .min(1)
      .max(30),
  })
  .strict()
  .refine(
    (v) => !v.expectedOn || v.expectedOn >= v.orderedOn,
    "La llegada no puede ser anterior al pedido.",
  );
const base = {
  requestId: z.uuid(),
  expectedRevision: z.number().int().positive(),
};
export const orderCommandSchema = z.discriminatedUnion("action", [
  z.object({ ...base, action: z.literal("confirm") }).strict(),
  z
    .object({
      ...base,
      action: z.literal("reschedule"),
      expectedOn: date.nullable(),
      reason: z.string().trim().min(1, "Explicá el cambio de fecha.").max(500),
    })
    .strict(),
  z
    .object({
      ...base,
      action: z.literal("cancel"),
      reason: z
        .string()
        .trim()
        .min(1, "Indicá el motivo de cancelación.")
        .max(500),
    })
    .strict(),
]);
