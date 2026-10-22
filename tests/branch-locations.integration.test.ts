import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { createDataModelTestContext } from "./helpers/data-model-database";
import { provisionUser } from "@/lib/auth";
import { locations } from "@/db/branch-schema";
import { archiveLocation } from "@/modules/branches/archive-location";
import type { Actor } from "@/lib/access";
const mocks = vi.hoisted(() => ({ actor: vi.fn(), db: vi.fn() }));
vi.mock("@/lib/auth", async (original) => ({
  ...(await original<typeof import("@/lib/auth")>()),
  requireActor: mocks.actor,
}));
vi.mock("@/db/client", () => ({ getDb: mocks.db }));
import { POST } from "@/app/api/branches/[id]/locations/route";
let c: Awaited<ReturnType<typeof createDataModelTestContext>>;
let admin: Actor, manager: Actor, staff: Actor;
beforeAll(async () => {
  vi.stubEnv("BETTER_AUTH_URL", "http://localhost:3000");
  c = await createDataModelTestContext();
  mocks.db.mockResolvedValue(c.db);
  const create = async (role: Actor["role"]) => ({
    id: await provisionUser(c.db, {
      name: role,
      username: `locations_${role}`,
      password: "TestPassword123",
      role,
      ...(role !== "admin" ? { branchId: c.mapping.initialBranch.id } : {}),
    }),
    role,
  });
  admin = await create("admin");
  manager = await create("manager");
  staff = await create("staff");
});
afterAll(async () => {
  await c?.close();
  vi.unstubAllEnvs();
});
const add = (name: string) =>
  POST(
    new Request("http://localhost:3000/api/branches/locations", {
      method: "POST",
      headers: {
        Origin: "http://localhost:3000",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ name }),
    }),
    { params: Promise.resolve({ id: c.mapping.initialBranch.id }) },
  );
it("allows only administrators to create locations, even with forged actor roles", async () => {
  for (const actor of [
    manager,
    staff,
    { ...manager, role: "admin" as const },
  ]) {
    mocks.actor.mockResolvedValue(actor);
    expect((await add("Forbidden location")).status).toBe(403);
  }
  expect(
    await c.db
      .select()
      .from(locations)
      .where(eq(locations.name, "Forbidden location")),
  ).toHaveLength(0);
  mocks.actor.mockResolvedValue(admin);
  expect((await add("Admin location")).status).toBe(201);
});
it("does not let managers archive an existing location", async () => {
  const [location] = await c.db
    .insert(locations)
    .values({
      branchId: c.mapping.initialBranch.id,
      name: "Existing location",
      code: "EMPTY_TEST",
    })
    .returning();
  await expect(
    archiveLocation(
      c.db,
      manager,
      location.branchId,
      location.id,
      location.revision,
    ),
  ).rejects.toMatchObject({ status: 403 });
  expect(
    (
      await c.db.select().from(locations).where(eq(locations.id, location.id))
    )[0].archivedAt,
  ).toBeNull();
  await expect(
    archiveLocation(
      c.db,
      admin,
      location.branchId,
      location.id,
      location.revision,
    ),
  ).resolves.toBeDefined();
});
