import { it, expect } from "vitest";
import { readFile } from "node:fs/promises";
import { createDataModelTestContext } from "./helpers/data-model-database";
it("adds pending tax/fee configuration without changing existing prices or historical values", async () => {
  const c = await createDataModelTestContext({ legacyPricing: true });
  try {
    await c.client.exec(
      "insert into products(name) values('Existing'); insert into payment_methods(name,kind) values('Existing cash','cash')",
    );
    const p = (
      await c.client.query<{ id: string }>(
        "select id from products where name='Existing'",
      )
    ).rows[0];
    await c.client.query(
      "insert into product_prices(product_id,channel,amount) values($1,'counter',10000)",
      [p.id],
    );
    const before = (await c.client.query("select * from product_prices")).rows;
    await c.client.exec(
      await readFile("drizzle/0021_product_vat_payment_fees.sql", "utf8"),
    );
    expect((await c.client.query("select * from product_prices")).rows).toEqual(
      before,
    );
    expect(
      (
        await c.client.query<{ vat_rate: string | null }>(
          "select vat_rate from products",
        )
      ).rows.every((r) => r.vat_rate === null),
    ).toBe(true);
    expect(
      (
        await c.client.query<{ commission_percent: string | null }>(
          "select commission_percent from payment_methods",
        )
      ).rows.every((r) => r.commission_percent === null),
    ).toBe(true);
    await expect(
      c.client.exec("update products set vat_rate=20"),
    ).rejects.toThrow();
    await expect(
      c.client.exec("update payment_methods set commission_percent=101"),
    ).rejects.toThrow();
  } finally {
    await c.close();
  }
});
