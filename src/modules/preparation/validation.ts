import { z } from "zod";
import { uuid } from "@/modules/sales/validation";
export const actionSchema = z
  .object({
    requestId: uuid,
    revision: z.number().int().positive(),
    action: z.enum(["start", "ready", "deliver", "reassign"]),
    assigneeId: z.string().min(1).max(200).optional(),
    reason: z.string().trim().max(500).default(""),
  })
  .strict();
export const stationSchema = z
  .object({
    requestId: uuid,
    id: uuid.optional(),
    revision: z.number().int().positive().optional(),
    name: z.string().trim().min(1).max(60),
    consumptionLocationId: uuid,
    archived: z.boolean().default(false),
  })
  .strict();
export const routeSchema = z
  .object({
    requestId: uuid,
    productId: uuid,
    revision: z.number().int().min(0),
    stationId: uuid.nullable(),
  })
  .strict();
export const listSchema = z
  .object({
    scope: z.enum(["active", "history"]).default("active"),
    stationId: z.union([uuid, z.literal("general")]).optional(),
    mine: z.boolean().default(false),
    origin: z.enum(["counter", "table", "delivery"]).optional(),
    saleId: uuid.optional(),
    date: z.iso.date().optional(),
    offset: z.number().int().min(0).max(1000000).default(0),
  })
  .strict();
export const settingsSchema = z
  .object({
    productId: uuid.optional(),
    q: z.string().max(160).default(""),
    includeArchived: z.boolean().default(false),
    offset: z.number().int().min(0).max(1000000).default(0),
  })
  .strict();
