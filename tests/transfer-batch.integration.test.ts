import { afterAll, beforeAll, expect, it } from "vitest";
import { randomUUID as uid } from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";
import { createDataModelTestContext } from "./helpers/data-model-database";
import { user, operationalUsers } from "@/db/auth-schema";
import { branches, locations } from "@/db/branch-schema";
import { items } from "@/db/item-schema";
import { stockTransfers, transferAllocations } from "@/db/transfer-schema";
import { locationStockBalances, stockOperations } from "@/db/stock-schema";
import { stockReservations } from "@/db/reservation-schema";
import { adjustAt } from "@/modules/inventory/scoped-adjustments";
import { confirmTransferBatch } from "@/modules/transfers/batch";
import { createTransferService } from "@/modules/transfers/service";
import type { Actor } from "@/lib/access";

let ctx: Awaited<ReturnType<typeof createDataModelTestContext>>;
const actor: Actor = { id: "batch-admin", role: "admin" };
beforeAll(async () => {
  ctx = await createDataModelTestContext();
  actor.branchId = ctx.mapping.initialBranch.id;
  await ctx.db
    .insert(user)
    .values({ id: actor.id, name: "Encargado", email: "batch@test.local" });
  await ctx.db
    .insert(operationalUsers)
    .values({ userId: actor.id, role: "admin" });
}, 60000);
afterAll(async () => {
  await ctx?.close();
});

async function fixture() {
  const branchId = actor.branchId!;
  const destinations = await ctx.db
    .insert(locations)
    .values([
      { branchId, code: uid(), name: "Barra" },
      { branchId, code: uid(), name: "Cocina" },
    ])
    .returning();
  const materials = await ctx.db
    .insert(items)
    .values([
      {
        code: `BATCH-${uid()}`.toUpperCase(),
        name: "Leche",
        class: "beverage",
        baseUnit: "ml",
        purchasable: true,
        recipeUsable: true,
      },
      {
        code: `BATCH-${uid()}`.toUpperCase(),
        name: "Vasos",
        class: "packaging",
        baseUnit: "unit",
        purchasable: true,
        recipeUsable: true,
      },
    ])
    .returning();
  const origin = ctx.mapping.initialLocation.id;
  for (const [index, item] of materials.entries()) {
    await adjustAt(
      ctx.db,
      actor,
      {
        requestId: uid(),
        kind: "opening",
        locationId: origin,
        itemId: item.id,
        quantity: index === 0 ? "20000" : "500",
        unitCost: "1",
        receivedOn: "2026-01-01",
        expiresOn: null,
        lotCode: null,
        reason: "Stock inicial de prueba",
      },
      new Date("2026-10-23T12:00:00Z"),
    );
  }
  return {
    branchId,
    origin,
    destinations,
    materials,
    payload: {
      requestId: uid(),
      originLocationId: origin,
      reason: "Reposición para turno de la mañana",
      lines: [
        {
          itemId: materials[0].id,
          destinationLocationId: destinations[0].id,
          quantity: "10000.000000",
        },
        {
          itemId: materials[1].id,
          destinationLocationId: destinations[1].id,
          quantity: "100.000000",
        },
      ],
    },
  };
}
async function balances(itemIds: string[]) {
  return ctx.db
    .select()
    .from(locationStockBalances)
    .where(inArray(locationStockBalances.itemId, itemIds))
    .orderBy(locationStockBalances.itemId, locationStockBalances.locationId);
}

it("moves all materials to their individual destinations in one completed operation and replays once", async () => {
  const f = await fixture();
  const outcome = await confirmTransferBatch(
    ctx.db,
    actor,
    f.branchId,
    f.payload,
  );
  expect(outcome.result.transfers).toHaveLength(2);
  const ids = outcome.result.transfers.map((t) => t.id);
  expect(
    (
      await ctx.db
        .select()
        .from(stockTransfers)
        .where(inArray(stockTransfers.id, ids))
    ).map((t) => t.state),
  ).toEqual(["received", "received"]);
  const rows = await balances(f.materials.map((m) => m.id));
  expect(rows).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        itemId: f.materials[0].id,
        locationId: f.origin,
        quantity: "10000.000000",
        reserved: "0.000000",
      }),
      expect.objectContaining({
        itemId: f.materials[0].id,
        locationId: f.destinations[0].id,
        quantity: "10000.000000",
        reserved: "0.000000",
      }),
      expect.objectContaining({
        itemId: f.materials[1].id,
        locationId: f.origin,
        quantity: "400.000000",
        reserved: "0.000000",
      }),
      expect.objectContaining({
        itemId: f.materials[1].id,
        locationId: f.destinations[1].id,
        quantity: "100.000000",
        reserved: "0.000000",
      }),
    ]),
  );
  const replay = await confirmTransferBatch(
    ctx.db,
    actor,
    f.branchId,
    f.payload,
  );
  expect(replay.replayed).toBe(true);
  expect(replay.operationId).toBe(outcome.operationId);
  expect(await balances(f.materials.map((m) => m.id))).toEqual(rows);
  const allocations = await ctx.db
    .select()
    .from(transferAllocations)
    .where(inArray(transferAllocations.transferId, ids));
  expect(allocations).toHaveLength(2);
  expect(allocations.every((a) => a.received === a.quantity)).toBe(true);
  await expect(
    confirmTransferBatch(ctx.db, actor, f.branchId, {
      ...f.payload,
      reason: "Otro motivo",
    }),
  ).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });
});

it("rolls back the whole batch if total demand across destinations exceeds stock", async () => {
  const f = await fixture();
  f.payload.lines.push({
    itemId: f.materials[0].id,
    destinationLocationId: f.destinations[1].id,
    quantity: "11000.000000",
  });
  const before = await balances(f.materials.map((m) => m.id));
  const transfersBefore = await ctx.db.select().from(stockTransfers);
  const reservationsBefore = await ctx.db.select().from(stockReservations);
  await expect(
    confirmTransferBatch(ctx.db, actor, f.branchId, f.payload),
  ).rejects.toMatchObject({ code: "INSUFFICIENT_STOCK" });
  expect(await balances(f.materials.map((m) => m.id))).toEqual(before);
  expect(await ctx.db.select().from(stockTransfers)).toEqual(transfersBefore);
  expect(await ctx.db.select().from(stockReservations)).toEqual(
    reservationsBefore,
  );
  expect(
    await ctx.db
      .select()
      .from(stockOperations)
      .where(eq(stockOperations.requestId, f.payload.requestId)),
  ).toHaveLength(0);
});

it("rolls back already processed destinations when a later destination is invalid", async () => {
  const f = await fixture();
  const before = await balances(f.materials.map((m) => m.id));
  // This UUID sorts after every valid UUID, so a valid destination is processed first.
  f.payload.lines[1].destinationLocationId =
    "ffffffff-ffff-4fff-bfff-ffffffffffff";
  const transfersBefore = await ctx.db.select().from(stockTransfers);
  await expect(
    confirmTransferBatch(ctx.db, actor, f.branchId, f.payload),
  ).rejects.toMatchObject({ code: "TRANSFER_CONFLICT" });
  expect(await balances(f.materials.map((m) => m.id))).toEqual(before);
  expect(await ctx.db.select().from(stockTransfers)).toEqual(transfersBefore);
});

it("groups the same destination in one document and dispatches external stock without receiving it", async () => {
  const f = await fixture();
  const [branch] = await ctx.db
    .insert(branches)
    .values({
      code: `EXTERNAL-${uid()}`.toUpperCase(),
      name: "Otra sucursal",
      timeZone: "UTC",
    })
    .returning();
  const [target] = await ctx.db
    .insert(locations)
    .values({ branchId: branch.id, code: "BARRA", name: "Barra" })
    .returning();
  f.payload.lines.forEach((line) => {
    line.destinationLocationId = target.id;
  });
  const outcome = await confirmTransferBatch(
    ctx.db,
    actor,
    f.branchId,
    f.payload,
  );
  expect(outcome.result.transfers).toHaveLength(1);
  const [transfer] = await ctx.db
    .select()
    .from(stockTransfers)
    .where(eq(stockTransfers.id, outcome.result.transfers[0].id));
  expect(transfer.state).toBe("in_transit");
  expect(
    await ctx.db
      .select()
      .from(locationStockBalances)
      .where(
        and(
          eq(locationStockBalances.locationId, target.id),
          inArray(
            locationStockBalances.itemId,
            f.materials.map((m) => m.id),
          ),
        ),
      ),
  ).toHaveLength(0);
});

it("keeps legacy confirmation as reservation-only", async () => {
  const f = await fixture();
  const result = await createTransferService(ctx.db).confirm(
    actor,
    f.branchId,
    {
      requestId: uid(),
      originLocationId: f.origin,
      destinationLocationId: f.destinations[0].id,
      reason: f.payload.reason,
      demands: [{ itemId: f.materials[0].id, quantity: "1000.000000" }],
    },
  );
  const [saved] = await ctx.db
    .select()
    .from(stockTransfers)
    .where(eq(stockTransfers.id, result.result.id));
  expect(saved.state).toBe("confirmed");
  const [source] = await ctx.db
    .select()
    .from(locationStockBalances)
    .where(
      and(
        eq(locationStockBalances.itemId, f.materials[0].id),
        eq(locationStockBalances.locationId, f.origin),
      ),
    );
  expect(source.quantity).toBe("20000.000000");
  expect(source.reserved).toBe("1000.000000");
});
