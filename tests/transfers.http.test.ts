import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { createDataModelTestContext } from "./helpers/data-model-database";
import { user, operationalUsers } from "@/db/auth-schema";
import { locations } from "@/db/branch-schema";
import { stockTransfers, transferAllocations } from "@/db/transfer-schema";
import { items } from "@/db/item-schema";
import { inventoryLots } from "@/db/inventory-schema";
const mocks = vi.hoisted(() => ({ actor: vi.fn(), db: vi.fn() }));
vi.mock("@/modules/branches/http", () => ({ operationalActor: mocks.actor }));
vi.mock("@/db/client", () => ({ getDb: mocks.db }));
import { GET } from "@/app/api/transfers/route";
let ctx: Awaited<ReturnType<typeof createDataModelTestContext>>;
beforeAll(async () => {
  ctx = await createDataModelTestContext();
  mocks.db.mockResolvedValue(ctx.db);
  mocks.actor.mockResolvedValue({
    id: "transfer-admin",
    role: "admin",
    branchId: ctx.mapping.initialBranch.id,
  });
  await ctx.db
    .insert(user)
    .values({
      id: "transfer-admin",
      name: "Encargado",
      email: "transfer-admin@test.local",
    });
  await ctx.db
    .insert(operationalUsers)
    .values({ userId: "transfer-admin", role: "admin" });
}, 60000);
afterAll(async () => {
  await ctx?.close();
});
it("transfer list includes each item's base unit so quantities cannot be confused with units", async () => {
  const branchId = ctx.mapping.initialBranch.id;
  const [bar] = await ctx.db
    .insert(locations)
    .values({ branchId, code: "TRANSFER-UI-BAR", name: "Barra" })
    .returning();
  const [milk] = await ctx.db
    .insert(items)
    .values({
      code: "TRANSFER-UI-MILK",
      name: "Leche",
      class: "beverage",
      baseUnit: "ml",
      purchasable: true,
      recipeUsable: true,
    })
    .returning();
  const [lot] = await ctx.db
    .insert(inventoryLots)
    .values({
      itemId: milk.id,
      receivedOn: "2026-10-22",
      initialQuantity: "10000.000000",
      remainingQuantity: "10000.000000",
    })
    .returning();
  const [transfer] = await ctx.db
    .insert(stockTransfers)
    .values({
      originBranchId: branchId,
      destinationBranchId: branchId,
      originLocationId: ctx.mapping.initialLocation.id,
      destinationLocationId: bar.id,
      reason: "Reponer leche",
    })
    .returning();
  await ctx.db
    .insert(transferAllocations)
    .values({
      transferId: transfer.id,
      itemId: milk.id,
      lotId: lot.id,
      quantity: "2500.000000",
    });
  const response = await GET(
    new Request("https://kybo.example/api/transfers?scope=active"),
  );
  expect(response.status).toBe(200);
  const body = await response.json();
  expect(body.rows[0].allocations[0]).toMatchObject({
    itemName: "Leche",
    baseUnit: "ml",
    quantity: "2500.000000",
  });
});
