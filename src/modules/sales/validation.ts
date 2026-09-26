import { z } from "zod";
import { AppError } from "@/lib/errors";
import type { Actor } from "@/lib/access";
import { decimal, cents } from "@/modules/inventory/decimal";

export function salesAccess(actor: Actor | null): asserts actor is Actor {
  if (!actor)
    throw new AppError("UNAUTHORIZED", "Iniciá sesión para continuar.", 401);
  if (!["admin", "manager", "staff"].includes(actor.role))
    throw new AppError("FORBIDDEN", "Sin permiso para ventas.", 403);
}
export const uuid = z.string().uuid();
const note = z.string().trim().max(500).default("");
const amount = z.string().transform((v) => decimal(v, 2)!);
export const channelSchema = z.enum(["counter", "pedidosya", "ubereats"]);
const lineSchema = z
  .object({
    productId: uuid,
    quantity: z.number().int().min(1).max(999),
    price: amount,
    expectedPrice: z
      .string()
      .regex(/^\d{1,12}\.\d{2}$/)
      .nullable(),
    priceReason: z.string().trim().max(240).default(""),
    notes: note,
  })
  .strict();
const paymentSchema = z
  .object({
    collector: z.enum(["local", "platform"]),
    methodId: uuid.nullish(),
    amount: z.string().transform((v) => decimal(v, 2, true, true)!),
    reference: z.string().trim().max(120).default(""),
  })
  .strict();
export const createSchema = z
  .object({
    requestId: uuid,
    origin: z.enum(["counter", "table", "delivery"]),
    channel: channelSchema,
    fulfillment: z.enum(["takeaway", "dine_in", "delivery", "pickup"]),
    tableId: uuid.nullish(),
    customerId: uuid.nullish(),
    externalId: z.string().trim().min(1).max(80).nullish(),
    notes: note,
    lines: z.array(lineSchema).min(1).max(50),
    payments: z.array(paymentSchema).max(10).default([]),
  })
  .strict();
export const orderSchema = z
  .object({
    requestId: uuid,
    revision: z.number().int().positive(),
    lines: z.array(lineSchema).min(1).max(50),
    notes: note,
  })
  .strict();
export const paySchema = z
  .object({
    requestId: uuid,
    revision: z.number().int().positive(),
    payments: z.array(paymentSchema).min(1).max(10),
  })
  .strict();
export const cancelSchema = z
  .object({
    requestId: uuid,
    revision: z.number().int().positive(),
    reason: z.string().trim().min(1).max(500),
    refundConfirmed: z.boolean(),
  })
  .strict();
export const tableSchema = z
  .object({
    requestId: uuid,
    id: uuid.optional(),
    revision: z.number().int().positive().optional(),
    name: z.string().trim().min(1).max(40),
    capacity: z.number().int().min(1).max(30),
    x: z.number().int().min(0).max(5),
    y: z.number().int().min(0).max(5),
    archived: z.boolean().default(false),
  })
  .strict();
export function parse<S extends z.ZodType>(
  schema: S,
  raw: unknown,
): z.output<S> {
  const result = schema.safeParse(raw);
  if (!result.success)
    throw new AppError(
      "VALIDATION",
      "Revisá los campos obligatorios, cantidades y referencias.",
      400,
    );
  return result.data;
}
export function moneyBound(n: bigint) {
  if (n < 0n || n >= 10n ** 14n)
    throw new AppError(
      "VALIDATION",
      "El importe total excede el límite permitido.",
      400,
    );
  return cents(n);
}
export type LineInput = z.output<typeof lineSchema>;
export type PaymentInput = z.output<typeof paymentSchema>;
