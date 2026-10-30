import { beforeAll, afterAll, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import {
  createAttendanceContext,
  attendanceNow as now,
  testIdentityConfig as config,
} from "./helpers/attendance";
import { attendanceSettings, attendanceParticipants } from "@/db/schema";
import { issueAttendanceQr } from "@/modules/attendance/qr-token";
import {
  openAttendanceQrAttempt,
  consumeAttendanceQrAttempt,
} from "@/modules/attendance/qr";
import { runAttendanceCommand } from "@/modules/attendance/service";

let c: Awaited<ReturnType<typeof createAttendanceContext>>;
beforeAll(async () => {
  vi.stubEnv("BETTER_AUTH_SECRET", config.secret);
  c = await createAttendanceContext(undefined, { attendanceAccess: true });
}, 60000);
afterAll(async () => {
  await c?.close();
  vi.unstubAllEnvs();
});
const code = () => issueAttendanceQr(c.branchId, 1, config.secret, now).code;
const open = (actor = c.actors.staff, requestId = crypto.randomUUID()) =>
  openAttendanceQrAttempt(c.db, actor, { code: code(), requestId }, now);
const use = (id: string, actor = c.actors.staff, time = now) =>
  c.db.transaction((tx) =>
    consumeAttendanceQrAttempt(tx, actor, id, crypto.randomUUID(), 1, time),
  );
it("lets several people open the same QR but consumes each personal attempt only once", async () => {
  const a = await open(),
    b = await open(c.actors.manager);
  expect(a.id).not.toBe(b.id);
  expect(a.expiresAt).toBe(new Date(+now + 120000).toISOString());
  await use(a.id);
  await expect(use(a.id)).rejects.toThrow(/usó|utilizado|nuevo/i);
  await use(b.id, c.actors.manager);
});
it("binds attempts to session, account, branch and policy, and rejects exact expiry", async () => {
  const a = await open();
  await expect(use(a.id, c.actors.manager)).rejects.toThrow();
  await expect(
    use(a.id, { ...c.actors.staff, sessionId: "another-session" }),
  ).rejects.toThrow();
  await expect(
    use(a.id, { ...c.actors.staff, branchId: crypto.randomUUID() }),
  ).rejects.toThrow();
  await expect(
    use(a.id, c.actors.staff, new Date(+now + 120000)),
  ).rejects.toThrow(/venció/i);
  await c.db
    .update(attendanceSettings)
    .set({ revision: 2 })
    .where(eq(attendanceSettings.branchId, c.branchId));
  await expect(
    c.db.transaction((tx) =>
      consumeAttendanceQrAttempt(
        tx,
        c.actors.staff,
        a.id,
        crypto.randomUUID(),
        2,
        now,
      ),
    ),
  ).rejects.toThrow();
  await expect(open()).rejects.toThrow();
  await c.db
    .update(attendanceSettings)
    .set({ revision: 1 })
    .where(eq(attendanceSettings.branchId, c.branchId));
});
it("rechecks participation and live session, with idempotent attempt creation", async () => {
  const requestId = crypto.randomUUID();
  const a = await open(c.actors.staff, requestId);
  expect((await open(c.actors.staff, requestId)).id).toBe(a.id);
  await c.db
    .update(attendanceParticipants)
    .set({ enabled: false })
    .where(eq(attendanceParticipants.userId, c.actors.staff.id));
  await expect(open()).rejects.toThrow();
  await c.db
    .update(attendanceParticipants)
    .set({ enabled: true })
    .where(eq(attendanceParticipants.userId, c.actors.staff.id));
  await expect(
    open({ ...c.actors.staff, sessionId: undefined }),
  ).rejects.toThrow();
});
it("rejects the old punch path without a QR before accepting a phone verification", async () => {
  await expect(
    runAttendanceCommand(
      c.db,
      c.actors.staff,
      crypto.randomUUID(),
      {
        action: "punch",
        kind: "entry",
        location: {
          latitude: -26.83,
          longitude: -65.2,
          accuracy: 12,
          measuredAt: now.toISOString(),
        },
      },
      now,
    ),
  ).rejects.toThrow();
});
