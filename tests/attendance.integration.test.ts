import { beforeAll, afterAll, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import {
  createAttendanceContext,
  attendanceNow as now,
  testIdentityConfig as config,
} from "./helpers/attendance";
import { testAuthenticator } from "./helpers/test-authenticator";
import * as s from "@/db/schema";
import {
  beginVerification,
  finishVerification,
} from "@/modules/identity/service";
import { runAttendanceCommand } from "@/modules/attendance/service";
import { getAttendanceSnapshot } from "@/modules/attendance/queries";
import { localSchedule } from "@/modules/production/schedule-time";
import type { Actor } from "@/lib/access";
import { AttendanceAttempts } from "@/components/attendance/attempts";
import { issueAttendanceQr } from "@/modules/attendance/qr-token";
import { openAttendanceQrAttempt } from "@/modules/attendance/qr";
let c: Awaited<ReturnType<typeof createAttendanceContext>>;
const staffKey = testAuthenticator(),
  managerKey = testAuthenticator();
const at = (minutes = 0) => new Date(now.getTime() + minutes * 60000);
const location = (time = now) => ({
  latitude: -26.83,
  longitude: -65.2,
  accuracy: 12,
  measuredAt: time.toISOString(),
});
const command = (
  actor: Actor,
  data: unknown,
  time = now,
  requestId = crypto.randomUUID(),
) => runAttendanceCommand(c.db, actor, requestId, data, time);
async function signedPunch(
  actor: Actor,
  kind: string,
  time = now,
  options: Record<string, unknown> = {},
  requestId = crypto.randomUUID(),
) {
  const payload = {
    action: "punch",
    kind,
    qrAttemptId: (
      await openAttendanceQrAttempt(
        c.db,
        actor,
        {
          code: issueAttendanceQr(c.branchId, 1, config.secret, time).code,
          requestId: crypto.randomUUID(),
        },
        time,
      )
    ).id,
    location: location(time),
    ...options,
  };
  const start = await beginVerification(
    c.db,
    actor,
    { action: "attendance-punch", branchId: c.branchId, requestId, payload },
    config,
    time,
  );
  const key = actor.id === c.actors.staff.id ? staffKey : managerKey;
  const proof = await finishVerification(
    c.db,
    actor,
    {
      challengeId: start.challengeId,
      response: key.assertion(start.options.challenge),
    },
    config,
    time,
  );
  return { requestId, data: { ...payload, verificationId: proof.proofId } };
}
beforeAll(async () => {
  vi.stubEnv("BETTER_AUTH_SECRET", config.secret);
  c = await createAttendanceContext(undefined, { attendanceAccess: true });
  for (const [actor, key] of [
    [c.actors.staff, staffKey],
    [c.actors.manager, managerKey],
  ] as const)
    await c.db.insert(s.identityCredentials).values({
      id: key.id,
      userId: actor.id,
      rpId: config.rpId,
      publicKey: key.publicKey,
      counter: 0,
      name: "Test phone",
      transports: ["internal"],
      deviceType: "singleDevice",
      backedUp: false,
    });
}, 60000);
afterAll(async () => {
  await c?.close();
  vi.unstubAllEnvs();
});
it("records only verified own punches and measures pauses without inventing an exit", async () => {
  await expect(
    command(c.actors.staff, {
      action: "punch",
      kind: "entry",
      location: location(),
    }),
  ).rejects.toThrow();
  for (const [kind, minutes] of [
    ["entry", 0],
    ["pause", 60],
    ["resume", 90],
    ["exit", 120],
  ] as const) {
    const signed = await signedPunch(c.actors.staff, kind, at(minutes));
    await command(c.actors.staff, signed.data, at(minutes), signed.requestId);
  }
  const snapshot = await getAttendanceSnapshot(
    c.db,
    c.actors.staff,
    {},
    at(120),
  );
  expect(snapshot.events).toHaveLength(4);
  expect(snapshot.current.state).toBe("out");
  expect(snapshot.totals[c.actors.staff.id]).toMatchObject({
    presenceMinutes: 120,
    pauseMinutes: 30,
    netMinutes: 90,
    provisional: false,
  });
  expect(snapshot.people.map((p) => p.id)).toEqual([c.actors.staff.id]);
  expect(JSON.stringify(snapshot)).not.toMatch(
    /publicKey|codeHash|codeCipher|password/,
  );
  await expect(
    c.client.query("update attendance_events set kind='entry'"),
  ).rejects.toThrow(/inmutables/);
});
it("replays an accepted operation without consuming twice, and rechecks current participation", async () => {
  const signed = await signedPunch(c.actors.manager, "entry");
  const first = await command(
    c.actors.manager,
    signed.data,
    now,
    signed.requestId,
  );
  expect(
    await command(c.actors.manager, signed.data, at(3), signed.requestId),
  ).toMatchObject({ id: first.id, replayed: true });
  expect(
    await command(
      c.actors.manager,
      { ...signed.data, location: location(at(4)) },
      at(4),
      signed.requestId,
    ),
  ).toMatchObject({ id: first.id, replayed: true });
  await expect(
    command(
      c.actors.manager,
      { ...signed.data, kind: "exit" },
      at(3),
      signed.requestId,
    ),
  ).rejects.toThrow();
  await c.db
    .update(s.attendanceParticipants)
    .set({ enabled: false })
    .where(eq(s.attendanceParticipants.userId, c.actors.manager.id));
  await expect(
    command(c.actors.manager, signed.data, at(3), signed.requestId),
  ).rejects.toThrow();
  await c.db
    .update(s.attendanceParticipants)
    .set({ enabled: true })
    .where(eq(s.attendanceParticipants.userId, c.actors.manager.id));
  const rows = await c.db
    .select()
    .from(s.attendanceEvents)
    .where(eq(s.attendanceEvents.userId, c.actors.manager.id));
  expect(rows).toHaveLength(1);
});
it("rejects outside/stale/altered evidence and rejects extra employee impersonation fields", async () => {
  const signed = await signedPunch(c.actors.staff, "entry", at(130), {
    location: { ...location(at(130)), latitude: -26.82 },
  });
  await expect(
    command(c.actors.staff, signed.data, at(130), signed.requestId),
  ).rejects.toThrow();
  await expect(
    command(
      c.actors.staff,
      { ...signed.data, location: location(at(130)) },
      at(130),
      signed.requestId,
    ),
  ).rejects.toThrow();
  await expect(
    command(c.actors.staff, {
      action: "punch",
      kind: "entry",
      location: location(),
      userId: c.actors.manager.id,
    }),
  ).rejects.toThrow();
});
it("requires independent admin approval before a requester may use the private one-time code", async () => {
  const data = {
    action: "requestManual",
    userId: c.actors.staff.id,
    kind: "entry",
    localTime: localSchedule(
      at(180).toISOString(),
      "America/Argentina/Buenos_Aires",
    ),
    reason: "Celular sin batería",
  };
  await expect(command(c.actors.staff, data, at(180))).rejects.toThrow();
  const request = await command(c.actors.manager, data, at(180));
  await expect(
    command(
      c.actors.manager,
      { action: "approveManual", id: request.id, reason: "" },
      at(240),
    ),
  ).rejects.toThrow();
  await expect(
    command(
      c.actors.manager,
      { action: "redeemManual", id: request.id, code: "123456" },
      at(240),
    ),
  ).rejects.toThrow();
  const before = await getAttendanceSnapshot(
    c.db,
    c.actors.manager,
    {},
    at(240),
  );
  expect(
    before.manualRequests.find((r) => r.id === request.id)?.code,
  ).toBeUndefined();
  await command(
    c.actors.admin,
    { action: "approveManual", id: request.id, reason: "" },
    at(240),
  );
  const owner = await getAttendanceSnapshot(
    c.db,
    c.actors.manager,
    {},
    at(241),
  );
  const code = owner.manualRequests.find((r) => r.id === request.id)!.code!;
  expect(code).toMatch(/^\d{6}$/);
  expect(
    (
      await getAttendanceSnapshot(c.db, c.actors.admin, {}, at(241))
    ).manualRequests.find((r) => r.id === request.id)?.code,
  ).toBeUndefined();
  await expect(
    command(
      c.actors.admin,
      { action: "redeemManual", id: request.id, code },
      at(241),
    ),
  ).rejects.toThrow();
  const id = crypto.randomUUID();
  const result = await command(
    c.actors.manager,
    { action: "redeemManual", id: request.id, code },
    at(241),
    id,
  );
  expect(
    await command(
      c.actors.manager,
      { action: "redeemManual", id: request.id, code },
      at(242),
      id,
    ),
  ).toMatchObject({ id: result.id, replayed: true });
  await expect(
    command(
      c.actors.manager,
      { action: "redeemManual", id: request.id, code },
      at(242),
    ),
  ).rejects.toThrow();
  const [row] = await c.db
    .select()
    .from(s.attendanceEvents)
    .where(eq(s.attendanceEvents.manualRequestId, request.id as string));
  expect(row.occurredAt.toISOString()).toBe(at(180).toISOString());
  expect(row.recordedAt.toISOString()).toBe(at(241).toISOString());
  expect(row).toMatchObject({
    source: "manual",
    recordedBy: c.actors.manager.id,
    credentialId: null,
    evidence: null,
  });
});
it("uses the branch TTL at approval and never extends an existing code after configuration changes", async () => {
  const result = await command(c.actors.manager, {
    action: "requestManual",
    userId: c.actors.otherAdmin.id,
    kind: "entry",
    localTime: localSchedule(
      now.toISOString(),
      "America/Argentina/Buenos_Aires",
    ),
    reason: "Equipo incompatible",
  });
  await command(c.actors.admin, {
    action: "approveManual",
    id: result.id,
    reason: "",
  });
  await c.db
    .update(s.attendanceSettings)
    .set({ codeValidityMinutes: 25 })
    .where(eq(s.attendanceSettings.branchId, c.branchId));
  const request = (
    await getAttendanceSnapshot(c.db, c.actors.manager, {}, at(11))
  ).manualRequests.find((r) => r.id === result.id)!;
  expect(request).toMatchObject({ status: "expired", validityMinutes: 10 });
  expect(request.code).toBeUndefined();
  await expect(
    command(
      c.actors.manager,
      { action: "redeemManual", id: result.id, code: "000000" },
      at(11),
    ),
  ).rejects.toThrow();
});
it("persists incorrect-code attempts and requires a new approval after five failures", async () => {
  const result = await command(c.actors.manager, {
    action: "requestManual",
    userId: c.actors.otherAdmin.id,
    kind: "entry",
    localTime: localSchedule(
      now.toISOString(),
      "America/Argentina/Buenos_Aires",
    ),
    reason: "Sin teléfono",
  });
  await command(c.actors.admin, {
    action: "approveManual",
    id: result.id,
    reason: "",
  });
  const code = (
    await getAttendanceSnapshot(c.db, c.actors.manager, {})
  ).manualRequests.find((r) => r.id === result.id)!.code!;
  const wrong = code === "000000" ? "999999" : "000000";
  for (let i = 0; i < 5; i++)
    await expect(
      command(c.actors.manager, {
        action: "redeemManual",
        id: result.id,
        code: wrong,
      }),
    ).rejects.toThrow();
  await expect(
    command(c.actors.manager, { action: "redeemManual", id: result.id, code }),
  ).rejects.toThrow();
  const [row] = await c.db
    .select()
    .from(s.attendanceManualRequests)
    .where(eq(s.attendanceManualRequests.id, result.id as string));
  expect(row).toMatchObject({ status: "locked", failedAttempts: 5 });
});
it("does not permit a global administrator to approve their own exception", async () => {
  const request = await command(c.actors.admin, {
    action: "requestManual",
    userId: c.actors.otherAdmin.id,
    kind: "entry",
    localTime: localSchedule(
      now.toISOString(),
      "America/Argentina/Buenos_Aires",
    ),
    reason: "Excepción supervisada",
  });
  await expect(
    command(c.actors.admin, {
      action: "approveManual",
      id: request.id,
      reason: "",
    }),
  ).rejects.toThrow();
  await command(c.actors.otherAdmin, {
    action: "approveManual",
    id: request.id,
    reason: "",
  });
});
it("lets administration configure participation for an administrator without a membership", async () => {
  await c.db
    .delete(s.attendanceParticipants)
    .where(eq(s.attendanceParticipants.userId, c.actors.otherAdmin.id));
  const snapshot = await getAttendanceSnapshot(c.db, c.actors.admin);
  expect(
    snapshot.people.find((p) => p.id === c.actors.otherAdmin.id),
  ).toMatchObject({ enabled: false, active: true });
});
it("keeps an open overnight journal visible even when the selected period starts today", async () => {
  const nightKey = testAuthenticator();
  await c.db.insert(s.identityCredentials).values({
    id: nightKey.id,
    userId: c.actors.otherAdmin.id,
    rpId: config.rpId,
    publicKey: nightKey.publicKey,
    counter: 0,
    name: "Night",
    deviceType: "singleDevice",
    backedUp: false,
  });
  await c.db.insert(s.attendanceEvents).values({
    branchId: c.branchId,
    userId: c.actors.otherAdmin.id,
    kind: "entry",
    occurredAt: new Date("2026-10-29T01:00:00Z"),
    businessDate: "2026-10-28",
    source: "phone",
    credentialId: nightKey.id,
    evidence: {},
    recordedBy: c.actors.otherAdmin.id,
  });
  const snapshot = await getAttendanceSnapshot(
    c.db,
    c.actors.otherAdmin,
    {},
    new Date("2026-10-29T04:00:00Z"),
  );
  expect(
    snapshot.events.filter((e) => e.userId === c.actors.otherAdmin.id),
  ).toHaveLength(0);
  expect(snapshot.ownJournal).toMatchObject({
    businessDate: "2026-10-28",
    total: { netMinutes: 180, provisional: true },
  });
  expect(snapshot.ownJournal.events).toHaveLength(1);
});
it("keeps a declared entry pending until an older open span is regularized", async () => {
  const request = await command(
    c.actors.admin,
    {
      action: "requestManual",
      userId: c.actors.manager.id,
      kind: "entry",
      localTime: localSchedule(
        at(10).toISOString(),
        "America/Argentina/Buenos_Aires",
      ),
      reason: "Olvido de salida anterior; nueva entrada declarada",
    },
    at(10),
  );
  await command(
    c.actors.otherAdmin,
    { action: "approveManual", id: request.id, reason: "" },
    at(11),
  );
  const code = (
    await getAttendanceSnapshot(c.db, c.actors.admin, {}, at(11))
  ).manualRequests.find((r) => r.id === request.id)!.code!;
  await expect(
    command(
      c.actors.admin,
      { action: "redeemManual", id: request.id, code },
      at(11),
    ),
  ).rejects.toThrow();
  const exit = await command(
    c.actors.admin,
    {
      action: "requestManual",
      userId: c.actors.manager.id,
      kind: "exit",
      localTime: localSchedule(
        at(5).toISOString(),
        "America/Argentina/Buenos_Aires",
      ),
      reason: "Regularización de la salida anterior",
    },
    at(12),
  );
  await command(
    c.actors.otherAdmin,
    { action: "approveManual", id: exit.id, reason: "" },
    at(12),
  );
  const exitCode = (
    await getAttendanceSnapshot(c.db, c.actors.admin, {}, at(12))
  ).manualRequests.find((r) => r.id === exit.id)!.code!;
  await command(
    c.actors.admin,
    { action: "redeemManual", id: exit.id, code: exitCode },
    at(13),
  );
  await command(
    c.actors.admin,
    { action: "redeemManual", id: request.id, code },
    at(14),
  );
  expect(
    (await getAttendanceSnapshot(c.db, c.actors.manager, {}, at(14))).current
      .state,
  ).toBe("working");
});
it("keeps the attendance screen available if an older private code cannot be decrypted", async () => {
  vi.stubEnv(
    "BETTER_AUTH_SECRET",
    "rotated-test-only-secret-at-least-32-characters",
  );
  try {
    const snapshot = await getAttendanceSnapshot(c.db, c.actors.admin, {}, now);
    expect(snapshot.manualRequests.some((r) => r.codeUnavailable)).toBe(true);
  } finally {
    vi.stubEnv("BETTER_AUTH_SECRET", config.secret);
  }
});
it("records a second real pause after a lost response and an intervening resume", async () => {
  const attempts = new AttendanceAttempts(),
    actor = c.actors.manager;
  const firstSnapshot = await getAttendanceSnapshot(c.db, actor, {}, at(14));
  const pause = { action: "punch", kind: "pause" };
  const firstId = attempts.begin(
    pause,
    firstSnapshot.ownJournal.events.at(-1)!.id,
  );
  const first = await signedPunch(actor, "pause", at(15), {}, firstId);
  await command(actor, first.data, at(15), firstId); // The client never receives this success.
  const resume = await signedPunch(actor, "resume", at(16));
  await command(actor, resume.data, at(16), resume.requestId);
  const refreshed = await getAttendanceSnapshot(c.db, actor, {}, at(16));
  const secondId = attempts.begin(
    pause,
    refreshed.ownJournal.events.at(-1)!.id,
  );
  expect(secondId).not.toBe(firstId);
  const second = await signedPunch(actor, "pause", at(17), {}, secondId);
  await command(actor, second.data, at(17), secondId);
  const result = await getAttendanceSnapshot(c.db, actor, {}, at(17));
  expect(result.current.state).toBe("pause");
  expect(
    result.events.filter((e) => e.userId === actor.id && e.kind === "pause"),
  ).toHaveLength(2);
});
