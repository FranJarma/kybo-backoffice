import { beforeAll, afterAll, expect, it } from "vitest";
import { randomUUID as uid } from "node:crypto";
import { eq } from "drizzle-orm";
import { createDataModelTestContext } from "./helpers/data-model-database";
import { user, operationalUsers } from "@/db/auth-schema";
import { branches, branchMemberships, locations } from "@/db/branch-schema";
import { items } from "@/db/item-schema";
import { inventoryLots } from "@/db/inventory-schema";
import { lotLocationBalances } from "@/db/stock-schema";
import { auditEvents } from "@/db/business-schema";
import { recipes, recipeVersions } from "@/db/recipe-schema";
import { productionOrders } from "@/db/production-order-schema";
import { executeCommand } from "@/modules/operations/command";
import {
  saveReplenishmentPolicy,
  getReplenishmentSnapshot,
} from "@/modules/replenishment/service";
import type { Actor } from "@/lib/access";
let ctx: Awaited<ReturnType<typeof createDataModelTestContext>>;
const manager: Actor = { id: "replenishment-manager", role: "admin" };
const staff: Actor = { id: "replenishment-staff", role: "staff" };
let milk: string, untracked: string, bar: string, otherLocation: string;
const save = (actor: Actor, policy: unknown, requestId = uid()) =>
  executeCommand(
    ctx.db,
    actor,
    actor.branchId!,
    { requestId },
    "replenishment-policy",
    { policy },
    (tx, scope, operationId) =>
      saveReplenishmentPolicy(tx, scope, operationId, policy),
  );

beforeAll(async () => {
  ctx = await createDataModelTestContext();
  for (const actor of [manager, staff]) {
    actor.branchId = ctx.mapping.initialBranch.id;
    await ctx.db.insert(user).values({
      id: actor.id,
      name: actor.id,
      email: `${actor.id}@test.local`,
    });
    await ctx.db
      .insert(operationalUsers)
      .values({ userId: actor.id, role: actor.role });
    if (actor.role === "staff")
      await ctx.db
        .insert(branchMemberships)
        .values({ userId: actor.id, branchId: actor.branchId, role: "staff" });
  }
  const [m, water] = await ctx.db
    .insert(items)
    .values([
      {
        code: "REPL-MILK",
        name: "Leche",
        class: "beverage",
        baseUnit: "ml",
        purchasable: true,
        recipeUsable: true,
      },
      {
        code: "REPL-WATER",
        name: "Agua",
        class: "beverage",
        baseUnit: "ml",
        purchasable: false,
        recipeUsable: true,
        stockTracked: false,
      },
    ])
    .returning();
  milk = m.id;
  untracked = water.id;
  const [b] = await ctx.db
    .insert(locations)
    .values({ branchId: manager.branchId!, code: "BAR", name: "Barra" })
    .returning();
  bar = b.id;
  const [other] = await ctx.db
    .insert(branches)
    .values({ code: "REPL-OTHER", name: "Otra sucursal", timeZone: "UTC" })
    .returning();
  const [foreign] = await ctx.db
    .insert(locations)
    .values({ branchId: other.id, code: "MAIN", name: "Otra ubicación" })
    .returning();
  otherLocation = foreign.id;
}, 60000);
afterAll(async () => {
  await ctx?.close();
});
const input = () => ({
  itemId: milk,
  locationId: bar,
  minimumQuantity: "1000",
  targetQuantity: "5000",
  preparationMinutes: null,
  enabled: true,
});

it("guarda reglas con auditoría, reproduce la misma operación y rechaza cambios obsoletos", async () => {
  const requestId = uid(),
    policy = input();
  const created = await save(manager, policy, requestId);
  expect(created.result).toMatchObject({
    revision: 1,
    itemName: "Leche",
    locationName: "Barra",
    minimumQuantity: "1000.000000",
  });
  expect((await save(manager, policy, requestId)).replayed).toBe(true);
  expect(
    await ctx.db
      .select()
      .from(auditEvents)
      .where(eq(auditEvents.recordId, created.result.id)),
  ).toHaveLength(1);
  const update = {
    ...input(),
    id: created.result.id,
    revision: 1,
    minimumQuantity: "1500",
    preparationMinutes: 20,
  };
  expect((await save(manager, update)).result.revision).toBe(2);
  await expect(save(manager, update)).rejects.toMatchObject({
    code: "REPLENISHMENT_CONFLICT",
  });
  await expect(save(manager, input())).rejects.toMatchObject({
    code: "REPLENISHMENT_CONFLICT",
  });
});
it("reserva la configuración al encargado y valida ubicación, inventario y cantidades", async () => {
  await expect(save(staff, input())).rejects.toMatchObject({
    code: "FORBIDDEN",
  });
  await expect(
    save(manager, { ...input(), locationId: otherLocation }),
  ).rejects.toMatchObject({ code: "VALIDATION" });
  await expect(
    save(manager, { ...input(), itemId: untracked }),
  ).rejects.toMatchObject({ code: "VALIDATION" });
  await expect(
    save(manager, { ...input(), targetQuantity: "500" }),
  ).rejects.toMatchObject({ code: "VALIDATION" });
  await expect(
    save(manager, { ...input(), targetQuantity: "1000" }),
  ).rejects.toMatchObject({ code: "VALIDATION" });
});
it("permite consultar al empleado sin costos ni datos de otra sucursal, con disponibilidad utilizable", async () => {
  const [lot] = await ctx.db
    .insert(inventoryLots)
    .values({
      itemId: milk,
      receivedOn: "2026-10-01",
      initialQuantity: "5000",
      remainingQuantity: "5000",
    })
    .returning();
  await ctx.db.insert(lotLocationBalances).values([
    {
      lotId: lot.id,
      branchId: manager.branchId!,
      locationId: bar,
      quantity: "1200",
      reserved: "500",
    },
    {
      lotId: lot.id,
      branchId: manager.branchId!,
      locationId: ctx.mapping.initialLocation.id,
      quantity: "2000",
      reserved: "500",
    },
  ]);
  const snapshot = await getReplenishmentSnapshot(
    ctx.db,
    staff,
    new Date("2026-10-18T12:00:00Z"),
  );
  expect(snapshot.alerts[0]).toMatchObject({
    kind: "transfer",
    availableQuantity: "700.000000",
    suggestedQuantity: "1500.000000",
    sources: [{ availableQuantity: "1500.000000" }],
  });
  expect(snapshot.locations.some((l) => l.id === otherLocation)).toBe(false);
  expect(snapshot.items.some((i) => i.id === untracked)).toBe(false);
  expect(JSON.stringify(snapshot)).not.toContain("unitCost");
  const [foreign] = await ctx.db
    .select()
    .from(locations)
    .where(eq(locations.id, otherLocation));
  await expect(
    getReplenishmentSnapshot(ctx.db, { ...staff, branchId: foreign.branchId }),
  ).rejects.toMatchObject({ code: "FORBIDDEN" });
});
it("muestra la producción planificada y comenzada de la ubicación sin contar stock futuro ni modificar órdenes", async () => {
  const [output] = await ctx.db
    .insert(items)
    .values({
      code: "REPL-CHAI",
      name: "Chai preparado",
      class: "beverage",
      baseUnit: "ml",
      purchasable: false,
      recipeUsable: true,
    })
    .returning();
  const [recipe] = await ctx.db
    .insert(recipes)
    .values({ kind: "preparation", outputItemId: output.id })
    .returning();
  const [version] = await ctx.db
    .insert(recipeVersions)
    .values({
      recipeId: recipe.id,
      version: 1,
      outputName: output.name,
      outputUnit: "ml",
      yieldQuantity: "1000",
      actorId: manager.id,
    })
    .returning();
  await save(manager, {
    ...input(),
    itemId: output.id,
    preparationMinutes: 30,
  });
  await ctx.db.insert(productionOrders).values(
    ["planned", "confirmed", "completed", "cancelled"].map((state) => ({
      branchId: manager.branchId!,
      locationId: bar,
      recipeVersionId: version.id,
      outputItemId: output.id,
      plannedQuantity: "5000",
      composition: {},
      state,
      assignedTo: staff.id,
    })),
  );
  const [started] = await ctx.db
    .insert(productionOrders)
    .values({
      branchId: manager.branchId!,
      locationId: bar,
      recipeVersionId: version.id,
      outputItemId: output.id,
      plannedQuantity: "5000",
      composition: {},
      state: "confirmed",
      assignedTo: staff.id,
      startedBy: staff.id,
      startedAt: new Date("2026-10-18T11:00:00.000Z"),
    })
    .returning();
  const before = await ctx.db.select().from(productionOrders);
  const snapshot = await getReplenishmentSnapshot(
    ctx.db,
    staff,
    new Date("2026-10-18T12:00:00Z"),
  );
  const alert = snapshot.alerts.find((a) => a.itemId === output.id)!;
  expect(alert).toMatchObject({
    kind: "production",
    availableQuantity: "0.000000",
    suggestedQuantity: "5000.000000",
    preparationMinutes: 30,
  });
  expect(alert.activeProduction.map((o) => o.state).sort()).toEqual([
    "confirmed",
    "confirmed",
    "planned",
  ]);
  expect(
    alert.activeProduction.find((o) => o.id === started.id)?.startedAt,
  ).toBe("2026-10-18T11:00:00.000Z");
  expect(
    alert.activeProduction.filter(
      (o) => o.state === "confirmed" && o.id !== started.id,
    )[0].startedAt,
  ).toBeNull();
  expect(
    alert.activeProduction.every((o) => o.assignedToName === staff.id),
  ).toBe(true);
  expect(await ctx.db.select().from(productionOrders)).toEqual(before);
});
