import { test, expect, type Page } from "@playwright/test";
import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import type { SaleDetail } from "../../src/modules/sales/types";
const require = createRequire(import.meta.url);
const saleId = "22222222-2222-4222-8222-222222222222",
  orderId = "33333333-3333-4333-8333-333333333333";
const bundle = ".next-e2e/sale-detail-fixture.js";
let css = "";
test.beforeAll(async () => {
  await createRequire(require.resolve("tsx"))("esbuild").build({
    entryPoints: ["tests/helpers/sale-detail-ui.tsx"],
    outfile: bundle,
    bundle: true,
    platform: "browser",
    jsx: "automatic",
    define: {
      "process.env.NODE_ENV": '"production"',
      "process.env": '{"NODE_ENV":"production"}',
    },
  });
  css = (
    await createRequire(require.resolve("@tailwindcss/postcss"))("postcss")([
      require("@tailwindcss/postcss")(),
    ]).process(await readFile("src/app/globals.css", "utf8"), {
      from: "src/app/globals.css",
    })
  ).css;
});
function sale(): SaleDetail {
  return {
    id: saleId,
    number: 42,
    revision: 1,
    origin: "counter",
    channel: "counter",
    fulfillment: "takeaway",
    status: "closed",
    tableId: null,
    tableName: null,
    customerId: null,
    customerName: "Martina",
    externalId: null,
    totalAmount: "100.00",
    paidAmount: "100.00",
    balanceDue: "0.00",
    localCollected: "100.00",
    platformCollected: "0.00",
    orderCount: 1,
    businessDate: "2026-10-26",
    createdAt: "2026-10-26T15:00:00Z",
    closedAt: "2026-10-26T15:00:00Z",
    notes: "Sin azúcar",
    cancelReason: null,
    orders: [
      {
        id: orderId,
        sequence: 1,
        locatorNumber: 3,
        totalAmount: "100.00",
        notes: null,
        createdAt: "2026-10-26T15:00:00Z",
        lines: [
          {
            id: "44444444-4444-4444-8444-444444444444",
            productId: "product",
            name: "Café de prueba",
            quantity: 1,
            compositionStatus: "known",
            modifiers: [],
            listPrice: "100.00",
            unitPrice: "100.00",
            lineTotal: "100.00",
            priceReason: null,
            notes: null,
            recipeVersionId: null,
            lineKind: "individual",
            vatRate: "0",
            netTotal: "100.00",
            vatTotal: "0.00",
          },
        ],
      },
    ],
    payments: [
      {
        id: "payment",
        kind: "collection",
        collector: "local",
        methodName: "Efectivo",
        amount: "100.00",
        reference: null,
        originalPaymentId: null,
        createdAt: "2026-10-26T15:00:00Z",
        actorId: "modal-fixture",
        commissionPercent: "0",
        commissionAmount: "0.00",
        settlementNet: "100.00",
      },
    ],
  };
}
async function setup(page: Page, current = sale()) {
  await page.route("**/__sale-detail**", (r) =>
    r.fulfill({
      contentType: "text/html",
      body: `<html lang="es"><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style></head><body></body></html>`,
    }),
  );
  await page.route("**/api/**", (r) => {
    const url = new URL(r.request().url()),
      path = url.pathname;
    let json: unknown = { rows: [], total: 0, offset: 0, categories: [] };
    if (path === "/api/pickup")
      json = {
        count: 16,
        publicPath: "/pickup/test",
        occupied: [
          {
            id: "55555555-5555-4555-8555-555555555555",
            number: 3,
            orderId,
            saleId,
            label: "42.1",
            cancelled: false,
          },
        ],
      };
    else if (path.startsWith("/api/pickup/orders/"))
      json = [
        {
          id: "55555555-5555-4555-8555-555555555555",
          number: 3,
          assignedBy: "Operador",
          assignedAt: current.createdAt,
          returnedBy: null,
          returnedAt: null,
        },
      ];
    else if (
      path === "/api/sales/lookup" &&
      url.searchParams.get("kind") === "products"
    )
      json = {
        rows: [
          {
            id: "product",
            name: "Kybo Tea",
            price: "100.00",
            configured: true,
          },
        ],
        total: 1,
        categories: [],
      };
    else if (
      path === "/api/sales/lookup" &&
      url.searchParams.get("kind") === "payment-methods"
    )
      json = {
        rows: [{ id: "cash", name: "Efectivo", kind: "cash" }],
        total: 1,
      };
    else if (path.includes("/configuration"))
      json = {
        model: "direct",
        basePrice: "100.00",
        pricingRevision: 1,
        fulfillmentVersionId: "version",
      };
    else if (path === `/api/sales/${saleId}`) json = current;
    else if (path === "/api/sales")
      json = { rows: [current], total: 1, offset: 0 };
    else if (path === "/api/fulfillment/state")
      json = {
        rows: [
          {
            lineId: current.orders[0].lines[0].id,
            name: "Café de prueba",
            orderId,
            returnLots: [],
            progress: {
              mode: "direct",
              ordered: 1,
              completed: 0,
              delivered: 1,
              cancelled: 0,
            },
            task: null,
          },
        ],
        cancelled: false,
        resolution: null,
      };
    else if (path === "/api/inventory/replenishment")
      json = {
        alerts: [],
        policies: [],
        locations: [],
        items: [],
        asOf: current.createdAt,
      };
    return r.fulfill({ json });
  });
}
async function mount(page: Page, account = false) {
  await page.goto(`/__sale-detail${account ? `?account=${saleId}` : ""}`);
  await page.addScriptTag({ path: bundle });
}

async function openHistorySale(page: Page) {
  await page.getByRole("button", { name: "Historial", exact: true }).click();
  await page.getByRole("button").filter({ hasText: "#42 ·" }).click();
  return page.getByRole("dialog", { name: "Venta #42", exact: true });
}

test("opening from the locator list preserves the catalogue query and current draft", async ({
  page,
}) => {
  await setup(page);
  await mount(page);
  await page
    .getByRole("button", { name: "Agregar Kybo Tea", exact: true })
    .click();
  await page
    .getByRole("textbox", { name: "Buscar productos", exact: true })
    .fill("Kybo");
  await page
    .getByRole("button", { name: "Localizadores", exact: true })
    .click();
  await page.getByRole("link", { name: "Ver venta", exact: true }).click();
  await expect(
    page.getByRole("dialog", { name: "Venta #42", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Cerrar detalle de venta", exact: true })
    .click();
  await expect(
    page.getByRole("textbox", { name: "Buscar productos", exact: true }),
  ).toHaveValue("Kybo");
  await expect(
    page.locator("[data-pos-order]").getByText("Kybo Tea", { exact: true }),
  ).toBeVisible();
});

test("late reads cannot reopen a closed modal or replace the next sale", async ({
  page,
}) => {
  const first = sale(),
    second = {
      ...sale(),
      id: "66666666-6666-4666-8666-666666666666",
      number: 43,
    };
  await setup(page);
  await page.route("**/api/sales?**", (r) =>
    r.fulfill({ json: { rows: [first, second], total: 2, offset: 0 } }),
  );
  const gate = Promise.withResolvers<void>();
  await page.route(`**/api/sales/${saleId}`, async (r) => {
    await gate.promise;
    return r.fulfill({ json: first });
  });
  await page.route(`**/api/sales/${second.id}`, (r) =>
    r.fulfill({ json: second }),
  );
  await mount(page);
  await page.getByRole("button", { name: "Historial", exact: true }).click();
  await page.getByRole("button").filter({ hasText: "#42 ·" }).click();
  await expect(
    page.getByText("Cargando venta…", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Cerrar detalle de venta", exact: true })
    .click();
  await page.getByRole("button").filter({ hasText: "#43 ·" }).click();
  await expect(
    page.getByRole("dialog", { name: "Venta #43", exact: true }),
  ).toBeVisible();
  gate.resolve();
  await expect(
    page.getByRole("dialog", { name: "Venta #43", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("dialog", { name: "Venta #42", exact: true }),
  ).toHaveCount(0);
});

test("failed reads can be retried inside the same modal", async ({ page }) => {
  await setup(page);
  let failed = true;
  await page.route(`**/api/sales/${saleId}`, (r) =>
    r.fulfill(
      failed
        ? { status: 503, json: { error: "No se pudo consultar esta venta." } }
        : { json: sale() },
    ),
  );
  await mount(page);
  await openHistorySale(page);
  await expect(
    page.getByText("No se pudo consultar esta venta.", { exact: true }),
  ).toBeVisible();
  failed = false;
  await page
    .getByRole("button", { name: "Volver a consultar", exact: true })
    .click();
  await expect(
    page.getByRole("dialog", { name: "Venta #42", exact: true }),
  ).toBeVisible();
});

test("collecting an existing sale preserves the other customer's draft", async ({
  page,
}) => {
  const current = sale();
  Object.assign(current, {
    status: "open",
    paidAmount: "0.00",
    balanceDue: "100.00",
    localCollected: "0.00",
    payments: [],
  });
  await setup(page, current);
  const payments: unknown[] = [];
  await page.route(`**/api/sales/${saleId}/payments`, (r) => {
    payments.push(r.request().postDataJSON());
    Object.assign(current, {
      revision: 2,
      status: "closed",
      paidAmount: "100.00",
      balanceDue: "0.00",
      localCollected: "100.00",
      payments: sale().payments,
    });
    return r.fulfill({ json: current });
  });
  await mount(page);
  await page
    .getByRole("combobox", { name: "Cliente", exact: true })
    .fill("Marina nueva");
  await page
    .getByRole("button", { name: "Agregar Kybo Tea", exact: true })
    .click();
  await openHistorySale(page);
  await page
    .getByRole("button", { name: "Registrar cobro", exact: true })
    .click();
  await page.getByRole("button", { name: "Efectivo", exact: true }).click();
  await page
    .getByRole("button", { name: "Importe exacto", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Confirmar cobro", exact: true })
    .click();
  await expect(
    page
      .getByRole("dialog", { name: "Venta #42", exact: true })
      .getByText("Cobrada", { exact: true }),
  ).toBeVisible();
  expect(payments).toHaveLength(1);
  await page
    .getByRole("button", { name: "Cerrar detalle de venta", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Nueva venta", exact: true })
    .first()
    .click();
  await expect(
    page.getByRole("combobox", { name: "Cliente", exact: true }),
  ).toHaveValue("Marina nueva");
  await expect(
    page.locator("[data-pos-order]").getByText("Kybo Tea", { exact: true }),
  ).toBeVisible();
});

test("adding to a table account restores the earlier draft after saving", async ({
  page,
}) => {
  const current = sale();
  Object.assign(current, {
    origin: "table",
    status: "open",
    tableId: "table",
    tableName: "Mesa 3",
    paidAmount: "0.00",
    balanceDue: "100.00",
    localCollected: "0.00",
    payments: [],
  });
  await setup(page, current);
  const orders: Record<string, unknown>[] = [];
  await page.route(`**/api/sales/${saleId}/orders`, (r) => {
    orders.push(r.request().postDataJSON());
    current.revision++;
    return r.fulfill({ json: current });
  });
  await mount(page);
  await page
    .getByRole("combobox", { name: "Cliente", exact: true })
    .fill("Marina nueva");
  await page
    .getByRole("button", { name: "Agregar Kybo Tea", exact: true })
    .click();
  await openHistorySale(page);
  await page
    .getByRole("button", { name: "Agregar pedido", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Agregar Kybo Tea", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Guardar pedido", exact: true })
    .click();
  await expect(
    page.getByRole("dialog", { name: "Venta #42", exact: true }),
  ).toBeVisible();
  expect(orders).toHaveLength(1);
  await page
    .getByRole("button", { name: "Cerrar detalle de venta", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Nueva venta", exact: true })
    .first()
    .click();
  await expect(
    page.getByRole("combobox", { name: "Cliente", exact: true }),
  ).toHaveValue("Marina nueva");
  await expect(
    page.locator("[data-pos-order]").getByText("Kybo Tea", { exact: true }),
  ).toBeVisible();
});

test("a pending delivery prevents dismissal and refreshes the confirmed locator", async ({
  page,
}) => {
  const current = sale();
  await setup(page, current);
  let delivered = 0;
  const gate = Promise.withResolvers<void>();
  await page.route("**/api/fulfillment/state?**", (r) =>
    r.fulfill({
      json: {
        rows: [
          {
            lineId: current.orders[0].lines[0].id,
            name: "Café de prueba",
            orderId,
            returnLots: [],
            progress: {
              mode: "direct",
              ordered: 1,
              completed: 0,
              delivered,
              cancelled: 0,
            },
            task: null,
          },
        ],
        cancelled: false,
        resolution: null,
      },
    }),
  );
  await page.route("**/api/fulfillment/deliver", async (r) => {
    await gate.promise;
    delivered = 1;
    current.orders[0].locatorNumber = null;
    return r.fulfill({ json: { delivered: true } });
  });
  await mount(page, true);
  const modal = page.getByRole("dialog", { name: "Venta #42", exact: true });
  await modal.getByRole("button", { name: "Entregar", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Cerrar detalle de venta", exact: true }),
  ).toBeDisabled();
  await page.keyboard.press("Escape");
  await expect(modal).toBeVisible();
  gate.resolve();
  await expect(modal.getByText("Entregado", { exact: true })).toBeVisible();
  await expect(
    modal.getByRole("heading", { name: "Pedido 42.1", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Cerrar detalle de venta", exact: true }),
  ).toBeEnabled();
});

for (const width of [600, 768, 1024, 1440])
  test(`sale modal keeps actions visible and scrolls its body at ${width}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    const current = sale();
    current.orders[0].lines = Array.from({ length: 12 }, (_, i) => ({
      ...current.orders[0].lines[0],
      id: `line-${i}`,
      name: ["Kybo Tea", "Taro Iced Latte", "Waffle de chipá"][i % 3],
    }));
    current.totalAmount =
      current.paidAmount =
      current.localCollected =
      current.orders[0].totalAmount =
        "1200.00";
    current.payments[0].amount = current.payments[0].settlementNet = "1200.00";
    await setup(page, current);
    await mount(page, true);
    const modal = page.getByRole("dialog", { name: "Venta #42", exact: true });
    await expect(modal).toBeVisible();
    const rect = await modal.boundingBox();
    expect(rect!.x).toBeGreaterThanOrEqual(0);
    expect(rect!.x + rect!.width).toBeLessThanOrEqual(width);
    expect(rect!.y + rect!.height).toBeLessThanOrEqual(901);
    const body = page.locator("[data-sale-detail-body]");
    await body.evaluate((el) => {
      el.scrollTop = el.scrollHeight;
    });
    const close = modal.getByRole("button", {
      name: "Cerrar detalle de venta",
      exact: true,
    });
    await expect(close).toBeInViewport();
    expect((await close.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    await expect(
      modal.getByRole("button", { name: "Cerrar", exact: true }),
    ).toBeInViewport();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await body.evaluate((el) => {
      el.scrollTop = 0;
    });
    await page.screenshot({
      path: `.next-e2e/sale-modal-${width}.png`,
      fullPage: true,
    });
  });
test("history opens a sale in a modal and restores filters and focus on close", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await setup(page);
  await mount(page);
  await page.getByRole("button", { name: "Historial", exact: true }).click();
  const query = page.getByRole("textbox", { name: "Buscar venta" });
  await query.fill("Martina");
  await page.getByLabel(/^Estado/).selectOption("closed");
  const row = page.getByRole("button").filter({ hasText: "#42 ·" });
  await row.click();
  const modal = page.getByRole("dialog", { name: "Venta #42", exact: true });
  await expect(modal).toBeVisible();
  await expect(modal.getByText("Café de prueba", { exact: true })).toHaveCount(
    1,
  );
  await page.keyboard.press("Escape");
  await expect(modal).toHaveCount(0);
  await expect(query).toHaveValue("Martina");
  await expect(page.getByLabel(/^Estado/)).toHaveValue("closed");
  await expect(row).toBeFocused();
  expect(new URL(page.url()).searchParams.has("account")).toBe(false);
});
test("consulting a sale preserves a draft, its customer and manual locator", async ({
  page,
}) => {
  await setup(page);
  await mount(page);
  await page
    .getByRole("combobox", { name: "Cliente", exact: true })
    .fill("Marina nueva");
  await page
    .getByRole("button", { name: "Agregar Kybo Tea", exact: true })
    .click();
  await page
    .getByRole("textbox", { name: "Buscar productos", exact: true })
    .fill("Kybo");
  await page
    .getByRole("button", {
      name: "Localizador 1 · Automático · Cambiar",
      exact: true,
    })
    .click();
  await page
    .getByRole("button", { name: "Localizador 7", exact: true })
    .click();
  await page.getByRole("button", { name: "Historial", exact: true }).click();
  await page.getByRole("button").filter({ hasText: "#42 ·" }).click();
  await page
    .getByRole("button", { name: "Cerrar detalle de venta", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Nueva venta", exact: true })
    .first()
    .click();
  await expect(
    page.getByRole("combobox", { name: "Cliente", exact: true }),
  ).toHaveValue("Marina nueva");
  await expect(
    page.getByRole("button", { name: "Localizador 7 · Cambiar", exact: true }),
  ).toBeVisible();
  await expect(
    page.locator("[data-pos-order]").getByText("Kybo Tea", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("textbox", { name: "Buscar productos", exact: true }),
  ).toHaveValue("Kybo");
});
test("a direct sale link opens the same dismissible modal over the POS", async ({
  page,
}) => {
  await setup(page);
  await mount(page, true);
  const modal = page.getByRole("dialog", { name: "Venta #42", exact: true });
  await expect(modal).toBeVisible();
  await page
    .getByRole("button", { name: "Cerrar detalle de venta", exact: true })
    .click();
  await expect(modal).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Agregar Kybo Tea", exact: true }),
  ).toBeVisible();
});

test("closing the modal preserves the history scroll position", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  const current = sale();
  const rows = [
    ...Array.from({ length: 22 }, (_, i) => ({
      ...current,
      id: `history-${i}`,
      number: 100 + i,
    })),
    current,
  ];
  await setup(page);
  await page.route("**/api/sales?**", (r) =>
    r.fulfill({ json: { rows, total: rows.length, offset: 0 } }),
  );
  await mount(page);
  await page.getByRole("button", { name: "Historial", exact: true }).click();
  const row = page.getByRole("button").filter({ hasText: "#42 ·" });
  await row.scrollIntoViewIfNeeded();
  const before = await page.evaluate(() => scrollY);
  expect(before).toBeGreaterThan(500);
  await row.click();
  await page
    .getByRole("button", { name: "Cerrar detalle de venta", exact: true })
    .click();
  await expect(row).toBeFocused();
  await expect
    .poll(async () => Math.abs((await page.evaluate(() => scrollY)) - before))
    .toBeLessThan(2);
});

test("an uncertain delivery stays in the modal and retries the same operation", async ({
  page,
}) => {
  const current = sale();
  await setup(page, current);
  let delivered = 0;
  const requests: unknown[] = [];
  await page.route("**/api/fulfillment/state?**", (r) =>
    r.fulfill({
      json: {
        rows: [
          {
            lineId: current.orders[0].lines[0].id,
            name: "Café de prueba",
            orderId,
            returnLots: [],
            progress: {
              mode: "direct",
              ordered: 1,
              completed: 0,
              delivered,
              cancelled: 0,
            },
            task: null,
          },
        ],
        cancelled: false,
        resolution: null,
      },
    }),
  );
  await page.route("**/api/fulfillment/deliver", (r) => {
    requests.push(r.request().postDataJSON());
    if (requests.length === 1) return r.abort();
    delivered = 1;
    return r.fulfill({ json: { delivered: true } });
  });
  await mount(page, true);
  await page.getByRole("button", { name: "Entregar", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Cerrar detalle de venta", exact: true }),
  ).toBeDisabled();
  await page
    .getByRole("button", { name: "Reintentar el mismo envío", exact: true })
    .click();
  await expect(page.getByText("Entregado", { exact: true })).toBeVisible();
  expect(requests).toHaveLength(2);
  expect(requests[1]).toEqual(requests[0]);
  await expect(
    page.getByRole("button", { name: "Cerrar detalle de venta", exact: true }),
  ).toBeEnabled();
});

test("a pending locator return cannot be dismissed by opening its sale", async ({
  page,
}) => {
  await setup(page);
  await mount(page);
  const gate = Promise.withResolvers<void>();
  await page.route(`**/api/pickup/orders/${orderId}`, async (r) => {
    await gate.promise;
    return r.fulfill({
      json: [
        {
          id: "55555555-5555-4555-8555-555555555555",
          number: 3,
          assignedBy: "Operador",
          assignedAt: sale().createdAt,
          returnedBy: "Operador",
          returnedAt: "2026-10-26T16:00:00Z",
        },
      ],
    });
  });
  await page
    .getByRole("button", { name: "Localizadores", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Devolver localizador 3", exact: true })
    .click();
  const link = page.getByRole("link", { name: "Ver venta", exact: true });
  await expect(link).toHaveAttribute("aria-disabled", "true");
  await link.click({ force: true });
  await expect(
    page.getByRole("dialog", { name: "Localizadores", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("dialog", { name: "Venta #42", exact: true }),
  ).toHaveCount(0);
  gate.resolve();
  await expect(link).not.toHaveAttribute("aria-disabled", "true");
});

test("route changes replace stale details, clear errors and close when account is removed", async ({
  page,
}) => {
  const otherId = "77777777-7777-4777-8777-777777777777";
  await setup(page);
  const gate = Promise.withResolvers<void>();
  await page.route(`**/api/sales/${otherId}`, async (r) => {
    await gate.promise;
    return r.fulfill({
      status: 503,
      json: { error: "Otra venta no disponible." },
    });
  });
  await mount(page, true);
  await expect(
    page.getByRole("dialog", { name: "Venta #42", exact: true }),
  ).toBeVisible();
  await page.evaluate(
    (id) =>
      window.dispatchEvent(
        new CustomEvent("fixture-sale-account", { detail: id }),
      ),
    otherId,
  );
  await expect(
    page.getByText("Cargando venta…", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Anular venta", exact: true }),
  ).toHaveCount(0);
  gate.resolve();
  await expect(
    page.getByText("Otra venta no disponible.", { exact: true }),
  ).toBeVisible();
  await page.evaluate(
    (id) =>
      window.dispatchEvent(
        new CustomEvent("fixture-sale-account", { detail: id }),
      ),
    saleId,
  );
  await expect(
    page.getByRole("dialog", { name: "Venta #42", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Otra venta no disponible.", { exact: true }),
  ).toHaveCount(0);
  await page.evaluate(() =>
    window.dispatchEvent(
      new CustomEvent("fixture-sale-account", { detail: undefined }),
    ),
  );
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("cancellation keeps its confirmation and does not discard the background draft", async ({
  page,
}) => {
  const current = sale();
  await setup(page, current);
  const requests: Record<string, unknown>[] = [];
  await page.route(`**/api/sales/${saleId}/cancel`, (r) => {
    requests.push(r.request().postDataJSON());
    current.status = "cancelled";
    current.revision++;
    current.cancelReason = "Pedido duplicado";
    return r.fulfill({ json: current });
  });
  await mount(page);
  await page
    .getByRole("button", { name: "Agregar Kybo Tea", exact: true })
    .click();
  await openHistorySale(page);
  await page.getByRole("button", { name: "Anular venta", exact: true }).click();
  const confirmation = page.getByRole("button", {
    name: "Confirmar anulación",
    exact: true,
  });
  await expect(confirmation).toBeDisabled();
  await page.getByLabel(/^Motivo de anulación/).fill("Pedido duplicado");
  await expect(confirmation).toBeDisabled();
  await page.getByRole("checkbox").check();
  await confirmation.click();
  await expect(
    page
      .getByRole("dialog", { name: "Venta #42", exact: true })
      .getByText("Anulada", { exact: true }),
  ).toBeVisible();
  expect(requests[0]).toMatchObject({
    refundConfirmed: true,
    reason: "Pedido duplicado",
    revision: 1,
  });
  await page
    .getByRole("button", { name: "Cerrar detalle de venta", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Nueva venta", exact: true })
    .first()
    .click();
  await expect(
    page.locator("[data-pos-order]").getByText("Kybo Tea", { exact: true }),
  ).toBeVisible();
});
