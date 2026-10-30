import { createDataModelTestContext } from "./data-model-database";
import * as s from "@/db/schema";
import { hashPassword } from "better-auth/crypto";
import type { Actor } from "@/lib/access";
import { eq } from "drizzle-orm";
export const attendanceNow = new Date("2026-10-29T15:00:00Z");
export const testPassword = "Attendance-TestOnly-123!";
export const testIdentityConfig = {
  rpId: "kybo.example",
  origin: "https://kybo.example",
  secret: "attendance-test-only-secret-at-least-32-characters",
};
export async function createAttendanceContext(
  directory?: string,
  options: { attendanceAccess?: boolean } = {},
) {
  const c = await createDataModelTestContext({
    attendance: true,
    directory,
    ...options,
  });
  const branchId = c.mapping.initialBranch.id;
  await c.db
    .update(s.branches)
    .set({ timeZone: "America/Argentina/Buenos_Aires" })
    .where(eq(s.branches.id, branchId));
  const actors = {
    admin: { id: "att-admin", role: "admin", branchId } as Actor,
    otherAdmin: { id: "att-admin-2", role: "admin", branchId } as Actor,
    manager: { id: "att-manager", role: "manager", branchId } as Actor,
    staff: { id: "att-staff", role: "staff", branchId } as Actor,
  };
  const password = await hashPassword(testPassword);
  for (const actor of Object.values(actors)) {
    await c.db.insert(s.user).values({
      id: actor.id,
      name: actor.id,
      email: actor.id + "@test.local",
    });
    await c.db
      .insert(s.operationalUsers)
      .values({ userId: actor.id, role: actor.role });
    await c.db.insert(s.account).values({
      id: crypto.randomUUID(),
      userId: actor.id,
      accountId: actor.id,
      providerId: "credential",
      password,
    });
    if (actor.role !== "admin")
      await c.db
        .insert(s.branchMemberships)
        .values({ userId: actor.id, branchId, role: actor.role });
    await c.db.insert(s.attendanceParticipants).values({
      userId: actor.id,
      branchId,
      enabled: true,
      updatedBy: actors.admin.id,
    });
  }
  if (options.attendanceAccess) {
    for (const actor of Object.values(actors)) {
      actor.sessionId = `attendance-session-${actor.id}`;
      await c.db
        .insert(s.session)
        .values({
          id: actor.sessionId,
          userId: actor.id,
          token: crypto.randomUUID(),
          expiresAt: new Date(+attendanceNow + 365 * 86400000),
        });
    }
  }
  await c.db.insert(s.attendanceSettings).values({
    branchId,
    enabled: true,
    latitude: -26.83,
    longitude: -65.2,
    radiusMeters: 100,
    maxAccuracyMeters: 40,
    codeValidityMinutes: 10,
    requireStepUp: true,
    updatedBy: actors.admin.id,
  });
  return { ...c, actors, branchId };
}
