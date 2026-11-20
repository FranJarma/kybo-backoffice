import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { eq, and } from "drizzle-orm";
import * as s from "@/db/schema";
import {
  createAttendanceContext,
  attendanceNow as now,
  testIdentityConfig,
} from "./helpers/attendance";
import { runAttendanceCommand } from "@/modules/attendance/service";
import { previewAssignmentPeriod } from "@/modules/attendance/period-planning";

let c: Awaited<ReturnType<typeof createAttendanceContext>>;
let shiftId: string;
const execute = (
  command: unknown,
  requestId = crypto.randomUUID(),
  actor = c.actors.manager,
) => runAttendanceCommand(c.db, actor, requestId, command, now);
beforeAll(async () => {
  vi.stubEnv("BETTER_AUTH_SECRET", testIdentityConfig.secret);
  c = await createAttendanceContext();
  const shift = await execute({
    action: "saveShift",
    name: "Mañana",
    start: "09:00",
    end: "17:00",
    overnight: false,
    pauseMinutes: 30,
    active: true,
  });
  shiftId = shift.id;
}, 60000);
afterAll(async () => {
  await c?.close();
  vi.unstubAllEnvs();
});
const period = (from: string, to: string) => ({
  userId: c.actors.staff.id,
  shiftId,
  from,
  to,
  weekdays: [1, 2, 3, 4, 5, 6, 0],
});

it("preserves shifts, days off, punches and overnight overlaps; inserts only empty dates and replays safely", async () => {
  await execute({
    action: "assign",
    userId: c.actors.staff.id,
    businessDate: "2026-11-02",
    kind: "off",
  });
  await execute({
    action: "assign",
    userId: c.actors.staff.id,
    businessDate: "2026-11-03",
    kind: "work",
    shiftId,
  });
  await execute({
    action: "assign",
    userId: c.actors.staff.id,
    businessDate: "2026-11-04",
    kind: "work",
    name: "Noche",
    start: "23:00",
    end: "10:00",
    overnight: true,
    pauseMinutes: 30,
  });
  const [manual] = await c.db
    .insert(s.attendanceManualRequests)
    .values({
      branchId: c.branchId,
      userId: c.actors.staff.id,
      kind: "entry",
      occurredAt: new Date("2026-11-06T12:00:00Z"),
      reason: "Marca de prueba",
      requestedBy: c.actors.manager.id,
      status: "used",
      approvedBy: c.actors.admin.id,
    })
    .returning();
  await c.db.insert(s.attendanceEvents).values({
    id: crypto.randomUUID(),
    branchId: c.branchId,
    userId: c.actors.staff.id,
    businessDate: "2026-11-06",
    kind: "entry",
    source: "manual",
    manualRequestId: manual.id,
    occurredAt: new Date("2026-11-06T12:00:00Z"),
    recordedAt: now,
    recordedBy: c.actors.manager.id,
  });
  const input = period("2026-11-02", "2026-11-08");
  const preview = await previewAssignmentPeriod(c.db, c.actors.manager, input);
  expect(preview.rows.map((r) => r.status)).toEqual([
    "skipped",
    "skipped",
    "skipped",
    "skipped",
    "skipped",
    "available",
    "available",
  ]);
  expect(preview.rows[0].reason).toContain("Franco");
  expect(preview.rows[3].reason).toContain("superpone");
  expect(preview.rows[4].reason).toContain("fichajes");
  const requestId = crypto.randomUUID();
  const command = {
    action: "assignPeriod",
    ...input,
    expectedShiftRevision: preview.shift.revision,
  };
  const result = await execute(command, requestId);
  expect(result).toMatchObject({ created: 2, skipped: 5 });
  const replay = await execute(command, requestId);
  expect(replay).toMatchObject({
    id: result.id,
    created: 2,
    skipped: 5,
    replayed: true,
  });
  const rows = await c.db
    .select()
    .from(s.attendanceAssignments)
    .where(eq(s.attendanceAssignments.userId, c.actors.staff.id));
  expect(rows).toHaveLength(5);
  expect(rows.filter((r) => r.businessDate === "2026-11-02")).toHaveLength(1);
  const saturday = rows.find((r) => r.businessDate === "2026-11-07")!;
  expect(saturday.pauseMinutes).toBe(30);
  expect(saturday.startsAt!.toISOString()).toBe("2026-11-07T12:00:00.000Z");
  const audit = await c.db
    .select()
    .from(s.auditEvents)
    .where(
      and(
        eq(s.auditEvents.entity, "attendance_assignment"),
        eq(s.auditEvents.recordId, saturday.id),
      ),
    );
  expect(audit).toHaveLength(1);
});

it("rechecks dates occupied since the preview and reports the actual omissions", async () => {
  const input = period("2026-11-09", "2026-11-10");
  const preview = await previewAssignmentPeriod(c.db, c.actors.manager, input);
  expect(preview.rows.every((r) => r.status === "available")).toBe(true);
  await execute({
    action: "assign",
    userId: c.actors.staff.id,
    businessDate: "2026-11-10",
    kind: "off",
  });
  const result = await execute({
    action: "assignPeriod",
    ...input,
    expectedShiftRevision: preview.shift.revision,
  });
  expect(result).toMatchObject({
    created: 1,
    skipped: 1,
    rows: [
      expect.objectContaining({
        businessDate: "2026-11-09",
        status: "created",
      }),
      expect.objectContaining({
        businessDate: "2026-11-10",
        status: "skipped",
        reason: expect.stringContaining("Franco"),
      }),
    ],
  });
  const allOccupied = await execute({
    action: "assignPeriod",
    ...input,
    expectedShiftRevision: preview.shift.revision,
  });
  expect(allOccupied).toMatchObject({ created: 0, skipped: 2 });
});

it("serializes concurrent period confirmations without duplicating any date", async () => {
  const input = period("2026-11-23", "2026-11-25");
  const command = {
    action: "assignPeriod",
    ...input,
    expectedShiftRevision: 1,
  };
  const results = await Promise.all([execute(command), execute(command)]);
  expect(results.map((r) => r.created).sort()).toEqual([0, 3]);
  const rows = await c.db
    .select()
    .from(s.attendanceAssignments)
    .where(
      and(
        eq(s.attendanceAssignments.userId, c.actors.staff.id),
        eq(s.attendanceAssignments.businessDate, "2026-11-24"),
      ),
    );
  expect(rows).toHaveLength(1);
});

it("preserves another branch's overnight shift without revealing its name", async () => {
  const [branch] = await c.db
    .insert(s.branches)
    .values({
      name: "Otra sucursal privada",
      code: "OTHER-PERIOD-TEST",
      timeZone: "America/Argentina/Buenos_Aires",
    })
    .returning();
  await c.db.insert(s.attendanceAssignments).values({
    branchId: branch.id,
    userId: c.actors.staff.id,
    businessDate: "2026-11-29",
    kind: "work",
    name: "Nombre privado",
    startsAt: new Date("2026-11-30T02:00:00Z"),
    endsAt: new Date("2026-11-30T13:00:00Z"),
    pauseMinutes: 30,
    timeZone: branch.timeZone,
    updatedBy: c.actors.admin.id,
  });
  const preview = await previewAssignmentPeriod(
    c.db,
    c.actors.manager,
    period("2026-11-30", "2026-11-30"),
  );
  expect(preview.rows[0]).toMatchObject({
    status: "skipped",
    reason: "Se superpone con otro turno",
  });
  expect(JSON.stringify(preview)).not.toContain("privad");
});

it("rejects changed or inactive templates and leaves the entire period untouched", async () => {
  const input = period("2026-12-07", "2026-12-13");
  const preview = await previewAssignmentPeriod(c.db, c.actors.manager, input);
  await execute({
    action: "saveShift",
    id: shiftId,
    expectedRevision: 1,
    name: "Mañana actualizada",
    start: "10:00",
    end: "18:00",
    overnight: false,
    pauseMinutes: 30,
    active: true,
  });
  await expect(
    execute({
      action: "assignPeriod",
      ...input,
      expectedShiftRevision: preview.shift.revision,
    }),
  ).rejects.toThrow(/turno cambió/i);
  await execute({
    action: "saveShift",
    id: shiftId,
    expectedRevision: 2,
    name: "Mañana",
    start: "10:00",
    end: "18:00",
    overnight: false,
    pauseMinutes: 30,
    active: false,
  });
  await expect(
    previewAssignmentPeriod(c.db, c.actors.manager, input),
  ).rejects.toThrow(/turno activo/i);
  const rows = await c.db
    .select()
    .from(s.attendanceAssignments)
    .where(eq(s.attendanceAssignments.businessDate, "2026-12-07"));
  expect(rows).toHaveLength(0);
});

it("rejects staff, foreign branches and disabled participants for preview and confirmation", async () => {
  const input = period("2026-12-14", "2026-12-20");
  await expect(
    previewAssignmentPeriod(c.db, c.actors.staff, input),
  ).rejects.toThrow();
  await expect(
    execute(
      { action: "assignPeriod", ...input, expectedShiftRevision: 3 },
      crypto.randomUUID(),
      c.actors.staff,
    ),
  ).rejects.toThrow();
  await expect(
    previewAssignmentPeriod(
      c.db,
      { ...c.actors.manager, branchId: crypto.randomUUID() },
      input,
    ),
  ).rejects.toThrow();
  await c.db
    .update(s.attendanceParticipants)
    .set({ enabled: false })
    .where(eq(s.attendanceParticipants.userId, c.actors.staff.id));
  await expect(
    previewAssignmentPeriod(c.db, c.actors.manager, input),
  ).rejects.toThrow(/habilitado/i);
  await expect(
    execute({ action: "assignPeriod", ...input, expectedShiftRevision: 3 }),
  ).rejects.toThrow(/habilitado/i);
});
