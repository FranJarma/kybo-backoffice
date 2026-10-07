import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { eq } from "drizzle-orm";
import { createDataModelTestContext } from "./helpers/data-model-database";
import { reconcile } from "../src/modules/transition/reconcile";
import { branches, locations } from "../src/db/branch-schema";
import { locationStockBalances } from "../src/db/stock-schema";
let fixture: Awaited<ReturnType<typeof createDataModelTestContext>>;
beforeAll(async () => {
  fixture = await createDataModelTestContext();
});
afterAll(async () => {
  await fixture?.close();
});
describe("transición poblada y aislamiento", () => {
  it("preserva UUID, cantidad y costo desconocido", async () => {
    const result = await fixture.client.query<{
      id: string;
      quantity: string;
      value: string | null;
    }>(
      "select i.id,v.quantity,v.value from items i join inventory_valuations v on v.item_id=i.id where i.id=$1",
      [fixture.itemId],
    );
    expect(result.rows[0]).toEqual({
      id: fixture.itemId,
      quantity: "12.000000",
      value: null,
    });
    expect(
      (await reconcile(fixture.db, [fixture.mapping.initialBranch.id])).ok,
    ).toBe(true);
  });
  it("impide reescribir historia y agregar baselines después del corte", async () => {
    await expect(
      fixture.client.query(
        "update stock_transition_baselines set quantity=0 where item_id=$1",
        [fixture.itemId],
      ),
    ).rejects.toThrow();
    await expect(
      fixture.client.query(
        "insert into stock_transition_baselines(item_id,location_id,quantity,value) values($1,$2,1,0)",
        [fixture.itemId, fixture.mapping.initialLocation.id],
      ),
    ).rejects.toThrow();
  });
  it("abre otra sucursal sin heredar existencias", async () => {
    const [branch] = await fixture.db
      .insert(branches)
      .values({ code: "TEST-B", name: "Sucursal B", timeZone: "UTC" })
      .returning();
    const [location] = await fixture.db
      .insert(locations)
      .values({ branchId: branch.id, code: "MAIN", name: "Depósito B" })
      .returning();
    expect(
      await fixture.db
        .select()
        .from(locationStockBalances)
        .where(eq(locationStockBalances.branchId, branch.id)),
    ).toEqual([]);
    await expect(
      fixture.db.insert(locationStockBalances).values({
        itemId: fixture.itemId,
        locationId: location.id,
        branchId: fixture.mapping.initialBranch.id,
      }),
    ).rejects.toThrow();
    expect((await reconcile(fixture.db, [branch.id])).ok).toBe(true);
  });
  it("detecta divergencias sin repararlas silenciosamente", async () => {
    await fixture.db
      .update(locationStockBalances)
      .set({ quantity: "11.000000" })
      .where(eq(locationStockBalances.itemId, fixture.itemId));
    const report = await reconcile(fixture.db, [
      fixture.mapping.initialBranch.id,
    ]);
    expect(report.ok).toBe(false);
    expect(report.differences.some((d) => d.code === "location_quantity")).toBe(
      true,
    );
  });
});
