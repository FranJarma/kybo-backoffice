import { test, expect, type Page } from "@playwright/test";
import { randomUUID as uid } from "node:crypto";
import { mkdir } from "node:fs/promises";
import {
  restoreAdminSession,
  saveAdminSession,
  restoreStaffSession,
  saveStaffSession,
} from "../helpers/browser-session";
import type { PrepList, PrepDetail } from "@/modules/preparation/types";
test.skip(
  !process.env.E2E_EMAIL || !process.env.E2E_PASSWORD,
  "Temporary credentials required",
);
async function login(page: Page, staff = false) {
  const restored = await (staff
    ? restoreStaffSession(page)
    : restoreAdminSession(page));
  if (!restored) {
    await page.goto("/login");
    await page
      .getByLabel("Correo electrónico")
      .fill((staff ? process.env.E2E_STAFF_EMAIL : process.env.E2E_EMAIL)!);
    await page.getByLabel("Contraseña").fill(process.env.E2E_PASSWORD!);
    await page.getByRole("button", { name: "Ingresar" }).click();
    await expect(page).toHaveURL(staff ? "/sales" : "/", { timeout: 25000 });
    await (staff ? saveStaffSession(page) : saveAdminSession(page));
  }
  await page.goto("/kitchen");
}
async function post(page: Page, url: string, data: unknown) {
  const r = await page.request.post(url, {
    data,
    headers: { Origin: new URL(page.url()).origin },
  });
  expect(r.ok(), await r.text()).toBe(true);
  return r.json();
}
async function product(page: Page, name: string) {
  return (
    await post(page, "/api/catalog/products", {
      name,
      priceCounter: "7000",
      pricePedidosYa: "7500",
      priceUberEats: "",
    })
  ).row;
}
async function sale(page: Page, products: { id: string }[]) {
  const method = (
    await post(page, "/api/catalog/payment-methods", {
      name: `Efectivo ${uid().slice(0, 6)}`,
      kind: "cash",
    })
  ).row;
  return post(page, "/api/sales", {
    requestId: uid(),
    origin: "counter",
    channel: "counter",
    fulfillment: "takeaway",
    notes: "Retira en mostrador",
    lines: products.map((p) => ({
      productId: p.id,
      quantity: 1,
      price: "7000",
      expectedPrice: "7000.00",
      notes: "Sin azúcar agregada",
    })),
    payments: [
      {
        collector: "local",
        methodId: method.id,
        amount: String(products.length * 7000),
      },
    ],
  });
}
test("stations route orders to two screens and recover a confirmed action after reload", async ({
  page,
  browser,
  request,
}) => {
  test.setTimeout(180000);
  expect((await request.get("/api/preparation")).status()).toBe(401);
  await login(page);
  await expect(
    page.getByRole("heading", { name: "Comandas", exact: true }),
  ).toBeVisible();
  const drink = await product(page, "Taro Iced Latte · preparación");
  const food = await product(page, "Dúo Waffle · preparación");
  await page.getByRole("button", { name: "Estaciones", exact: true }).click();
  for (const name of ["Barra", "Cocina"]) {
    await page.getByLabel("Nueva estación").fill(name);
    await page.getByRole("button", { name: "Crear estación" }).click();
    await expect(page.getByLabel("Nueva estación")).toHaveValue("");
  }
  const config = await (
    await page.request.get("/api/preparation/settings")
  ).json();
  for (const [p, name] of [
    [drink, "Barra"],
    [food, "Cocina"],
  ] as const) {
    await page.getByLabel("Buscar producto para asignar").fill(p.name);
    await page
      .getByLabel(`Estación para ${p.name}`)
      .selectOption(
        config.stations.find((s: { name: string }) => s.name === name).id,
      );
    await page
      .getByRole("button", { name: `Guardar ${p.name}`, exact: true })
      .click();
    await expect(page.getByRole("status")).toContainText("Asignación guardada");
  }
  await page.getByRole("button", { name: "Volver a comandas" }).click();
  const created = await sale(page, [drink, food]);
  await page.goto(`/kitchen?sale=${created.id}`);
  const list: PrepList = await (
    await page.request.get(`/api/preparation?saleId=${created.id}`)
  ).json();
  expect(list.total).toBe(2);
  const bar = list.rows.find((t) => t.stationName === "Barra")!,
    kitchen = list.rows.find((t) => t.stationName === "Cocina")!;
  const ctx = await browser.newContext();
  const staff = await ctx.newPage();
  await login(staff, true);
  await staff.goto(`/kitchen?sale=${created.id}`);
  expect((await staff.request.get("/api/preparation/settings")).status()).toBe(
    403,
  );
  expect((await staff.request.get("/api/preparation/metrics")).status()).toBe(
    403,
  );
  await expect(
    staff.getByRole("button", { name: "Estaciones", exact: true }),
  ).toHaveCount(0);
  let dropped = false;
  await staff.route(`**/api/preparation/${bar.id}`, async (route) => {
    if (route.request().method() === "POST" && !dropped) {
      const r = await route.fetch();
      expect(r.ok()).toBe(true);
      dropped = true;
      await route.abort("failed");
    } else await route.continue();
  });
  await staff
    .getByTestId(`prep-task-${bar.id}`)
    .getByRole("button", { name: "Empezar", exact: true })
    .click();
  await expect(
    staff.getByRole("button", { name: "Reintentar mismo envío" }),
  ).toBeVisible();
  await staff.reload();
  await staff.getByRole("button", { name: "Reintentar mismo envío" }).click();
  await expect(
    staff.getByRole("button", { name: "Reintentar mismo envío" }),
  ).toHaveCount(0);
  const replayResponse = await staff.request.get(`/api/preparation/${bar.id}`);
  expect(
    replayResponse.status(),
    (await replayResponse.text()).slice(0, 80),
  ).toBe(200);
  expect(replayResponse.headers()["content-type"]).toContain(
    "application/json",
  );
  let detail: PrepDetail = await replayResponse.json();
  expect(detail.events.filter((e) => e.action === "start")).toHaveLength(1);
  const conflict = await page.request.post(`/api/preparation/${bar.id}`, {
    headers: { Origin: new URL(page.url()).origin },
    data: { requestId: uid(), revision: 1, action: "start" },
  });
  expect(conflict.status()).toBe(409);
  await staff
    .getByTestId(`prep-task-${bar.id}`)
    .getByRole("button", { name: "Marcar listo" })
    .click();
  await page
    .getByTestId(`prep-task-${kitchen.id}`)
    .getByRole("button", { name: "Empezar", exact: true })
    .click();
  await page
    .getByTestId(`prep-task-${kitchen.id}`)
    .getByRole("button", { name: "Marcar listo" })
    .click();
  await expect(page.getByTestId(`prep-task-${bar.id}`)).toContainText(
    "Pedido completo listo",
  );
  for (const t of [bar, kitchen])
    await page
      .getByTestId(`prep-task-${t.id}`)
      .getByRole("button", { name: "Entregar", exact: true })
      .click();
  await expect(
    page.getByText("No hay tareas para estos filtros."),
  ).toBeVisible();
  await page.getByRole("button", { name: "Finalizadas", exact: true }).click();
  await expect(page.getByTestId(`prep-task-${bar.id}`)).toContainText(
    "Entregado",
  );
  await page
    .getByTestId(`prep-task-${bar.id}`)
    .getByRole("button", { name: "Ver detalle" })
    .click();
  await expect(page.getByRole("dialog")).toContainText("Personal Test");
  await page.getByRole("button", { name: "Cerrar", exact: true }).click();
  detail = await (await page.request.get(`/api/preparation/${bar.id}`)).json();
  expect(detail.task.deliveredAt).not.toBeNull();
  const metrics = await (
    await page.request.get("/api/preparation/metrics")
  ).json();
  expect(metrics.sample).toBeGreaterThanOrEqual(1);
  await page.getByRole("button", { name: "Resumen del día" }).click();
  await expect(
    page.getByRole("heading", { name: "Tiempos de atención" }),
  ).toBeVisible();
  await expect(page.getByText(/Promedios de \d+ comanda/)).toBeVisible();
  await page.setViewportSize({ width: 1440, height: 1000 });
  await mkdir("docs/previews", { recursive: true });
  await page.screenshot({
    path: "docs/previews/preparation-metrics.png",
    fullPage: true,
  });
  await ctx.close();
});
test("mobile preparation blocks actions offline and refreshes when connection returns", async ({
  page,
}) => {
  test.setTimeout(120000);
  await login(page);
  await expect(
    page.getByRole("heading", { name: "Comandas", exact: true }),
  ).toBeVisible();
  const prods = [];
  for (const [i, name] of [
    "Taro Iced Latte",
    "Dúo Waffle",
    "Kybo Shake",
  ].entries()) {
    const p = await product(page, `${name} · vista`);
    prods.push(p);
    const s = await post(page, "/api/preparation/settings/stations", {
      requestId: uid(),
      name: ["Barra fría", "Waffles", "Entrega"][i],
    });
    await post(page, "/api/preparation/settings/routes", {
      requestId: uid(),
      productId: p.id,
      revision: 0,
      stationId: s.id,
    });
  }
  const created = await sale(page, prods);
  const list: PrepList = await (
    await page.request.get(`/api/preparation?saleId=${created.id}`)
  ).json();
  const pending = list.rows[0];
  await post(page, `/api/preparation/${list.rows[1].id}`, {
    requestId: uid(),
    revision: 1,
    action: "start",
  });
  await post(page, `/api/preparation/${list.rows[2].id}`, {
    requestId: uid(),
    revision: 1,
    action: "start",
  });
  await post(page, `/api/preparation/${list.rows[2].id}`, {
    requestId: uid(),
    revision: 2,
    action: "ready",
  });
  await page.goto(`/kitchen?sale=${created.id}`);
  const button = page
    .getByTestId(`prep-task-${pending.id}`)
    .getByRole("button", { name: "Empezar", exact: true });
  await expect(button).toBeEnabled();
  await page.context().setOffline(true);
  await expect(
    page.getByRole("status").filter({ hasText: "Sin conexión" }),
  ).toBeVisible();
  await expect(button).toBeDisabled();
  await page.context().setOffline(false);
  await expect(button).toBeEnabled({ timeout: 20000 });
  await page.setViewportSize({ width: 1440, height: 1050 });
  await mkdir("docs/previews", { recursive: true });
  await page.screenshot({
    path: "docs/previews/preparation-desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "docs/previews/preparation-mobile.png",
    fullPage: true,
  });
});

test("open detail refreshes across sessions and locks its own stale data", async ({
  page,
  browser,
}) => {
  test.setTimeout(120000);
  await login(page);
  const p = await product(page, "Bebida · detalle vivo");
  const created = await sale(page, [p]);
  const list: PrepList = await (
    await page.request.get(`/api/preparation?saleId=${created.id}`)
  ).json();
  const task = list.rows[0];
  const context = await browser.newContext();
  const staff = await context.newPage();
  await login(staff, true);
  const started: PrepDetail = await post(staff, `/api/preparation/${task.id}`, {
    requestId: uid(),
    revision: 1,
    action: "start",
  });
  await page.goto(`/kitchen?sale=${created.id}`);
  await page
    .getByTestId(`prep-task-${task.id}`)
    .getByRole("button", { name: "Ver detalle" })
    .click();
  const dialog = page.getByRole("dialog");
  await expect(
    dialog.getByText("Empezó la preparación", { exact: true }),
  ).toBeVisible();
  const people: { id: string; name: string }[] = await (
    await page.request.get("/api/preparation/people")
  ).json();
  await dialog
    .getByLabel("Nuevo responsable")
    .selectOption(
      people.find((person) => person.id !== started.task.assigneeId)!.id,
    );
  await dialog.getByLabel("Motivo de transferencia").fill("Apoyo en barra");
  const confirm = dialog.getByRole("button", {
    name: "Confirmar transferencia",
  });
  await expect(confirm).toBeEnabled();
  // A successful background read must preserve a draft the manager is writing.
  await page.waitForResponse(
    (r) =>
      r.url().endsWith(`/api/preparation/${task.id}`) &&
      r.request().method() === "GET" &&
      r.status() === 200,
    { timeout: 12000 },
  );
  await expect(dialog.getByLabel("Motivo de transferencia")).toHaveValue(
    "Apoyo en barra",
  );
  let detailUnavailable = true;
  await page.route(`**/api/preparation/${task.id}`, async (route) => {
    if (route.request().method() === "GET" && detailUnavailable)
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ error: "Detalle temporalmente no disponible." }),
      });
    else await route.continue();
  });
  await expect(dialog.getByRole("alert")).toContainText(
    "Detalle temporalmente no disponible",
    { timeout: 12000 },
  );
  await expect(confirm).toBeDisabled();
  // Suspend this screen; the other worker completes the task independently.
  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", {
      configurable: true,
      get: () => true,
    });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await post(staff, `/api/preparation/${task.id}`, {
    requestId: uid(),
    revision: 2,
    action: "ready",
  });
  detailUnavailable = false;
  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", {
      configurable: true,
      get: () => false,
    });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await expect(dialog.getByText("Marcó listo", { exact: true })).toBeVisible({
    timeout: 12000,
  });
  await expect(
    dialog.getByRole("button", { name: "Confirmar transferencia" }),
  ).toHaveCount(0);
  await post(staff, `/api/preparation/${task.id}`, {
    requestId: uid(),
    revision: 3,
    action: "deliver",
  });
  await expect(
    dialog.getByText("Registró la entrega", { exact: true }),
  ).toBeVisible({ timeout: 12000 });
  await context.close();
});

test("archived products can release their stations in settings", async ({
  page,
}) => {
  test.setTimeout(120000);
  await login(page);
  const p = await product(page, "Producto retirado · configuración");
  const station = await post(page, "/api/preparation/settings/stations", {
    requestId: uid(),
    name: "Estación para retirar",
  });
  await post(page, "/api/preparation/settings/routes", {
    requestId: uid(),
    productId: p.id,
    revision: 0,
    stationId: station.id,
  });
  const archived = await page.request.patch(`/api/catalog/products/${p.id}`, {
    headers: { Origin: new URL(page.url()).origin },
    data: { revision: p.revision, archived: true },
  });
  expect(archived.ok()).toBe(true);
  await page.getByRole("button", { name: "Estaciones", exact: true }).click();
  await page.getByLabel("Buscar producto para asignar").fill(p.name);
  await expect(
    page.getByText("No hay productos para esta búsqueda."),
  ).toBeVisible();
  await page.getByLabel("Mostrar productos archivados").check();
  await page.getByLabel(`Estación para ${p.name}`).selectOption("");
  await page
    .getByRole("button", { name: `Guardar ${p.name}`, exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("Asignación guardada");
  await page
    .getByRole("button", { name: `Editar ${station.name}`, exact: true })
    .click();
  await page.getByRole("button", { name: "Archivar", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Estación guardada");
  const config = await (
    await page.request.get(
      `/api/preparation/settings?includeArchived=true&q=${encodeURIComponent(p.name)}`,
    )
  ).json();
  expect(config.products[0]).toMatchObject({
    id: p.id,
    archived: true,
    stationId: null,
  });
  expect(
    config.stations.find((s: { id: string }) => s.id === station.id).archived,
  ).toBe(true);
});
