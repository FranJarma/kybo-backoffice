import { z } from "zod";
import { AppError } from "@/lib/errors";
import { decimal } from "./decimal";
const id = z.uuid();
const date = z.iso
  .date()
  .refine(
    (v) => !Number.isNaN(Date.parse(`${v}T00:00:00Z`)),
    "Fecha inválida.",
  );
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((v) => v || null);
const amount = (required = true, positive = false) =>
  z
    .unknown()
    .optional()
    .transform((v) => decimal(v, 2, required, positive));
const quantity = (required = true, positive = false) =>
  z
    .unknown()
    .optional()
    .transform((v) => decimal(v, 6, required, positive));
const requestId = id;
const reason = z.string().trim().min(1).max(500);
const receive = z
  .object({
    requestId,
    supplierId: id,
    locationId: id,
    receivedOn: date,
    documentNumber: optionalText(120).transform(
      (v) => v?.toLocaleUpperCase("es-AR") ?? null,
    ),
    notes: optionalText(2000),
    lines: z
      .array(
        z
          .object({
            itemId: id,
            itemRevision: z.number().int().positive().optional(),
            presentationRevision: z.number().int().positive().optional(),
            presentationId: id.nullish().transform((v) => v || null),
            quantity: quantity(true, true),
            unitPrice: quantity(false),
            discount: amount(false).transform((v) => v ?? "0.00"),
            lotCode: optionalText(120),
            expiresOn: date.nullish().transform((v) => v || null),
          })
          .strict(),
      )
      .min(1)
      .max(30),
  })
  .strict();
const payment = z
  .object({
    requestId,
    paymentMethodId: id,
    paidOn: date,
    amount: amount(true, true),
    reference: optionalText(160),
  })
  .strict();
const opening = z
  .object({
    kind: z.literal("opening"),
    locationId: id,
    requestId,
    itemId: id,
    quantity: quantity(true, true),
    unitCost: quantity(false),
    receivedOn: date,
    expiresOn: date.nullish().transform((v) => v || null),
    lotCode: optionalText(120),
    reason,
  })
  .strict();
const baseLot = {
  locationId: id,
  requestId,
  lotId: id,
  revision: z.number().int().positive(),
  reason,
};
const adjust = z.discriminatedUnion("kind", [
  opening,
  z
    .object({
      ...baseLot,
      kind: z.literal("waste"),
      quantity: quantity(true, true),
    })
    .strict(),
  z
    .object({
      ...baseLot,
      kind: z.literal("count"),
      countedQuantity: quantity(),
    })
    .strict(),
  z
    .object({ ...baseLot, kind: z.literal("block"), blocked: z.boolean() })
    .strict(),
]);
function parse<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success)
    throw new AppError(
      "VALIDATION",
      result.error.issues[0]?.message ?? "Revisá los campos.",
      400,
    );
  return result.data;
}
export const parseReceive = (input: unknown) => parse(receive, input);
export const parsePayment = (input: unknown) => parse(payment, input);
export const parseAdjustment = (input: unknown) => parse(adjust, input);
