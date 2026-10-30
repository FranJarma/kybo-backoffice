import { z } from "zod";
export const authorizationInput = z
  .object({
    identifier: z.string().trim().toLowerCase().min(1).max(254),
    password: z.string().min(1).max(128),
  })
  .strict();
export const storeAccountInput = z
  .object({
    requestId: z.uuid(),
    branchId: z.uuid(),
    name: z.string().trim().min(1).max(120),
    username: z
      .string()
      .trim()
      .toLowerCase()
      .regex(/^[a-z0-9_.]{3,30}$/),
    password: z.string().min(8).max(128),
  })
  .strict();
const row = z
  .object({
    userId: z.string().min(1).max(200),
    assignmentId: z.uuid().optional(),
    shiftId: z.uuid().optional(),
    stationId: z.uuid().nullable(),
  })
  .strict();
export const managementCommand = z.discriminatedUnion("action", [
  z.object({ action: z.literal("exit") }).strict(),
  z
    .object({
      action: z.literal("save"),
      requestId: z.uuid(),
      businessDate: z.iso.date(),
      expectedRevision: z.number().int().nonnegative(),
      rows: z.array(row).max(100),
    })
    .strict(),
  z
    .object({
      action: z.literal("requestManual"),
      requestId: z.uuid(),
      userId: z.string().min(1).max(200),
      kind: z.enum(["entry", "pause", "resume", "exit"]),
      localTime: z.string().min(16).max(16),
      reason: z.string().trim().min(3).max(1000),
      assignmentId: z.uuid().optional(),
    })
    .strict(),
  z
    .object({
      action: z.literal("redeemManual"),
      requestId: z.uuid(),
      id: z.uuid(),
      code: z.string().min(1).max(30),
    })
    .strict(),
]);
export type ManagementCommand = z.infer<typeof managementCommand>;
