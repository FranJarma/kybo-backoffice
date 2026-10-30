import { z } from "zod";
export const taskCommandSchema = z
  .object({
    requestId: z.uuid(),
    verificationId: z.uuid().optional(),
    expectedRevision: z.number().int().positive(),
    action: z.enum([
      "assign",
      "start",
      "report_blocked",
      "cancel",
      "dispatch",
      "receive",
      "confirm_transfer",
      "confirm_production",
    ]),
    assignedTo: z.string().min(1).max(200).optional(),
    reason: z.string().trim().max(2000).optional(),
  })
  .strict();
export const dayFiltersSchema = z.object({
  mine: z.boolean().default(false),
  locationId: z.uuid().optional(),
  assignedTo: z.string().max(200).optional(),
  kind: z.enum(["transfer", "production", "purchase", "count"]).optional(),
  urgency: z.enum(["critical", "high", "scheduled"]).optional(),
  history: z.boolean().default(false),
  offset: z.number().int().min(0).max(100000).default(0),
});
