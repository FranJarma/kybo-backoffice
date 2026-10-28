import { z } from "zod";
import { cashAmount, cashCents } from "./calculation";
const money = (signed = false) =>
  z.string().transform((value) => cashAmount(cashCents(value, signed)));
const reason = z.string().trim().max(1000);
const positive = money().refine(
  (v) => cashCents(v) > 0n,
  "Ingresá un importe mayor que cero.",
);
const posnetSchema = z
  .object({
    mode: z.enum(["registered", "pending", "none"]),
    reason: reason.optional(),
    lots: z
      .array(
        z
          .object({
            number: z.string().trim().min(1).max(80),
            closedAt: z.iso.datetime({ offset: true }),
            operations: z.number().int().min(1).max(1000000),
            total: money(true),
            photoId: z.uuid(),
          })
          .strict(),
      )
      .max(20),
  })
  .strict();
export const cashCommandSchema = z.discriminatedUnion("action", [
  z
    .object({
      action: z.literal("open"),
      amount: money(),
      reason: reason.default(""),
    })
    .strict(),
  z
    .object({
      action: z.literal("expense"),
      amount: positive,
      concept: z.string().trim().min(1).max(200),
      category: z.enum([
        "rent",
        "electricity",
        "utilities",
        "internet",
        "payroll",
        "taxes",
        "maintenance",
        "other",
      ]),
      source: z.enum(["cash", "external"]).default("cash"),
    })
    .strict(),
  z
    .object({
      action: z.literal("withdraw"),
      amount: positive,
      reason: reason.min(1),
      recipient: z.string().trim().min(1).max(160),
    })
    .strict(),
  z
    .object({
      action: z.literal("close"),
      sessionId: z.uuid(),
      expectedRevision: z.number().int().positive(),
      counted: money(),
      withdrawal: money(),
      reason: reason,
      posnet: posnetSchema,
    })
    .strict(),
  z
    .object({
      action: z.literal("review"),
      sessionId: z.uuid(),
      note: reason.min(1),
      posnet: posnetSchema.optional(),
    })
    .strict(),
]);
export const cashSettingsCommandSchema = z.discriminatedUnion("action", [
  z
    .object({
      action: z.literal("configure"),
      closeTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
      targetFund: money().nullable(),
      revision: z.number().int().min(0),
    })
    .strict(),
  z
    .object({
      action: z.literal("permission"),
      userId: z.string().min(1).max(200),
      canOpen: z.boolean(),
      canClose: z.boolean(),
      canExpense: z.boolean(),
    })
    .strict(),
]);
