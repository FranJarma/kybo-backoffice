import { randomUUID as uid } from "node:crypto";
import { beforeAll, afterAll, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb } from "./helpers/database";
import {
  user,
  operationalUsers,
  products,
  productPrices,
  paymentMethods,
  sales as saleTable,
} from "@/db/schema";
import { preparationTasks } from "@/db/preparation-schema";
import { createSalesService } from "@/modules/sales/service";
import { createPreparationService } from "@/modules/preparation/service";
import { createPreparationSettings } from "@/modules/preparation/settings";
import { createCatalogService } from "@/modules/catalog/service";
import { orderTiming } from "@/modules/preparation/timing";
import type { Actor } from "@/lib/access";

const admin: Actor = { id: "prep-admin", role: "admin" };
const staff: Actor = { id: "prep-staff", role: "staff" };
const other: Actor = { id: "prep-other", role: "staff" };
let ctx: Awaited<ReturnType<typeof createTestDb>>;
let sales: ReturnType<typeof createSalesService>;
let prep: ReturnType<typeof createPreparationService>;
let settings: ReturnType<typeof createPreparationSettings>;
let drink: string,
  food: string,
  unrouted: string,
  methodId: string,
  bar: string,
  kitchen: string;
beforeAll(async () => {
  ctx = await createTestDb();
  sales = createSalesService(ctx.db);
  prep = createPreparationService(ctx.db);
  settings = createPreparationSettings(ctx.db);
  for (const a of [admin, staff, other]) {
    await ctx.db
      .insert(user)
      .values({ id: a.id, name: a.id, email: `${a.id}@test.local` });
    await ctx.db
      .insert(operationalUsers)
      .values({ userId: a.id, role: a.role });
  }
  const prods = await ctx.db
    .insert(products)
    .values([
      { name: "Bebida" },
      { name: "Waffle" },
      { name: "Nuevo sin estación" },
    ])
    .returning();
  [drink, food, unrouted] = prods.map((p) => p.id);
  await ctx.db.insert(productPrices).values(
    prods.map((p) => ({
      productId: p.id,
      channel: "counter",
      amount: "1000",
    })),
  );
  [methodId] = (
    await ctx.db
      .insert(paymentMethods)
      .values({ name: "Efectivo", kind: "cash" })
      .returning()
  ).map((p) => p.id);
  bar = (await settings.saveStation(admin, { requestId: uid(), name: "Barra" }))
    .id;
  kitchen = (
    await settings.saveStation(admin, { requestId: uid(), name: "Cocina" })
  ).id;
  await settings.routeProduct(admin, {
    requestId: uid(),
    productId: drink,
    revision: 0,
    stationId: bar,
  });
  await settings.routeProduct(admin, {
    requestId: uid(),
    productId: food,
    revision: 0,
    stationId: kitchen,
  });
});
afterAll(async () => {
  await ctx?.close();
});
const input = (ids: string[] = [drink, food]) => ({
  requestId: uid(),
  origin: "counter",
  channel: "counter",
  fulfillment: "takeaway",
  notes: "Sin cubiertos",
  lines: ids.map((productId) => ({
    productId,
    price: "1000",
    expectedPrice: "1000.00",
    quantity: 1,
    notes: "Observación",
  })),
  payments: [
    { collector: "local", methodId, amount: String(ids.length * 1000) },
  ],
});
async function create(ids?: string[]) {
  const sale = await sales.create(staff, input(ids));
  return { sale, tasks: (await prep.list(staff, { saleId: sale.id })).rows };
}
it("publishes station tasks once, groups lines and rolls back unpaid counter orders", async () => {
  const command = input([drink, drink, food]);
  const sale = await sales.create(staff, command);
  await sales.create(staff, command);
  const list = await prep.list(staff, { saleId: sale.id });
  expect(list.total).toBe(2);
  expect(list.rows.find((t) => t.stationName === "Barra")?.lines).toHaveLength(
    2,
  );
  expect(
    list.rows.every((t) => t.status === "pending" && t.assigneeId === null),
  ).toBe(true);
  const before = (await prep.list(staff, {})).total;
  await expect(
    sales.create(staff, { ...input(), payments: [] }),
  ).rejects.toMatchObject({ status: 400 });
  expect((await prep.list(staff, {})).total).toBe(before);
  expect(JSON.stringify(list)).not.toMatch(
    /unitPrice|paidAmount|marketingOptIn|email/,
  );
});
it("keeps unrouted products visible in General", async () => {
  const { tasks } = await create([unrouted]);
  expect(tasks[0]).toMatchObject({
    stationId: null,
    stationName: "General",
    status: "pending",
  });
});
it("allows one start and preserves progress on replay after later events", async () => {
  const { tasks } = await create([drink]);
  const t = tasks[0];
  const start = { requestId: uid(), revision: 1, action: "start" };
  const otherStart = { ...start, requestId: uid() };
  const results = await Promise.allSettled([
    prep.act(staff, t.id, start),
    prep.act(other, t.id, otherStart),
  ]);
  expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  expect(results.find((r) => r.status === "rejected")).toMatchObject({
    reason: { status: 409 },
  });
  let detail = await prep.get(staff, t.id);
  const owner = detail.task.assigneeId === staff.id ? staff : other;
  await expect(
    prep.act(owner.id === staff.id ? other : staff, t.id, {
      requestId: uid(),
      revision: detail.task.revision,
      action: "ready",
    }),
  ).rejects.toMatchObject({ status: 403 });
  detail = await prep.act(owner, t.id, {
    requestId: uid(),
    revision: detail.task.revision,
    action: "ready",
  });
  expect(detail.task.status).toBe("ready");
  const replay = await prep.act(
    owner,
    t.id,
    owner.id === staff.id ? start : otherStart,
  );
  expect(replay.task.status).toBe("ready");
  expect(replay.events.filter((e) => e.action === "start")).toHaveLength(1);
  detail = await prep.act(other, t.id, {
    requestId: uid(),
    revision: detail.task.revision,
    action: "deliver",
  });
  expect(detail.task.status).toBe("delivered");
  expect(detail.task.deliveredAt).not.toBeNull();
});
it("reassigns with a reason, preserving the original preparation clock", async () => {
  const { tasks } = await create([food]);
  const t = tasks[0];
  let d = await prep.act(staff, t.id, {
    requestId: uid(),
    revision: 1,
    action: "start",
  });
  const startedAt = d.task.startedAt;
  const cmd = {
    requestId: uid(),
    revision: d.task.revision,
    action: "reassign",
    assigneeId: other.id,
    reason: "Cambio de estación",
  };
  await expect(prep.act(staff, t.id, cmd)).rejects.toMatchObject({
    status: 403,
  });
  await expect(
    prep.act(admin, t.id, { ...cmd, reason: "" }),
  ).rejects.toMatchObject({ status: 400 });
  d = await prep.act(admin, t.id, cmd);
  expect(d.task.assigneeId).toBe(other.id);
  expect(d.task.startedAt).toBe(startedAt);
  expect(d.events.at(-1)).toMatchObject({
    action: "reassign",
    reason: "Cambio de estación",
    actorName: admin.id,
  });
  await ctx.db
    .update(operationalUsers)
    .set({ disabled: true })
    .where(eq(operationalUsers.userId, staff.id));
  await expect(
    prep.act(admin, t.id, {
      ...cmd,
      requestId: uid(),
      revision: d.task.revision,
      assigneeId: staff.id,
    }),
  ).rejects.toMatchObject({ status: 400 });
  await ctx.db
    .update(operationalUsers)
    .set({ disabled: false })
    .where(eq(operationalUsers.userId, staff.id));
});
it("cancels only undelivered tasks atomically with the sale", async () => {
  const { sale, tasks } = await create();
  let d = await prep.act(staff, tasks[0].id, {
    requestId: uid(),
    revision: 1,
    action: "start",
  });
  d = await prep.act(staff, d.task.id, {
    requestId: uid(),
    revision: d.task.revision,
    action: "ready",
  });
  await prep.act(staff, d.task.id, {
    requestId: uid(),
    revision: d.task.revision,
    action: "deliver",
  });
  await sales.cancel(admin, sale.id, {
    requestId: uid(),
    revision: sale.revision,
    reason: "Devolución",
    refundConfirmed: true,
  });
  expect((await prep.get(staff, tasks[0].id)).task.status).toBe("delivered");
  const cancelled = await prep.get(staff, tasks[1].id);
  expect(cancelled.task.status).toBe("cancelled");
  expect(cancelled.events.at(-1)).toMatchObject({
    action: "cancel",
    reason: "Devolución",
  });
  await expect(
    prep.act(staff, tasks[1].id, {
      requestId: uid(),
      revision: cancelled.task.revision,
      action: "start",
    }),
  ).rejects.toMatchObject({ status: 409 });
  expect((await prep.list(staff, { saleId: sale.id })).total).toBe(0);
});
it("does not rewrite routes or station names on already published tasks", async () => {
  const station = await settings.saveStation(admin, {
    requestId: uid(),
    name: "Bebidas especiales",
  });
  const { tasks } = await create([drink]);
  await settings.routeProduct(admin, {
    requestId: uid(),
    productId: drink,
    revision: 1,
    stationId: station.id,
  });
  expect((await prep.get(staff, tasks[0].id)).task.stationId).toBe(bar);
  const { tasks: next } = await create([drink]);
  expect(next[0].stationName).toBe("Bebidas especiales");
  await settings.saveStation(admin, {
    requestId: uid(),
    id: station.id,
    revision: station.revision,
    name: "Barra nueva",
  });
  expect((await prep.get(staff, next[0].id)).task.stationName).toBe(
    "Bebidas especiales",
  );
  await expect(
    settings.saveStation(admin, {
      requestId: uid(),
      id: station.id,
      revision: 2,
      name: "Barra nueva",
      archived: true,
    }),
  ).rejects.toMatchObject({ status: 409 });
  await settings.routeProduct(admin, {
    requestId: uid(),
    productId: drink,
    revision: 2,
    stationId: bar,
  });
  await expect(
    settings.saveStation(admin, {
      requestId: uid(),
      id: station.id,
      revision: 2,
      name: "Barra nueva",
      archived: true,
    }),
  ).rejects.toMatchObject({ status: 409 });
});
it("restricts configuration and metrics, and rejects invalid state jumps", async () => {
  await expect(settings.list(staff, {})).rejects.toMatchObject({ status: 403 });
  await expect(prep.metrics(staff, "2026-09-25")).rejects.toMatchObject({
    status: 403,
  });
  await expect(prep.list(null, {})).rejects.toMatchObject({ status: 401 });
  const { tasks } = await create([food]);
  await expect(
    prep.act(staff, tasks[0].id, {
      requestId: uid(),
      revision: 1,
      action: "deliver",
    }),
  ).rejects.toMatchObject({ status: 409 });
  expect((await prep.get(staff, tasks[0].id)).events).toHaveLength(1);
});
it("finds and clears an archived product route without reactivating the product", async () => {
  const [p] = await ctx.db
    .insert(products)
    .values({ name: "Producto retirado" })
    .returning();
  const station = await settings.saveStation(admin, {
    requestId: uid(),
    name: "Estación retirada",
  });
  await settings.routeProduct(admin, {
    requestId: uid(),
    productId: p.id,
    revision: 0,
    stationId: station.id,
  });
  await createCatalogService(ctx.db).updateRecord(admin, "products", p.id, {
    revision: p.revision,
    archived: true,
  });
  expect((await settings.list(admin, { q: p.name })).products).toHaveLength(0);
  const listed = await settings.list(admin, {
    q: p.name,
    includeArchived: true,
  });
  expect(listed.products).toEqual([
    expect.objectContaining({
      id: p.id,
      archived: true,
      stationId: station.id,
      revision: 1,
    }),
  ]);
  await expect(
    settings.routeProduct(admin, {
      requestId: uid(),
      productId: p.id,
      revision: 1,
      stationId: kitchen,
    }),
  ).rejects.toMatchObject({ status: 400 });
  const clear = {
    requestId: uid(),
    productId: p.id,
    revision: 1,
    stationId: null,
  };
  expect((await settings.routeProduct(admin, clear)).revision).toBe(2);
  expect((await settings.routeProduct(admin, clear)).revision).toBe(2);
  expect(
    (
      await settings.saveStation(admin, {
        requestId: uid(),
        id: station.id,
        revision: station.revision,
        name: station.name,
        archived: true,
      })
    ).archived,
  ).toBe(true);
  const [persisted] = await ctx.db
    .select()
    .from(products)
    .where(eq(products.id, p.id));
  expect(persisted.archivedAt).not.toBeNull();
});
it("calculates elapsed order time without adding parallel station durations", () => {
  const shared = { enqueuedAt: "2026-09-25T12:00:00Z", status: "delivered" };
  const t = [
    {
      ...shared,
      startedAt: "2026-09-25T12:01:00Z",
      readyAt: "2026-09-25T12:03:00Z",
      deliveredAt: "2026-09-25T12:04:00Z",
    },
    {
      ...shared,
      startedAt: "2026-09-25T12:02:00Z",
      readyAt: "2026-09-25T12:04:00Z",
      deliveredAt: "2026-09-25T12:05:00Z",
    },
  ];
  expect(orderTiming(t)).toEqual({
    waitSeconds: 60,
    prepSeconds: 180,
    handoffSeconds: 60,
    totalSeconds: 300,
  });
  expect(
    orderTiming([
      t[0],
      { ...t[1], status: "preparing", readyAt: null, deliveredAt: null },
    ]),
  ).toMatchObject({
    waitSeconds: 60,
    prepSeconds: null,
    handoffSeconds: null,
    totalSeconds: null,
  });
  expect(
    orderTiming([
      {
        ...t[0],
        status: "pending",
        startedAt: null,
        readyAt: null,
        deliveredAt: null,
      },
    ]).waitSeconds,
  ).toBeNull();
});
it("summarizes completed orders once with sample size and channel counts", async () => {
  const { sale, tasks } = await create();
  await ctx.db
    .update(saleTable)
    .set({ businessDate: "2026-09-14" })
    .where(eq(saleTable.id, sale.id));
  for (let i = 0; i < tasks.length; i++)
    await ctx.db
      .update(preparationTasks)
      .set({
        status: "delivered",
        assigneeId: staff.id,
        enqueuedAt: new Date("2026-09-14T12:00:00Z"),
        startedAt: new Date(`2026-09-14T12:0${i + 1}:00Z`),
        readyAt: new Date(`2026-09-14T12:0${i + 3}:00Z`),
        deliveredAt: new Date("2026-09-14T12:05:00Z"),
      })
      .where(eq(preparationTasks.id, tasks[i].id));
  const m = await prep.metrics(admin, "2026-09-14");
  expect(m).toMatchObject({
    orders: 1,
    sample: 1,
    byOrigin: { counter: 1, table: 0, delivery: 0 },
    averages: {
      waitSeconds: 60,
      prepSeconds: 180,
      handoffSeconds: 60,
      totalSeconds: 300,
    },
  });
});
