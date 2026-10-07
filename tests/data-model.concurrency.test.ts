import { randomUUID } from "node:crypto";
import { beforeAll, afterAll, it, expect } from "vitest";
import { eq } from "drizzle-orm";
import { createDedicatedTestContext } from "./helpers/postgres-data-model";
import { createTransferService } from "../src/modules/transfers/service";
import { branches, locations } from "../src/db/branch-schema";
import { user, operationalUsers } from "../src/db/auth-schema";
import { items } from "../src/db/item-schema";
import {
  lotLocationBalances,
  locationStockBalances,
} from "../src/db/stock-schema";
import { transferAllocations } from "../src/db/transfer-schema";
import { adjustAt } from "../src/modules/inventory/scoped-adjustments";
import { reconcile } from "../src/modules/transition/reconcile";
let fixture: Awaited<ReturnType<typeof createDedicatedTestContext>>;
const actor = { id: randomUUID(), role: "admin" as const };
let branchB: string, locationB: string;
beforeAll(async () => {
  fixture = await createDedicatedTestContext();
  await fixture.db.insert(user).values({
    id: actor.id,
    name: "Test admin",
    email: `${actor.id}@example.invalid`,
  });
  await fixture.db
    .insert(operationalUsers)
    .values({ userId: actor.id, role: "admin" });
  const [b] = await fixture.db
    .insert(branches)
    .values({ code: "B", name: "B", timeZone: "UTC" })
    .returning();
  branchB = b.id;
  const [l] = await fixture.db
    .insert(locations)
    .values({ branchId: branchB, code: "DEP", name: "Depósito B" })
    .returning();
  locationB = l.id;
});
afterAll(async () => {
  await fixture?.close();
});
it("traslada 12 y recibe 5 más 7 conservando identidad y saldos", async () => {
  const service = createTransferService(fixture.db),
    origin = fixture.mapping.initialBranch.id;
  const confirmed = await service.confirm(actor, origin, {
    requestId: randomUUID(),
    originLocationId: fixture.mapping.initialLocation.id,
    destinationLocationId: locationB,
    reason: "Test",
    demands: [{ itemId: fixture.itemId, quantity: "12.000000" }],
  });
  const dispatched = await service.dispatch(
    actor,
    origin,
    confirmed.result.id,
    { requestId: randomUUID(), expectedRevision: confirmed.result.revision },
  );
  const [allocation] = await fixture.db
    .select()
    .from(transferAllocations)
    .where(eq(transferAllocations.transferId, confirmed.result.id));
  const partial = await service.receive(actor, branchB, confirmed.result.id, {
    requestId: randomUUID(),
    expectedRevision: dispatched.result.revision,
    lines: [{ allocationId: allocation.id, quantity: "5.000000" }],
  });
  await service.receive(actor, branchB, confirmed.result.id, {
    requestId: randomUUID(),
    expectedRevision: partial.result.revision,
    lines: [{ allocationId: allocation.id, quantity: "7.000000" }],
  });
  const lots = await fixture.db
    .select()
    .from(lotLocationBalances)
    .where(eq(lotLocationBalances.lotId, fixture.lotId));
  expect(lots.find((l) => l.branchId === branchB)?.quantity).toBe("12.000000");
  expect(lots.find((l) => l.branchId === origin)?.quantity).toBe("0.000000");
  expect((await reconcile(fixture.db, [origin, branchB])).ok).toBe(true);
});
it("dos conexiones compiten por la última unidad y sólo una reserva", async () => {
  const origin = fixture.mapping.initialBranch.id;
  const [item] = await fixture.db
    .insert(items)
    .values({
      code: `I-${randomUUID().toUpperCase()}`,
      name: "Última unidad",
      class: "food",
      baseUnit: "unit",
      purchasable: true,
      recipeUsable: true,
    })
    .returning();
  await adjustAt(
    fixture.db,
    { ...actor, branchId: origin },
    {
      requestId: randomUUID(),
      kind: "opening",
      locationId: fixture.mapping.initialLocation.id,
      itemId: item.id,
      quantity: "1",
      unitCost: "2",
      receivedOn: "2026-01-01",
      expiresOn: null,
      lotCode: null,
      reason: "Test",
    },
    new Date("2026-09-28T12:00:00Z"),
  );
  const payload = () => ({
    requestId: randomUUID(),
    originLocationId: fixture.mapping.initialLocation.id,
    destinationLocationId: locationB,
    reason: "Test",
    demands: [{ itemId: item.id, quantity: "1.000000" }],
  });
  const outcomes = await Promise.allSettled([
    createTransferService(fixture.db).confirm(actor, origin, payload()),
    createTransferService(fixture.secondDb).confirm(actor, origin, payload()),
  ]);
  expect(outcomes.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  const [balance] = await fixture.db
    .select()
    .from(locationStockBalances)
    .where(eq(locationStockBalances.itemId, item.id));
  expect(balance.quantity).toBe("1.000000");
  expect(balance.reserved).toBe("1.000000");
  expect((await reconcile(fixture.db, [origin, branchB])).ok).toBe(true);
});
