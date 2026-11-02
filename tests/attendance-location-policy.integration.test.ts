import { beforeAll, afterAll, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import {
  createAttendanceContext,
  attendanceNow as now,
  testIdentityConfig as config,
} from "./helpers/attendance";
import { testAuthenticator } from "./helpers/test-authenticator";
import * as s from "@/db/schema";
import { getAttendancePolicy } from "@/modules/attendance/access";
import { getAttendanceSnapshot } from "@/modules/attendance/queries";
import { runAttendanceCommand } from "@/modules/attendance/service";
import {
  beginVerification,
  finishVerification,
} from "@/modules/identity/service";
import { issueAttendanceQr } from "@/modules/attendance/qr-token";
import { openAttendanceQrAttempt } from "@/modules/attendance/qr";

let c: Awaited<ReturnType<typeof createAttendanceContext>>;
const key = testAuthenticator();
const location = {
  latitude: -26.83,
  longitude: -65.2,
  accuracy: 12,
  measuredAt: now.toISOString(),
};
const run = (
  raw: unknown,
  actor = c.actors.admin,
  requestId = crypto.randomUUID(),
) => runAttendanceCommand(c.db, actor, requestId, raw, now);
async function configure(requireLocation: boolean, actor = c.actors.admin) {
  const policy = await getAttendancePolicy(c.db, c.branchId);
  return run(
    {
      action: "configure",
      expectedRevision: policy.revision,
      enabled: true,
      latitude: policy.latitude,
      longitude: policy.longitude,
      radiusMeters: 100,
      maxAccuracyMeters: 40,
      codeValidityMinutes: 10,
      requireStepUp: false,
      requireLocation,
    },
    actor,
  );
}
async function signed(kind: "entry" | "exit", point: typeof location | null) {
  const policy = await getAttendancePolicy(c.db, c.branchId);
  const qr = await openAttendanceQrAttempt(
    c.db,
    c.actors.staff,
    {
      code: issueAttendanceQr(c.branchId, policy.revision, config.secret, now)
        .code,
      requestId: crypto.randomUUID(),
    },
    now,
  );
  const requestId = crypto.randomUUID();
  const payload = {
    action: "punch",
    kind,
    qrAttemptId: qr.id,
    location: point,
  };
  const challenge = await beginVerification(
    c.db,
    c.actors.staff,
    { action: "attendance-punch", branchId: c.branchId, requestId, payload },
    config,
    now,
  );
  const proof = await finishVerification(
    c.db,
    c.actors.staff,
    {
      challengeId: challenge.challengeId,
      response: key.assertion(challenge.options.challenge),
    },
    config,
    now,
  );
  return { requestId, command: { ...payload, verificationId: proof.proofId } };
}
beforeAll(async () => {
  vi.stubEnv("BETTER_AUTH_SECRET", config.secret);
  c = await createAttendanceContext(undefined, { attendanceAccess: true });
  await c.db
    .insert(s.identityCredentials)
    .values({
      id: key.id,
      userId: c.actors.staff.id,
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

it("requires proximity by default and exposes it in the branch snapshot", async () => {
  expect(await getAttendancePolicy(c.db, c.branchId)).toMatchObject({
    requireLocation: true,
  });
  expect(
    (await getAttendanceSnapshot(c.db, c.actors.admin, {}, now)).settings,
  ).toMatchObject({ requireLocation: true });
});
it("allows only administrators to change proximity and keeps each branch independent", async () => {
  await expect(configure(false, c.actors.staff)).rejects.toMatchObject({
    status: 403,
  });
  await expect(configure(false, c.actors.manager)).rejects.toMatchObject({
    status: 403,
  });
  await configure(false);
  expect(await getAttendancePolicy(c.db, c.branchId)).toMatchObject({
    requireLocation: false,
  });
  const other = crypto.randomUUID();
  await c.db
    .insert(s.branches)
    .values({
      id: other,
      code: "OTHER-LOCATION",
      name: "Other branch",
      timeZone: "UTC",
    });
  await run(
    {
      action: "configure",
      expectedRevision: 0,
      enabled: true,
      latitude: location.latitude,
      longitude: location.longitude,
      radiusMeters: 100,
      maxAccuracyMeters: 40,
      codeValidityMinutes: 10,
      requireStepUp: false,
    },
    { ...c.actors.admin, branchId: other },
  );
  expect(await getAttendancePolicy(c.db, other)).toMatchObject({
    requireLocation: true,
  });
  expect(await getAttendancePolicy(c.db, c.branchId)).toMatchObject({
    requireLocation: false,
  });
});
it("permits verified QR attendance without GPS, but still rejects missing identity or QR proof", async () => {
  await configure(false);
  await expect(
    run({ action: "punch", kind: "entry", location: null }, c.actors.staff),
  ).rejects.toThrow();
  const attempt = await signed("entry", null);
  await expect(
    run(
      { ...attempt.command, verificationId: undefined },
      c.actors.staff,
      attempt.requestId,
    ),
  ).rejects.toThrow();
  await run(attempt.command, c.actors.staff, attempt.requestId);
  const snapshot = await getAttendanceSnapshot(c.db, c.actors.staff, {}, now);
  expect(snapshot.events).toHaveLength(1);
  expect(snapshot.events[0]).toMatchObject({
    source: "phone",
    locationVerified: false,
  });
  const [event] = await c.db
    .select()
    .from(s.attendanceEvents)
    .where(eq(s.attendanceEvents.id, snapshot.events[0].id));
  expect(event.evidence).toMatchObject({ locationRequired: false });
  expect(event.evidence).not.toHaveProperty("latitude");
});
it("rechecks policy revisions and rejects omitted or outside GPS after proximity is restored", async () => {
  const old = await signed("exit", null);
  await configure(true);
  await expect(
    run(old.command, c.actors.staff, old.requestId),
  ).rejects.toThrow();
  for (const point of [null, { ...location, latitude: 0 }]) {
    const attempt = await signed("exit", point);
    await expect(
      run(attempt.command, c.actors.staff, attempt.requestId),
    ).rejects.toThrow(/ubicación|zona/i);
  }
  const valid = await signed("exit", location);
  await run(valid.command, c.actors.staff, valid.requestId);
  const snapshot = await getAttendanceSnapshot(c.db, c.actors.staff, {}, now);
  expect(snapshot.events).toHaveLength(2);
  expect(
    snapshot.events.find((event) => event.kind === "entry")?.locationVerified,
  ).toBe(false);
  expect(
    snapshot.events.find((event) => event.kind === "exit")?.locationVerified,
  ).toBe(true);
});
it("allows attendance without coordinates only when proximity is explicitly disabled", async () => {
  const branchId = crypto.randomUUID();
  await c.db
    .insert(s.branches)
    .values({
      id: branchId,
      code: "REMOTE-LOCATION",
      name: "Remote",
      timeZone: "UTC",
    });
  const base = {
    action: "configure",
    expectedRevision: 0,
    enabled: true,
    latitude: null,
    longitude: null,
    radiusMeters: 100,
    maxAccuracyMeters: 40,
    codeValidityMinutes: 10,
    requireStepUp: false,
  };
  await expect(run(base, { ...c.actors.admin, branchId })).rejects.toThrow();
  await run(
    { ...base, requireLocation: false },
    { ...c.actors.admin, branchId },
  );
  expect(await getAttendancePolicy(c.db, branchId)).toMatchObject({
    enabled: true,
    requireLocation: false,
    latitude: null,
    longitude: null,
  });
});
it("reads older databases as proximity required until the approved migration is applied", async () => {
  await c.client.exec(
    "ALTER TABLE attendance_settings DROP CONSTRAINT attendance_enabled_location; ALTER TABLE attendance_settings DROP COLUMN require_location;",
  );
  expect(await getAttendancePolicy(c.db, c.branchId)).toMatchObject({
    requireLocation: true,
  });
  expect(
    (await getAttendanceSnapshot(c.db, c.actors.admin, {}, now)).settings,
  ).toMatchObject({ requireLocation: true });
  await expect(configure(false)).rejects.toMatchObject({
    code: "ATTENDANCE_LOCATION_SETUP",
    status: 503,
  });
});
