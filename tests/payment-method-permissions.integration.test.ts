import { afterAll, beforeAll, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createDataModelTestContext } from "./helpers/data-model-database";
import { provisionUser } from "@/lib/auth";
import { operationalUsers } from "@/db/auth-schema";
import { createCatalogService } from "@/modules/catalog/service";
import type { Actor } from "@/lib/access";
let c: Awaited<ReturnType<typeof createDataModelTestContext>>;
let admin: Actor, manager: Actor;
beforeAll(async () => {
  c = await createDataModelTestContext();
  admin = {
    id: await provisionUser(c.db, {
      name: "Admin",
      username: "payments_admin",
      password: "TestPassword123",
      role: "admin",
    }),
    role: "admin",
  };
  manager = {
    id: await provisionUser(c.db, {
      name: "Manager",
      username: "payments_manager",
      password: "TestPassword123",
      role: "manager",
      branchId: c.mapping.initialBranch.id,
    }),
    role: "manager",
    branchId: c.mapping.initialBranch.id,
    catalogManager: true,
  };
  await c.db
    .update(operationalUsers)
    .set({ catalogManager: true })
    .where(eq(operationalUsers.userId, manager.id));
});
afterAll(async () => {
  await c?.close();
});
it("reserves payment method changes for administrators while allowing operational reads", async () => {
  const service = createCatalogService(c.db);
  const row = await service.createRecord(admin, "payment-methods", {
    name: "Efectivo",
    kind: "cash",
  });
  for (const actor of [manager, { ...manager, role: "admin" as const }]) {
    await expect(
      service.createRecord(actor, "payment-methods", {
        name: "No autorizado",
        kind: "cash",
      }),
    ).rejects.toMatchObject({ status: 403 });
    for (const change of [
      {
        revision: row.revision,
        name: "Otro",
        kind: "cash",
        commissionPercent: "3",
      },
      { revision: row.revision, archived: true },
      { revision: row.revision, archived: false },
    ])
      await expect(
        service.updateRecord(actor, "payment-methods", row.id, change),
      ).rejects.toMatchObject({ status: 403 });
  }
  const read = await service.listRecords(manager, "payment-methods");
  expect(read.rows.find((item) => item.id === row.id)?.name).toBe("Efectivo");
  expect(read.rows.some((item) => item.name === "No autorizado")).toBe(false);
  const archived = await service.updateRecord(
    admin,
    "payment-methods",
    row.id,
    { revision: row.revision, archived: true },
  );
  expect(archived.archivedAt).toBeTruthy();
  const restored = await service.updateRecord(
    admin,
    "payment-methods",
    row.id,
    { revision: archived.revision, archived: false },
  );
  expect(restored.archivedAt).toBeNull();
});
