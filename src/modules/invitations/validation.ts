import { z } from "zod";
const validity = z
  .union([z.literal(24), z.literal(48), z.literal(72), z.literal(168)])
  .default(72);
export const invitationCommandSchema = z.discriminatedUnion("action", [
  z
    .object({
      action: z.literal("invite-create"),
      requestId: z.uuid(),
      name: z.string().trim().min(1).max(120),
      role: z.enum(["manager", "staff"]),
      branchId: z.uuid(),
      attendanceEnabled: z.boolean(),
      validityHours: validity,
    })
    .strict(),
  z
    .object({
      action: z.literal("invite-renew"),
      requestId: z.uuid(),
      userId: z.string().min(1).max(200),
      validityHours: validity,
    })
    .strict(),
  z
    .object({
      action: z.literal("invite-reveal"),
      userId: z.string().min(1).max(200),
    })
    .strict(),
]);
