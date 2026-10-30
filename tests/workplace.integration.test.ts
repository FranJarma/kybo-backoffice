import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import * as base from "@/db/schema";
import * as workplace from "@/db/workplace-schema";
import type { Actor } from "@/lib/access";
import {
  createAttendanceContext,
  attendanceNow as now,
  testPassword,
  testIdentityConfig,
} from "./helpers/attendance";
import {
  authorizeManagement,
  createStoreAccount,
  getManagementSnapshot,
  getWorkplaceSummary,
  runManagementCommand,
} from "@/modules/workplace/service";
import {
  getPersonalStations,
  getStoreProfile,
  requireStoreAccount,
  workplaceSchemaReady,
} from "@/modules/workplace/access";
import {
  requireOperationalContext,
  requireAdministrator,
  requireCatalogManagement,
  requireCatalogRead,
} from "@/modules/branches/context";
import { userInvitations } from "@/db/invitations-schema";
import { resolveOperationalContext } from "@/modules/branches/active";
import { getCashStatus } from "@/modules/cash/queries";
import { runAttendanceCommand } from "@/modules/attendance/service";

let c: Awaited<ReturnType<typeof createAttendanceContext>>;
let store: Actor, otherSession: Actor, stationId: string, shiftId: string;
const authorize = (actor = store) =>
  authorizeManagement(
    c.db,
    actor,
    { identifier: c.actors.manager.id + "@test.local", password: testPassword },
    now,
  );
beforeAll(async () => {
  vi.stubEnv("BETTER_AUTH_SECRET", testIdentityConfig.secret);
  c = await createAttendanceContext(undefined, { attendanceAccess: true });
  const created = await createStoreAccount(c.db, c.actors.admin, {
    requestId: crypto.randomUUID(),
    branchId: c.branchId,
    name: "Mostrador",
    username: "mostrador.test",
    password: testPassword,
  });
  for (const id of ["workplace-session", "workplace-other-session"])
    await c.db.insert(base.session).values({
      id,
      userId: created.id,
      token: crypto.randomUUID(),
      expiresAt: new Date(now.getTime() + 86400000),
    });
  store = {
    id: created.id,
    role: "staff",
    accountKind: "store",
    branchId: c.branchId,
    storeBranchId: c.branchId,
    sessionId: "workplace-session",
  } as Actor;
  otherSession = { ...store, sessionId: "workplace-other-session" } as Actor;
  const [location] = await c.db
    .select()
    .from(base.locations)
    .where(eq(base.locations.branchId, c.branchId));
  const [station] = await c.db
    .insert(base.preparationStations)
    .values({
      branchId: c.branchId,
      name: "Barra",
      consumptionLocationId: location.id,
    })
    .returning();
  stationId = station.id;
  const [shift] = await c.db
    .insert(base.attendanceShifts)
    .values({
      branchId: c.branchId,
      name: "Mañana",
      start: "09:00",
      end: "17:00",
      pauseMinutes: 30,
      updatedBy: c.actors.admin.id,
    })
    .returning();
  shiftId = shift.id;
}, 60000);
afterAll(async () => {
  await c?.close();
  vi.unstubAllEnvs();
});

it("provisions a restricted branch-bound account only through an administrator", async () => {
  expect(await workplaceSchemaReady(c.db)).toBe(true);
  expect(await requireStoreAccount(c.db, store, now)).toMatchObject({
    branchId: c.branchId,
  });
  await expect(
    requireStoreAccount(c.db, c.actors.staff, now),
  ).rejects.toMatchObject({ status: 403 });
  await expect(
    createStoreAccount(c.db, c.actors.manager, {
      requestId: crypto.randomUUID(),
      branchId: c.branchId,
      name: "Otro",
      username: "otro.test",
      password: testPassword,
    }),
  ).rejects.toMatchObject({ status: 403 });
  await c.db
    .update(workplace.workplaceStoreAccounts)
    .set({ enabled: false })
    .where(eq(workplace.workplaceStoreAccounts.userId, store.id));
  await expect(requireStoreAccount(c.db, store, now)).rejects.toMatchObject({
    status: 403,
  });
  await c.db
    .update(workplace.workplaceStoreAccounts)
    .set({ enabled: true })
    .where(eq(workplace.workplaceStoreAccounts.userId, store.id));
});
it("never advertises cash management or reveals an opening fund to the shared account", async () => {
  await c.db.insert(base.cashPermissions).values({
    branchId: c.branchId,
    userId: store.id,
    canOpen: true,
    canClose: true,
    canExpense: true,
    updatedBy: c.actors.admin.id,
  });
  expect(await getCashStatus(c.db, store)).toMatchObject({
    canOpen: false,
    canView: false,
    opening: null,
  });
});
it("blocks a pending invitation in every live context even with a stale administrator actor", async () => {
  await c.db.insert(userInvitations).values({
    userId: c.actors.otherAdmin.id,
    tokenHash: crypto.randomUUID(),
    generation: crypto.randomUUID(),
    branchId: c.branchId,
    expiresAt: new Date(now.getTime() + 86400000),
    createdBy: c.actors.admin.id,
  });
  try {
    for (const check of [
      () => requireOperationalContext(c.db, c.actors.otherAdmin, c.branchId),
      () => requireAdministrator(c.db, c.actors.otherAdmin),
      () => requireCatalogManagement(c.db, c.actors.otherAdmin),
      () => requireCatalogRead(c.db, c.actors.otherAdmin),
    ])
      await expect(check()).rejects.toMatchObject({ status: 403 });
  } finally {
    await c.db
      .delete(userInvitations)
      .where(eq(userInvitations.userId, c.actors.otherAdmin.id));
  }
});
it("live core context never treats a disabled or promoted store marker as a personal employee", async () => {
  await c.db
    .update(base.operationalUsers)
    .set({ role: "manager" })
    .where(eq(base.operationalUsers.userId, store.id));
  await expect(
    requireOperationalContext(
      c.db,
      { ...store, accountKind: "personal", role: "admin" },
      c.branchId,
    ),
  ).rejects.toMatchObject({ status: 403 });
  await c.db
    .update(base.operationalUsers)
    .set({ role: "staff" })
    .where(eq(base.operationalUsers.userId, store.id));
  await c.db
    .update(workplace.workplaceStoreAccounts)
    .set({ enabled: false })
    .where(eq(workplace.workplaceStoreAccounts.userId, store.id));
  await expect(
    requireOperationalContext(
      c.db,
      { ...store, accountKind: "personal" },
      c.branchId,
    ),
  ).rejects.toMatchObject({ status: 403 });
  await c.db
    .update(workplace.workplaceStoreAccounts)
    .set({ enabled: true })
    .where(eq(workplace.workplaceStoreAccounts.userId, store.id));
});
it("honors an authorized explicit branch for personal staff and never silently substitutes another", async () => {
  const [second] = await c.db
    .insert(base.branches)
    .values({
      code: "WORK-SECOND",
      name: "Segunda",
      timeZone: "America/Argentina/Buenos_Aires",
    })
    .returning();
  await c.db
    .insert(base.branchMemberships)
    .values({ branchId: second.id, userId: c.actors.staff.id, role: "staff" });
  expect(
    await resolveOperationalContext(c.db, c.actors.staff, second.id, {
      explicit: true,
    }),
  ).toMatchObject({ branchId: second.id });
  await expect(
    resolveOperationalContext(c.db, c.actors.staff, crypto.randomUUID(), {
      explicit: true,
    }),
  ).rejects.toThrow();
  await expect(
    resolveOperationalContext(c.db, store, second.id, { explicit: true }),
  ).rejects.toMatchObject({ status: 403 });
});
it("binds manager authorization to its exact store session and rejects forged or expired grants", async () => {
  const grant = await authorize();
  expect(grant.managerId).toBe(c.actors.manager.id);
  expect(new Date(grant.expiresAt).getTime() - now.getTime()).toBe(600000);
  await expect(
    getManagementSnapshot(c.db, otherSession, grant.token, "2026-10-29", now),
  ).rejects.toMatchObject({ status: 403 });
  await expect(
    getManagementSnapshot(c.db, store, "forged-token", "2026-10-29", now),
  ).rejects.toMatchObject({ status: 403 });
  await expect(
    getManagementSnapshot(
      c.db,
      store,
      grant.token,
      "2026-10-29",
      new Date(now.getTime() + 600000),
    ),
  ).rejects.toMatchObject({ status: 403 });
  await expect(
    getManagementSnapshot(
      c.db,
      { ...store, branchId: crypto.randomUUID() },
      grant.token,
      "2026-10-29",
      now,
    ),
  ).rejects.toMatchObject({ status: 403 });
});
it("invalidates authorization on manager credential/access revocation and explicit exit", async () => {
  const grant = await authorize();
  const [credential] = await c.db
    .select()
    .from(base.account)
    .where(eq(base.account.userId, c.actors.manager.id));
  await c.db
    .update(base.account)
    .set({ updatedAt: new Date(now.getTime() + 1) })
    .where(eq(base.account.id, credential.id));
  await expect(
    getManagementSnapshot(c.db, store, grant.token, "2026-10-29", now),
  ).rejects.toMatchObject({ status: 403 });
  const second = await authorize();
  await c.db
    .update(base.branchMemberships)
    .set({ revokedAt: now })
    .where(eq(base.branchMemberships.userId, c.actors.manager.id));
  await expect(
    getManagementSnapshot(c.db, store, second.token, "2026-10-29", now),
  ).rejects.toMatchObject({ status: 403 });
  await c.db
    .update(base.branchMemberships)
    .set({ revokedAt: null })
    .where(eq(base.branchMemberships.userId, c.actors.manager.id));
  const third = await authorize();
  await runManagementCommand(c.db, store, third.token, { action: "exit" }, now);
  await expect(
    getManagementSnapshot(c.db, store, third.token, "2026-10-29", now),
  ).rejects.toMatchObject({ status: 403 });
});
it("rejects unscoped attendance/administration operations even with a valid grant", async () => {
  const grant = await authorize();
  for (const action of [
    "configure",
    "participant",
    "approveManual",
    "saveUser",
  ])
    await expect(
      runManagementCommand(c.db, store, grant.token, { action }, now),
    ).rejects.toThrow();
});
it("atomically saves station responsibility against configured schedules, then revokes authorization", async () => {
  const grant = await authorize();
  const result = await runManagementCommand(
    c.db,
    store,
    grant.token,
    {
      action: "save",
      requestId: crypto.randomUUID(),
      businessDate: "2026-10-29",
      expectedRevision: 0,
      rows: [{ userId: c.actors.staff.id, shiftId, stationId }],
    },
    now,
  );
  expect(result).toMatchObject({ revision: 1 });
  const personal = await getPersonalStations(c.db, c.actors.staff, now);
  expect(personal).toMatchObject([
    { stationId, stationName: "Barra", businessDate: "2026-10-29" },
  ]);
  expect(
    await getPersonalStations(
      c.db,
      c.actors.staff,
      new Date("2026-10-29T20:00:00Z"),
    ),
  ).toEqual([]);
  await expect(
    getManagementSnapshot(c.db, store, grant.token, "2026-10-29", now),
  ).rejects.toMatchObject({ status: 403 });
  const second = await authorize();
  await expect(
    runManagementCommand(
      c.db,
      store,
      second.token,
      {
        action: "save",
        requestId: crypto.randomUUID(),
        businessDate: "2026-10-29",
        expectedRevision: 0,
        rows: [],
      },
      now,
    ),
  ).rejects.toMatchObject({ status: 409 });
  expect(
    (await getManagementSnapshot(c.db, store, second.token, "2026-10-29", now))
      .rows,
  ).toHaveLength(1);
});
it("never assigns a shared account or disabled/nonparticipant employee", async () => {
  const grant = await authorize();
  await expect(
    runManagementCommand(
      c.db,
      store,
      grant.token,
      {
        action: "save",
        requestId: crypto.randomUUID(),
        businessDate: "2026-10-30",
        expectedRevision: 0,
        rows: [{ userId: store.id, shiftId, stationId }],
      },
      now,
    ),
  ).rejects.toMatchObject({ status: 403 });
});
it("shows only current branch responsibilities to a live store account without granting management data", async () => {
  const summary = await getWorkplaceSummary(c.db, store, now);
  expect(summary.branchId).toBe(c.branchId);
  expect(summary.rows).toEqual([
    {
      personName: c.actors.staff.id,
      stationName: "Barra",
      startsAt: "2026-10-29T12:00:00.000Z",
      endsAt: "2026-10-29T20:00:00.000Z",
    },
  ]);
  expect(Object.keys(summary).sort()).toEqual([
    "branchId",
    "now",
    "rows",
    "timeZone",
  ]);
  expect(summary).not.toHaveProperty("people");
  expect(summary).not.toHaveProperty("manualRequests");
  await expect(
    getWorkplaceSummary(c.db, c.actors.staff, now),
  ).rejects.toMatchObject({ status: 403 });
  await expect(
    getWorkplaceSummary(c.db, { ...store, branchId: crypto.randomUUID() }, now),
  ).rejects.toMatchObject({ status: 403 });
  await expect(
    getWorkplaceSummary(c.db, { ...store, sessionId: "revoked-session" }, now),
  ).rejects.toMatchObject({ status: 403 });
  expect(
    (await getWorkplaceSummary(c.db, store, new Date("2026-10-29T20:00:00Z")))
      .rows,
  ).toEqual([]);
});
it("rolls back every new schedule when a later row is invalid and retains authorization to fix it", async () => {
  const grant = await authorize();
  await expect(
    runManagementCommand(
      c.db,
      store,
      grant.token,
      {
        action: "save",
        requestId: crypto.randomUUID(),
        businessDate: "2026-10-31",
        expectedRevision: 0,
        rows: [
          { userId: c.actors.staff.id, shiftId, stationId },
          { userId: store.id, shiftId, stationId },
        ],
      },
      now,
    ),
  ).rejects.toMatchObject({ status: 403 });
  const snapshot = await getManagementSnapshot(
    c.db,
    store,
    grant.token,
    "2026-10-31",
    now,
  );
  expect(snapshot.revision).toBe(0);
  expect(snapshot.schedules).toEqual([]);
});
it("keeps configured overnight station responsibility active across midnight and expires at its actual end", async () => {
  const [night] = await c.db
    .insert(base.attendanceShifts)
    .values({
      branchId: c.branchId,
      name: "Noche",
      start: "23:00",
      end: "02:00",
      overnight: true,
      pauseMinutes: 30,
      updatedBy: c.actors.admin.id,
    })
    .returning();
  const grant = await authorize(),
    requestId = crypto.randomUUID();
  const save = {
    action: "save",
    requestId,
    businessDate: "2026-10-30",
    expectedRevision: 0,
    rows: [{ userId: c.actors.staff.id, shiftId: night.id, stationId }],
  };
  await runManagementCommand(c.db, store, grant.token, save, now);
  expect(
    await runManagementCommand(c.db, store, grant.token, save, now),
  ).toMatchObject({ replayed: true, revision: 1 });
  expect(
    await getPersonalStations(
      c.db,
      c.actors.staff,
      new Date("2026-10-31T02:59:59Z"),
    ),
  ).toHaveLength(1);
  expect(
    await getPersonalStations(
      c.db,
      c.actors.staff,
      new Date("2026-10-31T04:00:00Z"),
    ),
  ).toHaveLength(1);
  expect(
    await getPersonalStations(
      c.db,
      c.actors.staff,
      new Date("2026-10-31T05:00:00Z"),
    ),
  ).toEqual([]);
});
it("records manual requests as the personally authorizing manager and disallows administration approval", async () => {
  const grant = await authorize();
  const result = await runManagementCommand(
    c.db,
    store,
    grant.token,
    {
      action: "requestManual",
      requestId: crypto.randomUUID(),
      userId: c.actors.otherAdmin.id,
      kind: "entry",
      localTime: "2026-10-29T11:50",
      reason: "Sin acceso al celular",
    },
    now,
  );
  const [request] = await c.db
    .select()
    .from(base.attendanceManualRequests)
    .where(eq(base.attendanceManualRequests.id, result.id as string));
  expect(request.requestedBy).toBe(c.actors.manager.id);
  await expect(
    runManagementCommand(
      c.db,
      store,
      grant.token,
      { action: "approveManual", id: request.id },
      now,
    ),
  ).rejects.toThrow();
});
it("commits each failed manual code inside protected management and locks after five failures", async () => {
  const grant = await authorize();
  const requested = await runManagementCommand(
    c.db,
    store,
    grant.token,
    {
      action: "requestManual",
      requestId: crypto.randomUUID(),
      userId: c.actors.otherAdmin.id,
      kind: "entry",
      localTime: "2026-10-29T11:50",
      reason: "Celular sin acceso",
    },
    now,
  );
  await runAttendanceCommand(
    c.db,
    c.actors.admin,
    crypto.randomUUID(),
    {
      action: "approveManual",
      id: requested.id,
      reason: "Aprobado por Administración",
    },
    now,
  );
  for (let i = 1; i <= 5; i++) {
    await expect(
      runManagementCommand(
        c.db,
        store,
        grant.token,
        {
          action: "redeemManual",
          requestId: crypto.randomUUID(),
          id: requested.id,
          code: "000000",
        },
        now,
      ),
    ).rejects.toMatchObject({ code: "ATTENDANCE_CODE_INVALID" });
    const [request] = await c.db
      .select()
      .from(base.attendanceManualRequests)
      .where(eq(base.attendanceManualRequests.id, requested.id as string));
    expect(request.failedAttempts).toBe(i);
    expect(request.status).toBe(i === 5 ? "locked" : "approved");
  }
  await expect(
    runManagementCommand(
      c.db,
      store,
      grant.token,
      {
        action: "redeemManual",
        requestId: crypto.randomUUID(),
        id: requested.id,
        code: "000000",
      },
      now,
    ),
  ).rejects.toMatchObject({ code: "ATTENDANCE_CODE_UNAVAILABLE" });
});
it("commits password failures and throttles repeated attempts without changing the POS session", async () => {
  for (let i = 0; i < 5; i++)
    await expect(
      authorizeManagement(
        c.db,
        store,
        { identifier: "nobody", password: "incorrect-password" },
        now,
      ),
    ).rejects.toMatchObject({ status: 401 });
  await expect(authorize()).rejects.toMatchObject({ status: 429 });
  await expect(authorize(otherSession)).rejects.toMatchObject({ status: 429 });
  const [limit] = await c.db
    .select()
    .from(workplace.workplaceManagementLimits)
    .where(eq(workplace.workplaceManagementLimits.sessionId, store.sessionId!));
  expect(limit.failures).toBe(5);
  const sessions = await c.db
    .select()
    .from(base.session)
    .where(eq(base.session.userId, store.id));
  expect(sessions.map((s) => s.id).sort()).toEqual([
    "workplace-other-session",
    "workplace-session",
  ]);
});
it("keeps a store marker recognizable while a different workplace table is unavailable", async () => {
  await c.client.exec(
    "alter table workplace_station_assignments rename to workplace_station_assignments_unavailable",
  );
  try {
    expect(await workplaceSchemaReady(c.db)).toBe(false);
    expect(await getStoreProfile(c.db, store.id)).toMatchObject({
      userId: store.id,
      enabled: true,
    });
  } finally {
    await c.client.exec(
      "alter table workplace_station_assignments_unavailable rename to workplace_station_assignments",
    );
  }
});
