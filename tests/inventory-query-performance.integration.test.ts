import { afterAll, beforeAll, expect, it } from "vitest";
import { drizzle } from "drizzle-orm/pglite";
import type { AppDb } from "../src/db/client";
import * as schema from "../src/db/schema";
import type { OperationalContext } from "../src/modules/operations/types";
import {
  lotsByBranch,
  scopedLot,
  stockByBranch,
} from "../src/modules/inventory/scoped-queries";
import { createDataModelTestContext } from "./helpers/data-model-database";

let fixture: Awaited<ReturnType<typeof createDataModelTestContext>>;
const id = (suffix: number) =>
  `00000000-0000-4000-8000-${String(suffix).padStart(12, "0")}`;
const branchId = id(1);
const otherBranchId = id(2);
const mainLocationId = id(10);
const secondLocationId = id(11);
const otherLocationId = id(12);
const complexItemId = id(100);
const unknownItemId = id(101);
const zeroItemId = id(102);
const noValueItemId = id(103);
const emptyItemId = id(104);
const roundedItemId = id(105);
const lotPageItemId = id(107);
const now = new Date("2026-11-19T01:00:00Z");
const createdAt = new Date("2026-11-01T12:34:56Z");
const ctx: OperationalContext = {
  actorId: "inventory-query-performance",
  role: "admin",
  branchId,
  timeZone: "America/Argentina/Buenos_Aires",
};

async function measure<T>(run: (db: AppDb) => Promise<T>) {
  const queries: string[] = [];
  const db = drizzle({
    client: fixture.client,
    schema,
    logger: { logQuery: (query) => queries.push(query) },
  }) as unknown as AppDb;
  const result = await run(db);
  return {
    result,
    selects: queries.filter((query) => /^select\b/i.test(query.trim())).length,
    queries,
  };
}

beforeAll(async () => {
  fixture = await createDataModelTestContext();
  await fixture.db.insert(schema.branches).values([
    { id: branchId, code: "PERF-A", name: "Branch A", timeZone: ctx.timeZone },
    { id: otherBranchId, code: "PERF-B", name: "Branch B", timeZone: "UTC" },
  ]);
  await fixture.db.insert(schema.locations).values([
    { id: mainLocationId, branchId, code: "MAIN", name: "Main" },
    { id: secondLocationId, branchId, code: "SECOND", name: "Second" },
    {
      id: otherLocationId,
      branchId: otherBranchId,
      code: "MAIN",
      name: "Other",
    },
  ]);
  await fixture.db.insert(schema.items).values([
    ...[
      { id: complexItemId, name: "Inventory perf complex" },
      { id: unknownItemId, name: "Inventory perf unknown" },
      { id: zeroItemId, name: "Inventory perf zero" },
      { id: noValueItemId, name: "Inventory perf no valuation" },
      { id: emptyItemId, name: "Inventory perf empty" },
      { id: roundedItemId, name: "Inventory perf rounded" },
      { id: id(106), name: "Inventory perf untracked", stockTracked: false },
      { id: lotPageItemId, name: "Inventory lot pages" },
      { id: id(108), name: "Inventory literal 50%_\\bag" },
      { id: id(109), name: "Inventory literal 50aaXbag" },
      ...Array.from({ length: 101 }, (_, position) => ({
        id: id(1000 + position),
        name: `Inventory page ${String(position).padStart(3, "0")}`,
      })),
    ].map((item) => ({
      ...item,
      code: `INV-PERF-${item.id.slice(-12)}`,
      class: "food",
      baseUnit: "g",
      purchasable: true,
      recipeUsable: true,
      archivedAt: item.id === unknownItemId ? createdAt : null,
    })),
  ]);

  const lots = [
    {
      id: id(201),
      itemId: complexItemId,
      expiresOn: "2026-11-20",
      initialQuantity: "120",
      remainingQuantity: "113.750001",
      lotCode: "LOT-A",
    },
    {
      id: id(202),
      itemId: complexItemId,
      expiresOn: "2026-11-18",
      initialQuantity: "6",
      remainingQuantity: "5.25",
    },
    {
      id: id(203),
      itemId: complexItemId,
      expiresOn: "2026-11-17",
      initialQuantity: "2",
      remainingQuantity: "2",
      blocked: true,
    },
    {
      id: id(204),
      itemId: complexItemId,
      expiresOn: "2026-11-19",
      initialQuantity: "5.125",
      remainingQuantity: "5.125",
      blocked: true,
    },
    {
      id: id(205),
      itemId: complexItemId,
      expiresOn: null,
      initialQuantity: "6.000001",
      remainingQuantity: "6.000001",
    },
    {
      id: id(206),
      itemId: complexItemId,
      expiresOn: null,
      initialQuantity: "1.75",
      remainingQuantity: "1.75",
    },
    {
      id: id(207),
      itemId: complexItemId,
      expiresOn: null,
      initialQuantity: "0",
      remainingQuantity: "0",
    },
    {
      id: id(208),
      itemId: unknownItemId,
      expiresOn: null,
      initialQuantity: "0.333333",
      remainingQuantity: "0.333333",
    },
    {
      id: id(209),
      itemId: zeroItemId,
      expiresOn: null,
      initialQuantity: "3",
      remainingQuantity: "3",
    },
    {
      id: id(210),
      itemId: noValueItemId,
      expiresOn: null,
      initialQuantity: "3",
      remainingQuantity: "3",
    },
    {
      id: id(211),
      itemId: roundedItemId,
      expiresOn: null,
      initialQuantity: "3",
      remainingQuantity: "3",
    },
    ...Array.from({ length: 102 }, (_, position) => ({
      id: id(3000 + position),
      itemId: lotPageItemId,
      expiresOn: position === 101 ? null : "2026-11-20",
      initialQuantity: "1",
      remainingQuantity: "1",
    })),
  ];
  await fixture.db
    .insert(schema.inventoryLots)
    .values(
      lots.map((lot) => ({ ...lot, receivedOn: "2026-11-01", createdAt })),
    );
  await fixture.db.insert(schema.lotLocationBalances).values([
    {
      lotId: id(201),
      locationId: mainLocationId,
      branchId,
      quantity: "10.250001",
      reserved: "2.000001",
      revision: 7,
    },
    {
      lotId: id(201),
      locationId: secondLocationId,
      branchId,
      quantity: "3.5",
      reserved: "1",
      revision: 3,
    },
    {
      lotId: id(201),
      locationId: otherLocationId,
      branchId: otherBranchId,
      quantity: "100",
    },
    {
      lotId: id(202),
      locationId: mainLocationId,
      branchId,
      quantity: "4",
      reserved: "1",
    },
    {
      lotId: id(202),
      locationId: secondLocationId,
      branchId,
      quantity: "1.25",
    },
    { lotId: id(203), locationId: mainLocationId, branchId, quantity: "2" },
    {
      lotId: id(204),
      locationId: mainLocationId,
      branchId,
      quantity: "5.125",
      reserved: "0.125",
    },
    {
      lotId: id(205),
      locationId: mainLocationId,
      branchId,
      quantity: "6.000001",
      reserved: "1.000001",
    },
    {
      lotId: id(206),
      locationId: secondLocationId,
      branchId,
      quantity: "1.75",
      reserved: "0.25",
      blocked: true,
    },
    { lotId: id(207), locationId: mainLocationId, branchId, quantity: "0" },
    {
      lotId: id(208),
      locationId: mainLocationId,
      branchId,
      quantity: "0.333333",
    },
    { lotId: id(209), locationId: mainLocationId, branchId, quantity: "3" },
    { lotId: id(210), locationId: mainLocationId, branchId, quantity: "3" },
    { lotId: id(211), locationId: mainLocationId, branchId, quantity: "3" },
    ...Array.from({ length: 102 }, (_, position) => ({
      lotId: id(3000 + position),
      locationId: mainLocationId,
      branchId,
      quantity: "1",
    })),
  ]);
  await fixture.db.insert(schema.inventoryValuations).values([
    {
      itemId: complexItemId,
      branchId,
      quantity: "33.875002",
      value: "67.750004",
    },
    {
      itemId: complexItemId,
      branchId: otherBranchId,
      quantity: "100",
      value: "999",
    },
    { itemId: unknownItemId, branchId, quantity: "0.333333", value: null },
    { itemId: zeroItemId, branchId, quantity: "3", value: "0" },
    { itemId: roundedItemId, branchId, quantity: "3", value: "1" },
  ]);
}, 60000);

afterAll(async () => {
  await fixture?.close();
});

it("reads one or many stock items with at most three SELECTs in the existing read-only snapshot", async () => {
  const single = await measure((db) =>
    stockByBranch(db, ctx, "Inventory perf complex", now),
  );
  const many = await measure((db) =>
    stockByBranch(db, ctx, "Inventory perf", now),
  );
  expect(single.result.rows).toHaveLength(1);
  expect(many.result.rows).toHaveLength(6);
  expect(single.queries[0]).toBe(
    "set transaction isolation level repeatable read read only",
  );
  expect(many.queries[0]).toBe(
    "set transaction isolation level repeatable read read only",
  );
  expect(single.selects).toBeLessThanOrEqual(3);
  expect(many.selects).toBeLessThanOrEqual(3);
});

it("keeps exact branch totals, inclusive local expiry, overlapping blocks, reservations and valuation states", async () => {
  const result = await stockByBranch(fixture.db, ctx, "Inventory perf", now);
  expect(result).toEqual({
    asOf: "2026-11-19T01:00:00.000Z",
    businessDate: "2026-11-18",
    total: 6,
    rows: [
      {
        itemId: complexItemId,
        name: "Inventory perf complex",
        baseUnit: "g",
        archived: false,
        physicalQuantity: "33.875002",
        usableQuantity: "15.750000",
        expiredQuantity: "7.250000",
        blockedQuantity: "8.875000",
        undatedQuantity: "7.750001",
        stockValue: "67.750004",
        averageCost: "2.000000",
      },
      {
        itemId: emptyItemId,
        name: "Inventory perf empty",
        baseUnit: "g",
        archived: false,
        physicalQuantity: "0.000000",
        usableQuantity: "0.000000",
        expiredQuantity: "0.000000",
        blockedQuantity: "0.000000",
        undatedQuantity: "0.000000",
        stockValue: "0.000000",
        averageCost: null,
      },
      {
        itemId: noValueItemId,
        name: "Inventory perf no valuation",
        baseUnit: "g",
        archived: false,
        physicalQuantity: "3.000000",
        usableQuantity: "3.000000",
        expiredQuantity: "0.000000",
        blockedQuantity: "0.000000",
        undatedQuantity: "3.000000",
        stockValue: "0.000000",
        averageCost: "0.000000",
      },
      {
        itemId: roundedItemId,
        name: "Inventory perf rounded",
        baseUnit: "g",
        archived: false,
        physicalQuantity: "3.000000",
        usableQuantity: "3.000000",
        expiredQuantity: "0.000000",
        blockedQuantity: "0.000000",
        undatedQuantity: "3.000000",
        stockValue: "1.000000",
        averageCost: "0.333333",
      },
      {
        itemId: unknownItemId,
        name: "Inventory perf unknown",
        baseUnit: "g",
        archived: true,
        physicalQuantity: "0.333333",
        usableQuantity: "0.333333",
        expiredQuantity: "0.000000",
        blockedQuantity: "0.000000",
        undatedQuantity: "0.333333",
        stockValue: null,
        averageCost: null,
      },
      {
        itemId: zeroItemId,
        name: "Inventory perf zero",
        baseUnit: "g",
        archived: false,
        physicalQuantity: "3.000000",
        usableQuantity: "3.000000",
        expiredQuantity: "0.000000",
        blockedQuantity: "0.000000",
        undatedQuantity: "3.000000",
        stockValue: "0.000000",
        averageCost: "0.000000",
      },
    ],
  });
  expect(
    (
      await stockByBranch(
        fixture.db,
        { ...ctx, branchId: otherBranchId },
        "Inventory perf complex",
        now,
      )
    ).rows[0],
  ).toMatchObject({
    physicalQuantity: "100.000000",
    usableQuantity: "100.000000",
    stockValue: "999.000000",
    averageCost: "9.990000",
  });
});

it("preserves literal stock search, empty results and the first 100 alphabetically ordered items", async () => {
  const literal = await stockByBranch(
    fixture.db,
    ctx,
    "  iNVENTORY literal 50%_\\bag  ",
    now,
  );
  expect(literal.total).toBe(1);
  expect(literal.rows.map((row) => row.itemId)).toEqual([id(108)]);
  const missing = await measure((db) =>
    stockByBranch(db, ctx, "missing inventory", now),
  );
  expect(missing.result).toMatchObject({ total: 0, rows: [] });
  expect(missing.selects).toBeLessThanOrEqual(3);
  const page = await measure((db) =>
    stockByBranch(db, ctx, "Inventory page", now),
  );
  expect(page.result.total).toBe(101);
  expect(page.result.rows).toHaveLength(100);
  expect(page.result.rows[0].itemId).toBe(id(1000));
  expect(page.result.rows[99].itemId).toBe(id(1099));
  expect(page.result.rows.some((row) => row.itemId === id(1100))).toBe(false);
  expect(page.selects).toBeLessThanOrEqual(3);
});

it("reads one or many lot locations with two SELECTs", async () => {
  const single = await measure((db) =>
    lotsByBranch(db, ctx, roundedItemId, 0, now),
  );
  const many = await measure((db) =>
    lotsByBranch(db, ctx, complexItemId, 0, now),
  );
  expect(single.result.total).toBe(1);
  expect(single.result.rows).toHaveLength(1);
  expect(many.result.total).toBe(9);
  expect(many.result.rows).toHaveLength(9);
  expect(single.selects).toBeLessThanOrEqual(2);
  expect(many.selects).toBeLessThanOrEqual(2);
});

it("maps the joined lot page without losing location balances, metadata, expiry or ordering", async () => {
  const result = await lotsByBranch(fixture.db, ctx, complexItemId, 0, now);
  const metadata = {
    itemId: complexItemId,
    itemName: "Inventory perf complex",
    baseUnit: "g",
    receiptId: null,
    receivedOn: "2026-11-01",
    lotCode: null,
    revision: 1,
    createdAt: "2026-11-01T12:34:56.000Z",
  };
  expect(result).toEqual({
    total: 9,
    rows: [
      {
        ...metadata,
        id: id(203),
        locationId: mainLocationId,
        locationName: "Main",
        initialQuantity: "2.000000",
        remainingQuantity: "2.000000",
        reservedQuantity: "0.000000",
        expiresOn: "2026-11-17",
        blocked: true,
        expired: true,
      },
      {
        ...metadata,
        id: id(202),
        locationId: mainLocationId,
        locationName: "Main",
        initialQuantity: "6.000000",
        remainingQuantity: "4.000000",
        reservedQuantity: "1.000000",
        expiresOn: "2026-11-18",
        blocked: false,
        expired: true,
      },
      {
        ...metadata,
        id: id(202),
        locationId: secondLocationId,
        locationName: "Second",
        initialQuantity: "6.000000",
        remainingQuantity: "1.250000",
        reservedQuantity: "0.000000",
        expiresOn: "2026-11-18",
        blocked: false,
        expired: true,
      },
      {
        ...metadata,
        id: id(204),
        locationId: mainLocationId,
        locationName: "Main",
        initialQuantity: "5.125000",
        remainingQuantity: "5.125000",
        reservedQuantity: "0.125000",
        expiresOn: "2026-11-19",
        blocked: true,
        expired: false,
      },
      {
        ...metadata,
        id: id(201),
        locationId: mainLocationId,
        locationName: "Main",
        initialQuantity: "120.000000",
        remainingQuantity: "10.250001",
        reservedQuantity: "2.000001",
        expiresOn: "2026-11-20",
        lotCode: "LOT-A",
        revision: 7,
        blocked: false,
        expired: false,
      },
      {
        ...metadata,
        id: id(201),
        locationId: secondLocationId,
        locationName: "Second",
        initialQuantity: "120.000000",
        remainingQuantity: "3.500000",
        reservedQuantity: "1.000000",
        expiresOn: "2026-11-20",
        lotCode: "LOT-A",
        revision: 3,
        blocked: false,
        expired: false,
      },
      {
        ...metadata,
        id: id(205),
        locationId: mainLocationId,
        locationName: "Main",
        initialQuantity: "6.000001",
        remainingQuantity: "6.000001",
        reservedQuantity: "1.000001",
        expiresOn: null,
        blocked: false,
        expired: false,
      },
      {
        ...metadata,
        id: id(206),
        locationId: secondLocationId,
        locationName: "Second",
        initialQuantity: "1.750000",
        remainingQuantity: "1.750000",
        reservedQuantity: "0.250000",
        expiresOn: null,
        blocked: true,
        expired: false,
      },
      {
        ...metadata,
        id: id(207),
        locationId: mainLocationId,
        locationName: "Main",
        initialQuantity: "0.000000",
        remainingQuantity: "0.000000",
        reservedQuantity: "0.000000",
        expiresOn: null,
        blocked: false,
        expired: false,
      },
    ],
  });
  const other = await lotsByBranch(
    fixture.db,
    { ...ctx, branchId: otherBranchId },
    complexItemId,
    0,
    now,
  );
  expect(other.total).toBe(1);
  expect(other.rows).toHaveLength(1);
  expect(other.rows[0]).toMatchObject({
    id: id(201),
    locationId: otherLocationId,
    locationName: "Other",
    remainingQuantity: "100.000000",
  });
});

it("keeps lot pagination ordered and bounded for full, partial and empty pages", async () => {
  const first = await measure((db) =>
    lotsByBranch(db, ctx, lotPageItemId, 0, now),
  );
  const last = await measure((db) =>
    lotsByBranch(db, ctx, lotPageItemId, 100, now),
  );
  const empty = await measure((db) =>
    lotsByBranch(db, ctx, lotPageItemId, 102, now),
  );
  expect([first.result.total, last.result.total, empty.result.total]).toEqual([
    102, 102, 102,
  ]);
  expect(first.result.rows).toHaveLength(100);
  expect(first.result.rows[0].id).toBe(id(3000));
  expect(first.result.rows[99].id).toBe(id(3099));
  expect(last.result.rows.map((row) => row.id)).toEqual([id(3100), id(3101)]);
  expect(last.result.rows[1].expiresOn).toBeNull();
  expect(empty.result.rows).toEqual([]);
  expect(first.selects).toBeLessThanOrEqual(2);
  expect(last.selects).toBeLessThanOrEqual(2);
  expect(empty.selects).toBeLessThanOrEqual(2);
});

it("keeps standalone lot reads scoped to both branch and location with the existing not-found error", async () => {
  const lot = await measure((db) =>
    scopedLot(db, ctx, id(201), secondLocationId, now),
  );
  expect(lot.result).toMatchObject({
    id: id(201),
    locationId: secondLocationId,
    locationName: "Second",
    remainingQuantity: "3.500000",
    reservedQuantity: "1.000000",
    revision: 3,
  });
  expect(lot.selects).toBe(1);
  await expect(
    scopedLot(fixture.db, ctx, id(201), otherLocationId, now),
  ).rejects.toMatchObject({ code: "NOT_FOUND", status: 404 });
  await expect(
    scopedLot(fixture.db, ctx, id(999), mainLocationId, now),
  ).rejects.toMatchObject({ code: "NOT_FOUND", status: 404 });
  await expect(
    scopedLot(
      fixture.db,
      { ...ctx, branchId: otherBranchId },
      id(201),
      mainLocationId,
      now,
    ),
  ).rejects.toMatchObject({ code: "NOT_FOUND", status: 404 });
});
