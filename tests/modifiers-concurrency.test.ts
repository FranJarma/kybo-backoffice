import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { Pool, Client } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { eq } from "drizzle-orm";
import type { AppDb } from "@/db/client";
import * as schema from "@/db/schema";
import { createRecipeService } from "@/modules/recipes/service";
import { createSalesService } from "@/modules/sales/service";
import { createCatalogService } from "@/modules/catalog/service";
const url = process.env.KYBO_TEST_DATABASE_URL;
describe.skipIf(!url)(
  "independent PostgreSQL connections (requires KYBO_TEST_DATABASE_URL)",
  () => {
    const namespace = "kybo_mod_test_" + randomUUID().replaceAll("-", "");
    const actor = { id: randomUUID(), role: "admin" as const };
    let observer: Client;
    let pools: Pool[] = [];
    let databases: AppDb[] = [];
    beforeAll(async () => {
      observer = new Client({ connectionString: url });
      await observer.connect();
      await observer.query(`CREATE SCHEMA "${namespace}"`);
      await observer.query(`SET search_path TO "${namespace}"`);
      const journal = JSON.parse(
        await readFile("drizzle/meta/_journal.json", "utf8"),
      );
      for (const e of journal.entries) {
        const sql = await readFile(`drizzle/${e.tag}.sql`, "utf8");
        await observer.query(sql.replaceAll('"public".', `"${namespace}".`));
      }
      pools = [0, 1].map(
        (i) =>
          new Pool({
            connectionString: url,
            max: 1,
            options: `-c search_path=${namespace}`,
            application_name: `${namespace}_${i}`,
          }),
      );
      databases = pools.map(
        (pool) => drizzle(pool, { schema }) as unknown as AppDb,
      );
      await databases[0].insert(schema.user).values({
        id: actor.id,
        name: "Test",
        email: `${actor.id}@test.local`,
        emailVerified: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    }, 60000);
    afterAll(async () => {
      await Promise.all(pools.map((p) => p.end()));
      if (observer) {
        try {
          await observer.query("ROLLBACK");
          await observer.query(`DROP SCHEMA IF EXISTS "${namespace}" CASCADE`);
        } finally {
          await observer.end();
        }
      }
    });
    async function fixture() {
      const db = databases[0];
      const [item] = await db
        .insert(schema.items)
        .values({
          code: randomUUID(),
          class: "food",
          purchasable: true,
          recipeUsable: true,
          name: "Pearls",
          baseUnit: "g",
          unitCost: "2",
        })
        .returning();
      const [product] = await db
        .insert(schema.products)
        .values({ name: "Tea" })
        .returning();
      await db
        .insert(schema.productPrices)
        .values({ productId: product.id, channel: "counter", amount: "10" });
      const [method] = await db
        .insert(schema.paymentMethods)
        .values({ name: "Cash", kind: "cash" })
        .returning();
      const draft = {
        requestId: randomUUID(),
        kind: "product",
        targetId: product.id,
        yieldQuantity: "1",
        compositionModel: "configurable",
        lines: [],
        groups: [
          {
            draft: {
              requestId: randomUUID(),
              name: "Test",
              options: [
                {
                  key: "a",
                  name: "A",
                  kind: "composition",
                  components: [{ itemId: item.id, quantity: "5" }],
                },
              ],
            },
            name: "A",
            min: 1,
            max: 1,
            factor: "1",
            options: [
              {
                optionKey: "a",
                enabled: true,
                defaultCount: 1,
                maxCount: 1,
                mode: "inherit",
                prices: { counter: "0" },
              },
            ],
          },
        ],
      };
      const recipe = await createRecipeService(db).save(actor, draft);
      const binding = recipe.configuration!.groups[0];
      const sale = {
        requestId: randomUUID(),
        origin: "counter",
        channel: "counter",
        fulfillment: "takeaway",
        lines: [
          {
            productId: product.id,
            quantity: 1,
            price: "10",
            expectedPrice: "10.00",
            expectedRecipeVersionId: recipe.versionId,
            modifiers: [
              { recipeModifierOptionId: binding.options[0].id, count: 1 },
            ],
          },
        ],
        payments: [{ collector: "local", methodId: method.id, amount: "10" }],
      };
      return { item, product, recipe, binding, sale };
    }
    async function waitForBlocked(n: number) {
      const deadline = Date.now() + 10000;
      while (Date.now() < deadline) {
        const r = await observer.query(
          "select count(*)::int n from pg_stat_activity where application_name like $1 and wait_event_type=$2",
          [namespace + "_%", "Lock"],
        );
        if (r.rows[0].n >= n) return;
        await new Promise((r) => setTimeout(r, 10));
      }
      throw new Error("Expected concurrent lock wait not observed");
    }
    it("replays simultaneous identical requests into one sale", async () => {
      const f = await fixture();
      const [a, b] = await Promise.all(
        databases.map((db) => createSalesService(db).create(actor, f.sale)),
      );
      expect(a.id).toBe(b.id);
      expect(a.orders).toHaveLength(1);
    });
    it("serializes publication and sale without mixing recipe versions", async () => {
      const f = await fixture();
      await observer.query("BEGIN");
      await observer.query(
        "select * from recipe_graph_lock where id=1 for update",
      );
      const sale = createSalesService(databases[0])
        .create(actor, f.sale)
        .then(
          (value) => ({ value, error: null }),
          (error) => ({ value: null, error }),
        );
      const publish = createRecipeService(databases[1]).save(actor, {
        requestId: randomUUID(),
        id: f.recipe.id,
        revision: 1,
        kind: "product",
        targetId: f.product.id,
        yieldQuantity: "1",
        compositionModel: "configurable",
        lines: [],
        groups: [
          {
            groupVersionId: f.binding.groupVersionId,
            name: "A",
            min: 1,
            max: 1,
            factor: "2",
            options: [
              {
                optionId: f.binding.options[0].optionId,
                enabled: true,
                defaultCount: 1,
                maxCount: 1,
                mode: "inherit",
                prices: { counter: "0" },
              },
            ],
          },
        ],
      });
      try {
        await waitForBlocked(2);
      } finally {
        await observer.query("COMMIT");
      }
      const [result, newRecipe] = await Promise.all([sale, publish]);
      expect(newRecipe.revision).toBe(2);
      if (result.error) expect(result.error.status).toBe(409);
      else {
        expect(result.value!.orders[0].lines[0].recipeVersionId).toBe(
          f.recipe.versionId,
        );
        const components = await databases[0]
          .select()
          .from(schema.saleLineComponents)
          .where(
            eq(
              schema.saleLineComponents.saleLineId,
              result.value!.orders[0].lines[0].id,
            ),
          );
        expect(components[0].quantity).toBe("5.000000");
      }
    });
    it("serializes item archive against accepting a composition", async () => {
      const f = await fixture();
      await observer.query("BEGIN");
      await observer.query("select id from items where id=$1 for update", [
        f.item.id,
      ]);
      const sale = createSalesService(databases[0])
        .create(actor, f.sale)
        .then(
          (value) => ({ value, error: null }),
          (error) => ({ value: null, error }),
        );
      const archive = createCatalogService(databases[1]).updateRecord(
        actor,
        "items",
        f.item.id,
        { revision: 1, archived: true },
      );
      try {
        await waitForBlocked(2);
      } finally {
        await observer.query("COMMIT");
      }
      const [result] = await Promise.all([sale, archive]);
      if (result.error) expect([400, 409]).toContain(result.error.status);
      else
        expect(result.value!.orders[0].lines[0].compositionStatus).toBe(
          "resolved",
        );
    });
  },
);
