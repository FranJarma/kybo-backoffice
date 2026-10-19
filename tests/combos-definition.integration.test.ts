import { afterAll, beforeAll, expect, it } from "vitest";
import { createDataModelTestContext } from "./helpers/data-model-database";
import {
  user,
  operationalUsers,
  products,
  comboVersions,
} from "../src/db/schema";
import { eq } from "drizzle-orm";
import { getCombo, publishCombo } from "../src/modules/combos/service";
let c: Awaited<ReturnType<typeof createDataModelTestContext>>;
const actor = { id: "combo-admin", role: "admin" as const };
let combo: string, classic: string;
beforeAll(async () => {
  c = await createDataModelTestContext();
  await c.db
    .insert(user)
    .values({ id: actor.id, name: "Manager", email: "combo@test.local" });
  await c.db
    .insert(operationalUsers)
    .values({ userId: actor.id, role: actor.role });
  const rows = await c.db
    .insert(products)
    .values([{ name: "Combo", kind: "combo" }, { name: "Classic" }])
    .returning();
  combo = rows[0].id;
  classic = rows[1].id;
});
afterAll(async () => {
  await c?.close();
});
it("denies staff publication even when the client claims administrator rights", async () => {
  await c.db
    .insert(user)
    .values({
      id: "combo-staff",
      name: "Staff",
      email: "combo-staff@test.local",
    });
  await c.db
    .insert(operationalUsers)
    .values({ userId: "combo-staff", role: "staff" });
  await expect(
    publishCombo(c.db, { id: "combo-staff", role: "admin" }, combo, {
      requestId: crypto.randomUUID(),
      revision: 0,
      groups: [
        { name: "Waffle", quantity: 1, options: [{ productId: classic }] },
      ],
    }),
  ).rejects.toMatchObject({ code: "FORBIDDEN" });
});
it("publishes references, preserves versions and handles retries", async () => {
  const input = {
    requestId: crypto.randomUUID(),
    revision: 0,
    groups: [
      { name: "Waffle", quantity: 1, options: [{ productId: classic }] },
    ],
  };
  const first = await publishCombo(c.db, actor, combo, input);
  expect(first.groups[0].options[0].productId).toBe(classic);
  expect((await publishCombo(c.db, actor, combo, input)).id).toBe(first.id);
  const second = await publishCombo(c.db, actor, combo, {
    ...input,
    requestId: crypto.randomUUID(),
    revision: 1,
  });
  expect(second.id).not.toBe(first.id);
  await expect(
    c.db
      .update(comboVersions)
      .set({ revision: 999 })
      .where(eq(comboVersions.id, first.id)),
  ).rejects.toBeDefined();
  expect((await getCombo(c.db, actor, combo))?.revision).toBe(2);
  await expect(
    publishCombo(c.db, actor, combo, {
      ...input,
      requestId: crypto.randomUUID(),
    }),
  ).rejects.toBeDefined();
});
it("rejects nested combos and duplicate options", async () => {
  for (const options of [
    [{ productId: combo }],
    [{ productId: classic }, { productId: classic }],
  ])
    await expect(
      publishCombo(c.db, actor, combo, {
        requestId: crypto.randomUUID(),
        revision: 2,
        groups: [{ name: "Invalid", quantity: 1, options }],
      }),
    ).rejects.toBeDefined();
});
