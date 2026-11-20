import { z } from "zod";
const uuid = z.uuid();
export const printingCommand = z.discriminatedUnion("action", [
  z
    .object({
      action: z.literal("configure"),
      revision: z.number().int().nonnegative(),
      enabled: z.boolean(),
      printerName: z.string().trim().min(1).max(160),
    })
    .strict(),
  z.object({ action: z.literal("pairing") }).strict(),
  z.object({ action: z.literal("revoke"), connectorId: uuid }).strict(),
  z
    .object({
      action: z.literal("reprint"),
      jobId: uuid,
      reason: z.string().trim().min(1).max(300),
    })
    .strict(),
  z.object({ action: z.literal("retry"), jobId: uuid }).strict(),
  z
    .object({
      action: z.literal("resolve"),
      jobId: uuid,
      result: z.enum(["printed", "discard"]),
      queueCleared: z.literal(true).optional(),
    })
    .strict(),
  z.object({ action: z.literal("test") }).strict(),
]);
const job = {
  instanceId: uuid,
  jobId: uuid,
  leaseToken: z.string().min(32).max(128),
};
export const connectorCommand = z.discriminatedUnion("action", [
  z
    .object({
      action: z.literal("pair"),
      code: z.string().min(32).max(128),
      printerName: z.string().min(1).max(160),
    })
    .strict(),
  z
    .object({
      action: z.literal("heartbeat"),
      instanceId: uuid,
      printerStatus: z.enum([
        "ready",
        "offline",
        "paper-out",
        "unknown",
        "error",
      ]),
      printerMessage: z.string().max(300).optional(),
    })
    .strict(),
  z.object({ action: z.literal("claim"), instanceId: uuid }).strict(),
  z.object({ action: z.literal("begin"), ...job }).strict(),
  z
    .object({
      action: z.literal("report"),
      ...job,
      outcome: z.enum(["sent", "failed", "uncertain", "cancelled"]),
      spoolJobId: z.number().int().positive().optional(),
      error: z.string().max(500).optional(),
    })
    .strict(),
  z
    .object({
      action: z.literal("reconcile"),
      ...job,
      spoolJobId: z.number().int().positive().optional(),
      outcome: z.enum(["present", "removed", "unknown"]),
    })
    .strict(),
]);
