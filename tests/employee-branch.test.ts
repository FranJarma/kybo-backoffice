import { afterEach, expect, it } from "vitest";
import { createDataModelTestContext } from "./helpers/data-model-database";
import { provisionUser } from "../src/lib/auth";
import { resolveOperationalContext } from "../src/modules/branches/active";
import { branchMemberships } from "../src/db/branch-schema";
import { eq } from "drizzle-orm";
const contexts: Awaited<ReturnType<typeof createDataModelTestContext>>[] = [];
afterEach(async () => {
  await Promise.all(contexts.splice(0).map((c) => c.close()));
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
