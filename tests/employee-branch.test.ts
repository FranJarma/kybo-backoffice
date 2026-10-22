import { afterEach, expect, it } from "vitest";
import { createDataModelTestContext } from "./helpers/data-model-database";
import { provisionUser } from "../src/lib/auth";
import { resolveOperationalContext } from "../src/modules/branches/active";
import { branches, branchMemberships } from "../src/db/branch-schema";
import { eq } from "drizzle-orm";
const contexts: Awaited<ReturnType<typeof createDataModelTestContext>>[] = [];
afterEach(async () => {
  await Promise.all(contexts.splice(0).map((c) => c.close()));
});
it("selects an assigned branch for managers and recovers stale preferences without changing explicit requests", async () => {
  const c = await createDataModelTestContext();
  contexts.push(c);
  const [first, second] = await c.db
    .insert(branches)
    .values([
      { code: "DEFAULT_A", name: "A local", timeZone: "UTC" },
      { code: "DEFAULT_Z", name: "Z local", timeZone: "UTC" },
    ])
    .returning();
  const id = await provisionUser(c.db, {
    name: "Manager",
    username: "manager_default",
    password: "TestPassword123",
    role: "manager",
    branchId: first.id,
  });
  await c.db
    .insert(branchMemberships)
    .values({ userId: id, branchId: second.id, role: "manager" });
  const actor = { id, role: "manager" as const };
  expect((await resolveOperationalContext(c.db, actor, "")).branchId).toBe(
    first.id,
  );
  expect(
    (await resolveOperationalContext(c.db, actor, second.id)).branchId,
  ).toBe(second.id);
  expect(
    (await resolveOperationalContext(c.db, actor, c.mapping.initialBranch.id))
      .branchId,
  ).toBe(first.id);
  await expect(
    resolveOperationalContext(c.db, actor, c.mapping.initialBranch.id, {
      explicit: true,
    }),
  ).rejects.toMatchObject({ code: "FORBIDDEN" });
  await c.db
    .update(branches)
    .set({ archivedAt: new Date() })
    .where(eq(branches.id, first.id));
  expect(
    (await resolveOperationalContext(c.db, actor, first.id)).branchId,
  ).toBe(second.id);
  await c.db
    .update(branchMemberships)
    .set({ revokedAt: new Date() })
    .where(eq(branchMemberships.userId, id));
  await expect(
    resolveOperationalContext(c.db, actor, second.id),
  ).rejects.toMatchObject({ code: "BRANCH_ASSIGNMENT_REQUIRED" });
});

it("automatically selects an active branch for administrators and preserves initial setup when none exist", async () => {
  const c = await createDataModelTestContext();
  contexts.push(c);
  const id = await provisionUser(c.db, {
    name: "Admin",
    username: "admin_default",
    password: "TestPassword123",
    role: "admin",
  });
  const actor = { id, role: "admin" as const };
  expect((await resolveOperationalContext(c.db, actor, "")).branchId).toBe(
    c.mapping.initialBranch.id,
  );
  await c.db.update(branches).set({ archivedAt: new Date() });
  await expect(
    resolveOperationalContext(c.db, actor, ""),
  ).rejects.toMatchObject({ code: "BRANCH_REQUIRED" });
});
it("loads an employee's assignment without a cookie and ignores another user's saved branch", async () => {
  const c = await createDataModelTestContext();
  contexts.push(c);
  const branchId = c.mapping.initialBranch.id;
  const id = await provisionUser(c.db, {
    name: "Employee",
    username: "employee",
    password: "TestPassword123",
    role: "staff",
    branchId,
  });
  const actor = { id, role: "staff" as const };
  expect((await resolveOperationalContext(c.db, actor, "")).branchId).toBe(
    branchId,
  );
  expect(
    (await resolveOperationalContext(c.db, actor, crypto.randomUUID()))
      .branchId,
  ).toBe(branchId);
  await c.db
    .update(branchMemberships)
    .set({ revokedAt: new Date() })
    .where(eq(branchMemberships.userId, id));
  await expect(
    resolveOperationalContext(c.db, actor, branchId),
  ).rejects.toMatchObject({ code: "BRANCH_ASSIGNMENT_REQUIRED" });
});
