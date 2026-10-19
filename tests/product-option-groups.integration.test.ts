import { beforeAll, afterAll, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createDataModelTestContext } from "./helpers/data-model-database";
import {
  user,
  operationalUsers,
  products,
  productOptionGroupVersions,
  productOptionGroupProducts,
  branchProducts,
  items,
  productFulfillmentVersions,
  productFulfillments,
  auditEvents,
} from "../src/db/schema";
import { createProductGroupService } from "../src/modules/combos/product-groups";
import { publishCombo, loadCombo } from "../src/modules/combos/service";
import { catalogProductCosts } from "../src/modules/catalog/product-costs";
import { readFile } from "node:fs/promises";

let c: Awaited<ReturnType<typeof createDataModelTestContext>>;
const actor = { id: "product-group-admin", role: "admin" as const };
let pepsi: string, seven: string, max: string, comboA: string, comboB: string;
const request = () => crypto.randomUUID();
beforeAll(async () => {
  c = await createDataModelTestContext();
  await c.db
    .insert(user)
    .values({ id: actor.id, name: "Manager", email: "groups@test.local" });
  await c.db
    .insert(operationalUsers)
    .values({ userId: actor.id, role: "admin" });
  const p = await c.db
    .insert(products)
    .values([
      { name: "Pepsi" },
      { name: "7up" },
      { name: "Pepsi Max" },
      { name: "Waffle con gaseosa", kind: "combo" },
      { name: "Pancho con gaseosa", kind: "combo" },
    ])
    .returning();
  [pepsi, seven, max, comboA, comboB] = p.map((p) => p.id);
});
afterAll(async () => {
  await c?.close();
});
const create = () =>
  createProductGroupService(c.db).save(actor, {
    requestId: request(),
    name: "Gaseosa a elección",
    productIds: [pepsi, seven],
  });

it("creates versioned reusable products and replays saves without duplicating", async () => {
  const svc = createProductGroupService(c.db);
  const input = {
    requestId: request(),
    name: "Bebidas",
    productIds: [pepsi, seven],
  };
  const first = await svc.save(actor, input);
  expect(first.options.map((p) => p.productId)).toEqual([pepsi, seven]);
  expect((await svc.save(actor, input)).versionId).toBe(first.versionId);
  expect(
    await c.db
      .select()
      .from(auditEvents)
      .where(eq(auditEvents.recordId, first.id)),
  ).toHaveLength(1);
  await expect(
    svc.save(actor, { ...input, name: "Otro" }),
  ).rejects.toBeDefined();
  expect((await svc.list(actor)).find((g) => g.id === first.id)).toMatchObject({
    revision: 1,
    productCount: 2,
  });
  const next = await svc.save(actor, {
    requestId: request(),
    id: first.id,
    revision: 1,
    name: "Bebidas nuevas",
    productIds: [pepsi, max],
  });
  expect(next.revision).toBe(2);
  expect(
    (await svc.get(actor, first.id, first.versionId)).options.map(
      (p) => p.productId,
    ),
  ).toEqual([pepsi, seven]);
  await expect(
    svc.save(actor, {
      requestId: request(),
      id: first.id,
      revision: 1,
      name: "Vieja",
      productIds: [pepsi],
    }),
  ).rejects.toMatchObject({ code: "CONFLICT" });
});

it("shares one definition but keeps combo quantity, surcharges and published versions independent", async () => {
  const svc = createProductGroupService(c.db),
    g = await create();
  const group = {
    name: g.name,
    sourceGroupId: g.id,
    sourceGroupVersionId: g.versionId,
    quantity: 1,
    options: g.options.map((p) => ({
      productId: p.productId,
      counter: p.productId === pepsi ? "100" : "0",
    })),
  };
  const a = await publishCombo(c.db, actor, comboA, {
    requestId: request(),
    revision: 0,
    groups: [group],
  });
  const b = await publishCombo(c.db, actor, comboB, {
    requestId: request(),
    revision: 0,
    groups: [
      {
        ...group,
        quantity: 2,
        options: group.options.map((o) => ({ ...o, counter: "0" })),
      },
    ],
  });
  expect(a.groups[0].options[0].counter).toBe("100.00");
  expect(b.groups[0].quantity).toBe(2);
  const updated = await svc.save(actor, {
    requestId: request(),
    id: g.id,
    revision: 1,
    name: "Gaseosas",
    productIds: [pepsi, max],
  });
  expect((await loadCombo(c.db, comboA))!.groups[0]).toMatchObject({
    source: { revision: 1, latestRevision: 2 },
  });
  expect(
    (await loadCombo(c.db, comboB))!.groups[0].options.map((o) => o.productId),
  ).toEqual([pepsi, seven]);
  await publishCombo(c.db, actor, comboA, {
    requestId: request(),
    revision: 1,
    groups: [
      {
        ...group,
        name: updated.name,
        sourceGroupVersionId: updated.versionId,
        options: updated.options.map((p) => ({ productId: p.productId })),
      },
    ],
  });
  expect(
    (await loadCombo(c.db, comboA))!.groups[0].options.map((o) => o.productId),
  ).toEqual([pepsi, max]);
  expect(
    (await loadCombo(c.db, comboA, a.id))!.groups[0].options.map(
      (o) => o.productId,
    ),
  ).toEqual([pepsi, seven]);
  expect((await loadCombo(c.db, comboB))!.id).toBe(b.id);
});

it("rejects forged memberships, foreign versions and duplicate shared groups atomically", async () => {
  const g = await create(),
    other = await create();
  const [p] = await c.db
    .insert(products)
    .values({ name: "Forgery combo", kind: "combo" })
    .returning();
  const base = {
    name: g.name,
    quantity: 1,
    sourceGroupId: g.id,
    sourceGroupVersionId: g.versionId,
    options: [{ productId: pepsi }, { productId: seven }],
  };
  for (const groups of [
    [{ ...base, options: [{ productId: pepsi }, { productId: max }] }],
    [{ ...base, sourceGroupVersionId: other.versionId }],
    [{ ...base, sourceGroupVersionId: undefined }],
    [base, base],
  ])
    await expect(
      publishCombo(c.db, actor, p.id, {
        requestId: request(),
        revision: 0,
        groups,
      }),
    ).rejects.toBeDefined();
  expect(await loadCombo(c.db, p.id)).toBeNull();
});

it("archives groups without breaking existing assignments and rejects new ones", async () => {
  const svc = createProductGroupService(c.db),
    g = await create();
  const rows = await c.db
    .insert(products)
    .values([
      { name: "Assigned", kind: "combo" },
      { name: "New", kind: "combo" },
    ])
    .returning();
  const group = {
    name: g.name,
    quantity: 1,
    sourceGroupId: g.id,
    sourceGroupVersionId: g.versionId,
    options: g.options.map((p) => ({ productId: p.productId })),
  };
  await publishCombo(c.db, actor, rows[0].id, {
    requestId: request(),
    revision: 0,
    groups: [group],
  });
  const input = { requestId: request(), revision: 1 };
  await svc.archive(actor, g.id, input);
  await svc.archive(actor, g.id, input);
  expect(
    await c.db.select().from(auditEvents).where(eq(auditEvents.recordId, g.id)),
  ).toHaveLength(2);
  expect((await svc.get(actor, g.id)).archivedAt).not.toBeNull();
  await expect(
    publishCombo(c.db, actor, rows[1].id, {
      requestId: request(),
      revision: 0,
      groups: [group],
    }),
  ).rejects.toBeDefined();
  expect(
    (
      await publishCombo(c.db, actor, rows[0].id, {
        requestId: request(),
        revision: 1,
        groups: [{ ...group, quantity: 2 }],
      })
    ).groups[0].quantity,
  ).toBe(2);
  await expect(
    svc.save(actor, {
      requestId: request(),
      id: g.id,
      revision: 1,
      name: g.name,
      productIds: [pepsi],
    }),
  ).rejects.toBeDefined();
});

it("rejects empty, repeated, archived or combo products and forged access", async () => {
  const svc = createProductGroupService(c.db);
  for (const productIds of [[], [pepsi, pepsi], [comboA]])
    await expect(
      svc.save(actor, { requestId: request(), name: "Invalid", productIds }),
    ).rejects.toBeDefined();
  const [p] = await c.db
    .insert(products)
    .values({ name: "Archived", archivedAt: new Date() })
    .returning();
  await expect(
    svc.save(actor, {
      requestId: request(),
      name: "Invalid",
      productIds: [p.id],
    }),
  ).rejects.toBeDefined();
  await c.db.insert(user).values({
    id: "group-staff",
    name: "Staff",
    email: "group-staff@test.local",
  });
  await c.db
    .insert(operationalUsers)
    .values({ userId: "group-staff", role: "staff" });
  await expect(
    svc.save(
      { id: "group-staff", role: "admin" },
      { requestId: request(), name: "Forbidden", productIds: [pepsi] },
    ),
  ).rejects.toMatchObject({ code: "FORBIDDEN" });
  const g = await create();
  await expect(svc.get(actor, g.id, crypto.randomUUID())).rejects.toBeDefined();
});

it("keeps group versions and product membership immutable at database level", async () => {
  const g = await create();
  await expect(
    c.db
      .update(productOptionGroupVersions)
      .set({ name: "Changed" })
      .where(eq(productOptionGroupVersions.id, g.versionId)),
  ).rejects.toBeDefined();
  await expect(
    c.db
      .delete(productOptionGroupProducts)
      .where(eq(productOptionGroupProducts.versionId, g.versionId)),
  ).rejects.toBeDefined();
  expect(
    (await createProductGroupService(c.db).get(actor, g.id)).options,
  ).toHaveLength(2);
});

it("changes branch cost only when the combo explicitly publishes the newer shared version", async () => {
  const branchActor = { ...actor, branchId: c.mapping.initialBranch.id };
  const children = await c.db
    .insert(products)
    .values([{ name: "Drink 1200" }, { name: "Drink 1500" }])
    .returning();
  const [combo] = await c.db
    .insert(products)
    .values({ name: "Cost combo", kind: "combo" })
    .returning();
  await c.db.insert(branchProducts).values(
    children.map((p) => ({
      productId: p.id,
      branchId: branchActor.branchId,
      enabled: true,
    })),
  );
  for (const [i, p] of children.entries()) {
    const [item] = await c.db
      .insert(items)
      .values({
        name: p.name,
        code: `GROUP-COST-${i}`,
        class: "beverage",
        baseUnit: "unit",
        stockTracked: true,
        purchasable: true,
        recipeUsable: false,
        unitCost: i ? "1500" : "1200",
      })
      .returning();
    const [v] = await c.db
      .insert(productFulfillmentVersions)
      .values({
        productId: p.id,
        version: 1,
        mode: "direct",
        itemId: item.id,
        quantity: "1",
      })
      .returning();
    await c.db
      .insert(productFulfillments)
      .values({ productId: p.id, versionId: v.id });
  }
  const svc = createProductGroupService(c.db);
  const first = await svc.save(actor, {
    requestId: request(),
    name: "Cost drinks",
    productIds: [children[0].id],
  });
  const input = (g: typeof first, revision: number) => ({
    requestId: request(),
    revision,
    groups: [
      {
        name: g.name,
        sourceGroupId: g.id,
        sourceGroupVersionId: g.versionId,
        quantity: 1,
        options: g.options.map((o) => ({ productId: o.productId })),
      },
    ],
  });
  await publishCombo(c.db, actor, combo.id, input(first, 0));
  const cost = async () =>
    (await catalogProductCosts(c.db, branchActor, { ids: [combo.id] }))
      .products[0];
  expect(await cost()).toMatchObject({
    min: "1200.000000",
    max: "1200.000000",
  });
  const next = await svc.save(actor, {
    requestId: request(),
    id: first.id,
    revision: 1,
    name: first.name,
    productIds: children.map((p) => p.id),
  });
  expect(await cost()).toMatchObject({
    min: "1200.000000",
    max: "1200.000000",
  });
  await publishCombo(c.db, actor, combo.id, input(next, 1));
  expect(await cost()).toMatchObject({
    min: "1200.000000",
    max: "1500.000000",
  });
});

it("migrates existing combo definitions without replacing options or identifiers", async () => {
  const old = await createDataModelTestContext({ legacyComboGroups: true });
  try {
    await old.client
      .exec(`INSERT INTO "user"(id,name,email) VALUES('legacy-group','Legacy','legacy-group@test.local');
      INSERT INTO products(id,name,kind) VALUES('10000000-0000-4000-8000-000000000001','Legacy combo','combo'),('10000000-0000-4000-8000-000000000002','Drink','individual');
      INSERT INTO combo_versions(id,product_id,revision,actor_id) VALUES('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001',1,'legacy-group');
      INSERT INTO combo_groups(id,version_id,name,position,quantity) VALUES('30000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','Drinks',0,2);
      INSERT INTO combo_options(id,group_id,product_id,position,counter) VALUES('40000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000002',0,100);`);
    const before = await old.client.query("select * from combo_options");
    await old.client.exec(
      await readFile("drizzle/0019_product_option_groups.sql", "utf8"),
    );
    expect(
      (await old.client.query("select * from combo_options")).rows,
    ).toEqual(before.rows);
    const combo = await loadCombo(
      old.db,
      "10000000-0000-4000-8000-000000000001",
    );
    expect(combo!.groups[0]).toMatchObject({ quantity: 2, source: null });
    expect(combo!.groups[0].options[0]).toMatchObject({
      id: "40000000-0000-4000-8000-000000000001",
      counter: "100.00",
    });
  } finally {
    await old.close();
  }
});
