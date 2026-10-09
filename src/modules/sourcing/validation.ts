import { z } from "zod";
import { decimal } from "../inventory/decimal";

const requestId = z.uuid();
const text = z.string().trim().min(1).max(160);
const positive = z.string().transform((v) => decimal(v, 6, true, true)!);
export const sourcingInput = z.discriminatedUnion("action", [
  z
    .object({ action: z.literal("link"), requestId, supplierId: z.uuid() })
    .strict(),
  z
    .object({
      action: z.literal("presentation"),
      requestId,
      supplierId: z.uuid(),
      name: text,
      unitsPerPack: z
        .string()
        .max(7)
        .regex(/^\d+$/)
        .refine((v) => BigInt(v) > 0n && BigInt(v) <= 1000000n),
      contentPerUnit: positive,
      unit: z.enum(["l", "ml", "kg", "g", "unit"]),
    })
    .strict(),
  z
    .object({
      action: z.literal("quote"),
      requestId,
      presentationId: z.uuid(),
      revision: z.number().int().positive(),
      price: z.string().transform((v) => decimal(v, 6, true)!),
      quotedOn: z.iso.date(),
      validUntil: z.iso.date().nullable(),
      leadTimeDays: z.number().int().min(0).max(365).nullable(),
      minimumPacks: z.number().int().min(1).max(1000000),
    })
    .strict()
    .refine((v) => !v.validUntil || v.validUntil >= v.quotedOn, {
      message: "La vigencia debe ser igual o posterior a la fecha del precio.",
    }),
]);
export type SourcingInput = z.input<typeof sourcingInput>;
