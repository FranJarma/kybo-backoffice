import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { createDataModelTestContext } from "./helpers/data-model-database";
import { provisionUser } from "@/lib/auth";
import { attendanceSettings } from "@/db/attendance-schema";
import { branches } from "@/db/branch-schema";
import { branchAddresses } from "@/db/branch-address-schema";
import {
  readBranchAddress,
  saveBranchAddress,
} from "@/modules/branches/address";
import { runAttendanceCommand } from "@/modules/attendance/service";
import type { Actor } from "@/lib/access";

let c: Awaited<ReturnType<typeof createDataModelTestContext>>;
let admin: Actor, manager: Actor;
const point = {
  address: "Peatonal Juan Bautista Alberdi 143, Salta, Salta, Argentina",
  latitude: -24.791624,
  longitude: -65.411158,
  source: "photon",
  confirmed: true,
  expectedRevision: 0,
};
beforeAll(async () => {
  vi.stubEnv("BETTER_AUTH_URL", "http://localhost:3000");
  c = await createDataModelTestContext({
    attendance: true,
    branchAddress: true,
  });
  const make = async (role: Actor["role"]): Promise<Actor> => ({
    id: await provisionUser(c.db, {
      name: role,
      username: `address_${role}`,
      password: "TestAddress123!",
      role,
      ...(role === "admin" ? {} : { branchId: c.mapping.initialBranch.id }),
    }),
    role,
    branchId: c.mapping.initialBranch.id,
  });
  admin = await make("admin");
  manager = await make("manager");
});
afterAll(async () => {
  await c?.close();
  vi.unstubAllEnvs();
});

it("stores a confirmed branch point and synchronizes existing attendance in the same save", async () => {
  const branchId = c.mapping.initialBranch.id;
  await c.db
    .insert(attendanceSettings)
    .values({
      branchId,
      latitude: -24.8,
      longitude: -65.4,
      radiusMeters: 120,
      maxAccuracyMeters: 30,
      enabled: true,
      codeValidityMinutes: 17,
    });
  expect(await readBranchAddress(c.db, admin, branchId)).toMatchObject({
    ready: true,
    address: null,
  });
  const result = await saveBranchAddress(c.db, admin, branchId, point);
  expect(result).toMatchObject({
    latitude: -24.791624,
    longitude: -65.411158,
    revision: 1,
    confirmedBy: admin.id,
  });
  const [policy] = await c.db
    .select()
    .from(attendanceSettings)
    .where(eq(attendanceSettings.branchId, branchId));
  expect(policy).toMatchObject({
    latitude: -24.791624,
    longitude: -65.411158,
    radiusMeters: 120,
    maxAccuracyMeters: 30,
    enabled: true,
    codeValidityMinutes: 17,
    revision: 2,
  });
});
it("does not allow a stale revision to replace the confirmed point", async () => {
  await expect(
    saveBranchAddress(c.db, admin, c.mapping.initialBranch.id, {
      ...point,
      address: "Otra dirección, Salta",
    }),
  ).rejects.toMatchObject({ code: "CONFLICT" });
  expect(
    (await readBranchAddress(c.db, admin, c.mapping.initialBranch.id)).address
      ?.address,
  ).toBe(point.address);
});
it("does not trust a forged administrator role or an unconfirmed/invalid point", async () => {
  await expect(
    saveBranchAddress(
      c.db,
      { ...manager, role: "admin" },
      c.mapping.initialBranch.id,
      { ...point, expectedRevision: 1 },
    ),
  ).rejects.toMatchObject({ status: 403 });
  await expect(
    readBranchAddress(c.db, manager, c.mapping.initialBranch.id),
  ).rejects.toMatchObject({ status: 403 });
  await expect(
    saveBranchAddress(c.db, admin, c.mapping.initialBranch.id, {
      ...point,
      expectedRevision: 1,
      confirmed: false,
    }),
  ).rejects.toThrow();
  await expect(
    saveBranchAddress(c.db, admin, c.mapping.initialBranch.id, {
      ...point,
      expectedRevision: 1,
      latitude: 200,
    }),
  ).rejects.toThrow();
});
it("uses the central point when configuring attendance even if a client submits another coordinate", async () => {
  await runAttendanceCommand(c.db, admin, crypto.randomUUID(), {
    action: "configure",
    expectedRevision: 2,
    enabled: true,
    latitude: 0,
    longitude: 0,
    radiusMeters: 120,
    maxAccuracyMeters: 30,
    codeValidityMinutes: 17,
    requireStepUp: false,
  });
  const [policy] = await c.db
    .select()
    .from(attendanceSettings)
    .where(eq(attendanceSettings.branchId, c.mapping.initialBranch.id));
  expect(policy).toMatchObject({
    latitude: -24.791624,
    longitude: -65.411158,
    revision: 3,
  });
});
it("serializes first saves and does not create attendance merely by saving a branch address", async () => {
  const [branch] = await c.db
    .insert(branches)
    .values({
      name: "Otra sucursal",
      code: "ADDRESS-OTHER",
      timeZone: "America/Argentina/Buenos_Aires",
    })
    .returning();
  const results = await Promise.allSettled([
    saveBranchAddress(c.db, admin, branch.id, point),
    saveBranchAddress(c.db, admin, branch.id, point),
  ]);
  expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  expect(results.filter((r) => r.status === "rejected")).toHaveLength(1);
  expect(
    await c.db
      .select()
      .from(attendanceSettings)
      .where(eq(attendanceSettings.branchId, branch.id)),
  ).toEqual([]);
  expect(
    await c.db
      .select()
      .from(branchAddresses)
      .where(eq(branchAddresses.branchId, branch.id)),
  ).toHaveLength(1);
});
it("keeps old installations readable without the new table and rejects saving until activation", async () => {
  await c.client.exec("drop table branch_addresses");
  expect(
    await readBranchAddress(c.db, admin, c.mapping.initialBranch.id),
  ).toEqual({ ready: false, address: null });
  await expect(
    saveBranchAddress(c.db, admin, c.mapping.initialBranch.id, point),
  ).rejects.toMatchObject({ status: 503 });
});
