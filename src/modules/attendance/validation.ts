import { z } from "zod";
export const punchKindSchema = z.enum(["entry", "pause", "resume", "exit"]);
export const locationSchema = z
  .object({
    latitude: z.number().finite().min(-90).max(90),
    longitude: z.number().finite().min(-180).max(180),
    accuracy: z.number().positive().max(100000),
    measuredAt: z.iso.datetime(),
  })
  .strict();
const reason = z.string().trim().min(3).max(1000);
const optionalReason = z.string().trim().max(1000).default("");
export const attendanceCommandSchema = z.discriminatedUnion("action", [
  z
    .object({
      action: z.literal("punch"),
      kind: punchKindSchema,
      location: locationSchema,
      assignmentId: z.uuid().nullable().optional(),
      verificationId: z.uuid().optional(),
      qrAttemptId: z.uuid().optional(),
    })
    .strict(),
  z
    .object({
      action: z.literal("requestManual"),
      userId: z.string().min(1).max(100),
      kind: punchKindSchema,
      localTime: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/),
      reason,
      assignmentId: z.uuid().nullable().optional(),
    })
    .strict(),
  z
    .object({
      action: z.literal("approveManual"),
      id: z.uuid(),
      reason: optionalReason,
    })
    .strict(),
  z
    .object({ action: z.literal("rejectManual"), id: z.uuid(), reason })
    .strict(),
  z
    .object({
      action: z.literal("redeemManual"),
      id: z.uuid(),
      code: z.string().regex(/^\d{6}$/),
    })
    .strict(),
  z
    .object({
      action: z.literal("configure"),
      expectedRevision: z.number().int().min(0),
      enabled: z.boolean(),
      latitude: z.number().finite().min(-90).max(90).nullable(),
      longitude: z.number().finite().min(-180).max(180).nullable(),
      radiusMeters: z.number().int().min(1).max(10000),
      maxAccuracyMeters: z.number().int().min(1).max(1000),
      codeValidityMinutes: z.number().int().min(1).max(1440),
      requireStepUp: z.boolean(),
    })
    .strict(),
  z
    .object({
      action: z.literal("participant"),
      userId: z.string().min(1).max(100),
      enabled: z.boolean(),
    })
    .strict(),
  z
    .object({
      action: z.literal("saveShift"),
      id: z.uuid().optional(),
      expectedRevision: z.number().int().positive().optional(),
      name: z.string().trim().min(1).max(60),
      start: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
      end: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
      overnight: z.boolean(),
      pauseMinutes: z.number().int().min(0).max(1439),
      active: z.boolean(),
    })
    .strict(),
  z
    .object({
      action: z.literal("assign"),
      id: z.uuid().optional(),
      expectedRevision: z.number().int().positive().optional(),
      userId: z.string().min(1).max(100),
      businessDate: z.string(),
      kind: z.enum(["work", "off"]),
      shiftId: z.uuid().nullable().optional(),
      name: z.string().trim().min(1).max(60).optional(),
      start: z.string().optional(),
      end: z.string().optional(),
      overnight: z.boolean().optional(),
      pauseMinutes: z.number().int().min(0).max(1439).optional(),
      reason: optionalReason,
    })
    .strict(),
  z
    .object({
      action: z.literal("cancelAssignment"),
      id: z.uuid(),
      expectedRevision: z.number().int().positive(),
      reason,
    })
    .strict(),
  z
    .object({
      action: z.literal("copyWeek"),
      sourceMonday: z.string(),
      targetMonday: z.string(),
      userIds: z.array(z.string().min(1).max(100)).max(200).optional(),
    })
    .strict(),
  z
    .object({
      action: z.literal("requestCorrection"),
      userId: z.string().min(1).max(100),
      changes: z
        .array(
          z
            .object({
              eventId: z.uuid(),
              occurredAt: z.iso.datetime().nullable(),
            })
            .strict(),
        )
        .min(1)
        .max(20),
      reason,
    })
    .strict(),
  z
    .object({
      action: z.literal("resolveCorrection"),
      id: z.uuid(),
      approve: z.boolean(),
      reason,
    })
    .strict(),
  z
    .object({
      action: z.literal("linkAssignment"),
      entryId: z.uuid(),
      assignmentId: z.uuid(),
      reason,
    })
    .strict(),
]);
export type AttendanceCommand = z.infer<typeof attendanceCommandSchema>;
