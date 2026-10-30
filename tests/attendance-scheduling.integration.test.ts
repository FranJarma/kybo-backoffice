import { beforeAll, afterAll, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import {
  createAttendanceContext,
  attendanceNow as now,
  testIdentityConfig,
} from "./helpers/attendance";
import * as s from "@/db/schema";
import { runAttendanceCommand } from "@/modules/attendance/service";
import { getAttendanceSnapshot } from "@/modules/attendance/queries";
import type { Actor } from "@/lib/access";
let c: Awaited<ReturnType<typeof createAttendanceContext>>,
  shiftId: string,
  assignmentId: string;
const cmd = (data: unknown, actor?: Actor) =>
  runAttendanceCommand(
    c.db,
    actor ?? c.actors.manager,
    crypto.randomUUID(),
    data,
    now,
  );
beforeAll(async () => {
  vi.stubEnv("BETTER_AUTH_SECRET", testIdentityConfig.secret);
  c = await createAttendanceContext();
}, 60000);
afterAll(async () => {
  await c?.close();
  vi.unstubAllEnvs();
});
it("offers both the previous overnight shift and today's shift before an entry after midnight", async () => {
  const night = await cmd({
    action: "assign",
    userId: c.actors.otherAdmin.id,
    businessDate: "2026-10-29",
    kind: "work",
    name: "Nocturno",
    start: "23:00",
    end: "02:00",
    overnight: true,
    pauseMinutes: 30,
    reason: "",
  });
  const day = await cmd({
    action: "assign",
    userId: c.actors.otherAdmin.id,
    businessDate: "2026-10-30",
    kind: "work",
    name: "Mañana",
    start: "09:00",
    end: "17:00",
    overnight: false,
    pauseMinutes: 30,
    reason: "",
  });
  const snapshot = await getAttendanceSnapshot(
    c.db,
    c.actors.otherAdmin,
    {},
    new Date("2026-10-30T03:30:00Z"),
  );
  expect(snapshot.entryAssignments.map((a) => a.id).sort()).toEqual(
    [night.id, day.id].sort(),
  );
});
it("lets a manager create configurable morning/evening shifts while preventing staff changes", async () => {
  const data = {
    action: "saveShift",
    name: "Mañana",
    start: "09:00",
    end: "17:00",
    overnight: false,
    pauseMinutes: 30,
    active: true,
  };
  await expect(cmd(data, c.actors.staff)).rejects.toThrow();
  const result = await cmd(data);
  shiftId = result.id;
  await cmd({ ...data, name: "Tarde", start: "17:00", end: "23:00" });
  await expect(cmd({ ...data, pauseMinutes: 480 })).rejects.toThrow();
});
it("copies a shift snapshot to a person/date and requires current revisions", async () => {
  const result = await cmd({
    action: "assign",
    userId: c.actors.staff.id,
    businessDate: "2026-11-02",
    kind: "work",
    shiftId,
  });
  assignmentId = result.id;
  const snapshot = await getAttendanceSnapshot(
    c.db,
    c.actors.manager,
    { from: "2026-11-02", to: "2026-11-08" },
    now,
  );
  expect(snapshot.assignments[0]).toMatchObject({
    name: "Mañana",
    pauseMinutes: 30,
    startsAt: "2026-11-02T12:00:00.000Z",
    endsAt: "2026-11-02T20:00:00.000Z",
    revision: 1,
  });
  await cmd({
    action: "saveShift",
    id: shiftId,
    expectedRevision: 1,
    name: "Mañana extendida",
    start: "08:00",
    end: "17:00",
    overnight: false,
    pauseMinutes: 45,
    active: true,
  });
  const [original] = await c.db
    .select()
    .from(s.attendanceAssignments)
    .where(eq(s.attendanceAssignments.id, assignmentId));
  expect(original.pauseMinutes).toBe(30);
  expect(original.name).toBe("Mañana");
  await expect(
    cmd({
      action: "saveShift",
      id: shiftId,
      expectedRevision: 1,
      name: "Stale",
      start: "09:00",
      end: "17:00",
      overnight: false,
      pauseMinutes: 30,
      active: true,
    }),
  ).rejects.toThrow();
});
it("prevents overlapping work and off-days, and permits adjacent spans", async () => {
  const base = {
    action: "assign",
    userId: c.actors.staff.id,
    businessDate: "2026-11-02",
    kind: "work",
    start: "16:00",
    end: "20:00",
    overnight: false,
    pauseMinutes: 0,
    name: "Particular",
  };
  await expect(cmd(base)).rejects.toThrow();
  await expect(
    cmd({
      action: "assign",
      userId: c.actors.staff.id,
      businessDate: "2026-11-02",
      kind: "off",
    }),
  ).rejects.toThrow();
  await cmd({ ...base, start: "17:00" });
  await cmd({
    action: "assign",
    userId: c.actors.staff.id,
    businessDate: "2026-11-03",
    kind: "off",
  });
  await expect(cmd({ ...base, businessDate: "2026-11-03" })).rejects.toThrow();
});
it("detects overlap across midnight and preserves a declared overnight schedule", async () => {
  const data = {
    action: "assign",
    userId: c.actors.manager.id,
    businessDate: "2026-11-02",
    kind: "work",
    name: "Nocturno",
    start: "23:00",
    end: "02:00",
    overnight: true,
    pauseMinutes: 30,
  };
  await cmd(data);
  await expect(
    cmd({
      ...data,
      businessDate: "2026-11-03",
      start: "01:00",
      end: "04:00",
      overnight: false,
    }),
  ).rejects.toThrow();
});
it("copies a week only into empty dates and does not overwrite a preassigned target", async () => {
  await cmd({
    action: "assign",
    userId: c.actors.staff.id,
    businessDate: "2026-11-09",
    kind: "off",
  });
  const result = await cmd({
    action: "copyWeek",
    sourceMonday: "2026-11-02",
    targetMonday: "2026-11-09",
  });
  expect(result.copied).toBeGreaterThan(0);
  const snapshot = await getAttendanceSnapshot(c.db, c.actors.manager, {
    from: "2026-11-09",
    to: "2026-11-15",
  });
  expect(
    snapshot.assignments.filter(
      (a) => a.userId === c.actors.staff.id && a.businessDate === "2026-11-09",
    ),
  ).toHaveLength(1);
  expect(
    snapshot.assignments.find(
      (a) => a.userId === c.actors.staff.id && a.businessDate === "2026-11-09",
    )?.kind,
  ).toBe("off");
  expect(
    (
      await cmd({
        action: "copyWeek",
        sourceMonday: "2026-11-02",
        targetMonday: "2026-11-09",
      })
    ).copied,
  ).toBe(0);
});
it("restricts branch policies and participation to Administration", async () => {
  const data = {
    action: "configure",
    expectedRevision: 1,
    enabled: true,
    latitude: -26.83,
    longitude: -65.2,
    radiusMeters: 80,
    maxAccuracyMeters: 30,
    codeValidityMinutes: 25,
    requireStepUp: true,
  };
  await expect(cmd(data)).rejects.toThrow();
  await cmd(data, c.actors.admin);
  await expect(cmd(data, c.actors.admin)).rejects.toThrow();
  await expect(
    cmd(
      { ...data, expectedRevision: 2, codeValidityMinutes: 0 },
      c.actors.admin,
    ),
  ).rejects.toThrow();
  await expect(
    cmd({ action: "participant", userId: c.actors.staff.id, enabled: false }),
  ).rejects.toThrow();
  await cmd(
    { action: "participant", userId: c.actors.staff.id, enabled: false },
    c.actors.admin,
  );
  expect(
    (await getAttendanceSnapshot(c.db, c.actors.staff)).people[0].enabled,
  ).toBe(false);
  await cmd(
    { action: "participant", userId: c.actors.staff.id, enabled: true },
    c.actors.admin,
  );
});
it("requires a reason to edit a planned day after punches and keeps original events immutable", async () => {
  const request = await cmd({
    action: "requestManual",
    userId: c.actors.staff.id,
    kind: "entry",
    localTime: "2026-10-29T09:00",
    reason: "Sin teléfono",
  });
  await cmd(
    { action: "approveManual", id: request.id, reason: "" },
    c.actors.admin,
  );
  // Seed an already-authorized original to isolate correction/scheduling behavior.
  await c.db.insert(s.attendanceEvents).values({
    branchId: c.branchId,
    userId: c.actors.staff.id,
    kind: "entry",
    occurredAt: new Date("2026-10-29T12:00:00Z"),
    recordedAt: now,
    businessDate: "2026-10-29",
    source: "manual",
    manualRequestId: request.id,
    recordedBy: c.actors.manager.id,
  });
  const data = {
    action: "assign",
    userId: c.actors.staff.id,
    businessDate: "2026-10-29",
    kind: "work",
    shiftId,
  };
  await expect(cmd(data)).rejects.toThrow();
  await cmd({
    ...data,
    reason: "Se agregó el horario luego de revisar el ingreso.",
  });
});
it("preserves original punches and requires a reason for correction approval/rejection", async () => {
  const [original] = await c.db
    .select()
    .from(s.attendanceEvents)
    .where(eq(s.attendanceEvents.userId, c.actors.staff.id));
  const correction = await cmd(
    {
      action: "requestCorrection",
      userId: c.actors.staff.id,
      changes: [{ eventId: original.id, occurredAt: "2026-10-29T12:05:00Z" }],
      reason: "Informé cinco minutos antes.",
    },
    c.actors.staff,
  );
  await expect(
    cmd({
      action: "resolveCorrection",
      id: correction.id,
      approve: true,
      reason: "",
    }),
  ).rejects.toThrow();
  await cmd({
    action: "resolveCorrection",
    id: correction.id,
    approve: true,
    reason: "Contrasté la hora con el equipo.",
  });
  const snapshot = await getAttendanceSnapshot(c.db, c.actors.staff);
  expect(snapshot.events[0]).toMatchObject({
    occurredAt: "2026-10-29T12:05:00.000Z",
    originalOccurredAt: "2026-10-29T12:00:00.000Z",
  });
  const [unchanged] = await c.db
    .select()
    .from(s.attendanceEvents)
    .where(eq(s.attendanceEvents.id, original.id));
  expect(unchanged.occurredAt.toISOString()).toBe("2026-10-29T12:00:00.000Z");
  await expect(
    cmd(
      {
        action: "requestCorrection",
        userId: c.actors.manager.id,
        changes: [{ eventId: original.id, occurredAt: null }],
        reason: "Intento ajeno",
      },
      c.actors.staff,
    ),
  ).rejects.toThrow();
});
it("links an unplanned entry to its assigned shift without altering the original punch", async () => {
  const [original] = await c.db
    .select()
    .from(s.attendanceEvents)
    .where(eq(s.attendanceEvents.userId, c.actors.staff.id));
  const [assignment] = (
    await c.db.select().from(s.attendanceAssignments)
  ).filter(
    (a) => a.userId === c.actors.staff.id && a.businessDate === "2026-10-29",
  );
  await cmd({
    action: "linkAssignment",
    entryId: original.id,
    assignmentId: assignment.id,
    reason: "Vinculé la jornada planificada.",
  });
  expect(
    (await getAttendanceSnapshot(c.db, c.actors.staff)).events[0].assignmentId,
  ).toBe(assignment.id);
  expect(
    (
      await c.db
        .select()
        .from(s.attendanceEvents)
        .where(eq(s.attendanceEvents.id, original.id))
    )[0].assignmentId,
  ).toBeNull();
});
it("prevents a manager from approving their own correction", async () => {
  const manual = await cmd({
    action: "requestManual",
    userId: c.actors.manager.id,
    kind: "entry",
    localTime: "2026-10-29T09:00",
    reason: "Sin batería",
  });
  await c.db.insert(s.attendanceEvents).values({
    branchId: c.branchId,
    userId: c.actors.manager.id,
    kind: "entry",
    occurredAt: new Date("2026-10-29T12:00:00Z"),
    recordedAt: now,
    businessDate: "2026-10-29",
    source: "manual",
    manualRequestId: manual.id,
    recordedBy: c.actors.manager.id,
  });
  const [original] = await c.db
    .select()
    .from(s.attendanceEvents)
    .where(eq(s.attendanceEvents.userId, c.actors.manager.id));
  const correction = await cmd({
    action: "requestCorrection",
    userId: c.actors.manager.id,
    changes: [{ eventId: original.id, occurredAt: "2026-10-29T12:03:00Z" }],
    reason: "Ajuste solicitado",
  });
  await expect(
    cmd({
      action: "resolveCorrection",
      id: correction.id,
      approve: true,
      reason: "Confirmado",
    }),
  ).rejects.toThrow();
  await cmd(
    {
      action: "resolveCorrection",
      id: correction.id,
      approve: true,
      reason: "Confirmado por Administración",
    },
    c.actors.admin,
  );
});
