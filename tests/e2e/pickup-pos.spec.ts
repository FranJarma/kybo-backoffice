import { test, expect } from "@playwright/test";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
test.use({ hasTouch: true });
test.beforeAll(async () => {
  const { build } = createRequire(require.resolve("tsx"))("esbuild") as {
    build: (options: unknown) => Promise<unknown>;
  };
  await build({
    entryPoints: ["tests/helpers/pickup-ui.tsx"],
    outfile: ".next/pickup-ui.js",
    bundle: true,
    platform: "browser",
    jsx: "automatic",
    define: {
      "process.env": '{"NODE_ENV":"production"}',
      "process.env.NODE_ENV": '"production"',
    },
  });
});

const saleId = "22222222-2222-4222-8222-222222222222",
  orderId = "33333333-3333-4333-8333-333333333333";
const returnedLocatorHistory = [
  {
    id: "44444444-4444-4444-8444-444444444444",
    number: 3,
    assignedBy: "Operador",
    assignedAt: "2026-10-22T12:00:00Z",
    returnedBy: "Operador",
    returnedAt: "2026-10-22T12:30:00Z",
  },
];
test.beforeEach(async ({ page }) => {
  page.on("pageerror", (error) =>
    console.error("Component fixture:", error.stack),
  );
  await page.setViewportSize({ width: 1280, height: 900 });
  const html = await (
    await page.request.get("/pickup/11111111-1111-4111-8111-111111111111")
  ).text();
  const css = html.match(/<link[^>]+rel="stylesheet"[^>]*>/g)?.join("") ?? "";
  await page.route("**/__pickup-fixture*", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: `<html lang="es"><head>${css}</head><body></body></html>`,
    }),
  );
  let number = 3;
  const history = () => [
    {
      id: "44444444-4444-4444-8444-444444444444",
      number,
      assignedBy: "Operador",
      assignedAt: "2026-10-22T12:00:00Z",
      returnedBy: null,
      returnedAt: null,
    },
  ];
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    let json: unknown = { rows: [], total: 0, offset: 0, categories: [] };
    if (path.startsWith("/api/public/"))
      json = { branchName: "Test", rows: [], nextOffset: 0 };
    else if (path === "/api/pickup")
      json = {
        count: 16,
        publicPath: "/pickup/test",
        occupied: [
          { ...history()[0], orderId, saleId, label: "12.1", cancelled: false },
        ],
      };
    else if (path === `/api/pickup/orders/${orderId}`) {
      if (route.request().method() === "POST")
        number = route.request().postDataJSON().number;
      json = history();
    } else if (path === `/api/sales/${saleId}`)
      json = {
        id: saleId,
        number: 12,
        revision: 1,
        origin: "counter",
        channel: "counter",
        fulfillment: "takeaway",
        status: "closed",
        tableId: null,
        tableName: null,
        customerId: null,
        customerName: null,
        externalId: null,
        totalAmount: "0.00",
        paidAmount: "0.00",
        balanceDue: "0.00",
        localCollected: "0.00",
        platformCollected: "0.00",
        orderCount: 1,
        businessDate: "2026-10-22",
        createdAt: "2026-10-22T12:00:00Z",
        closedAt: "2026-10-22T12:00:00Z",
        notes: null,
        cancelReason: null,
        payments: [],
        orders: [
          {
            id: orderId,
            sequence: 1,
            totalAmount: "0.00",
            notes: null,
            createdAt: "2026-10-22T12:00:00Z",
            lines: [],
            locatorNumber: number,
          },
        ],
      };
    else if (path === "/api/fulfillment/state")
      json = { rows: [], cancelled: false, resolution: null };
    else if (path === "/api/inventory/replenishment")
      json = {
        alerts: [],
        policies: [],
        locations: [],
        items: [],
        asOf: "2026-10-22T12:00:00Z",
      };
    await route.fulfill({ json });
  });
});

test("returning from history preserves the current draft's locator", async ({
  page,
}) => {
  await page.goto("/__pickup-fixture");
  await page.addScriptTag({ path: ".next/pickup-ui.js" });
  await page
    .getByRole("button", { name: "Localizador 1 · Automático · Cambiar" })
    .tap();
  const seven = page.getByRole("button", {
    name: "Localizador 7",
    exact: true,
  });
  await expect(seven).toBeEnabled();
  const box = await seven.boundingBox();
  expect(box!.height).toBeGreaterThanOrEqual(48);
  expect(
    await seven.evaluate((element) =>
      parseFloat(getComputedStyle(element).fontSize),
    ),
  ).toBeGreaterThanOrEqual(24);
  await page.screenshot({ path: ".next/pickup-locators.png", fullPage: true });
  await seven.tap();
  await expect(
    page.getByRole("button", { name: "Localizador 7 · Cambiar" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Historial", exact: true }).tap();
  await page
    .getByRole("button", { name: "Nueva venta", exact: true })
    .first()
    .tap();
  await expect(
    page.getByRole("button", { name: "Localizador 7 · Cambiar" }),
  ).toBeVisible();
});

test("automatic locators follow availability during payment and manual choices remain validated", async ({
  page,
}) => {
  let occupied: number[] = [];
  await page.route("**/api/pickup", (r) =>
    r.fulfill({
      json: {
        count: 2,
        publicPath: "/pickup/test",
        occupied: occupied.map((number) => ({
          id: String(number),
          number,
          orderId,
          saleId,
          label: "1.1",
          cancelled: false,
        })),
      },
    }),
  );
  await page.route("**/api/sales/lookup?kind=products**", (r) =>
    r.fulfill({
      json: {
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
      },
    }),
  );
  await page.route("**/api/sales/lookup?kind=payment-methods**", (r) =>
    r.fulfill({
      json: {
        rows: [{ id: "cash", name: "Efectivo", kind: "cash" }],
        total: 1,
      },
    }),
  );
  await page.route("**/api/sales/products/*/configuration?**", (r) =>
    r.fulfill({
      json: {
        model: "direct",
        basePrice: "100.00",
        pricingRevision: 1,
        fulfillmentVersionId: "fixture",
      },
    }),
  );
  await page.goto("/__pickup-fixture");
  await page.addScriptTag({ path: ".next/pickup-ui.js" });
  await page
    .getByRole("button", { name: "Agregar Kybo Tea", exact: true })
    .click();
  const pay = page.getByRole("button", { name: "Cobrar", exact: true });
  await expect(pay).toBeEnabled();
  await pay.click();
  await page.getByRole("button", { name: "Efectivo", exact: true }).click();
  await page
    .getByRole("button", { name: "Importe exacto", exact: true })
    .click();
  const confirm = page.getByRole("button", {
    name: "Confirmar cobro",
    exact: true,
  });
  await expect(confirm).toBeEnabled();
  occupied = [1];
  await expect(page.locator("[data-pos-order-setup]")).toContainText(
    "Localizador 2 · Automático",
    { timeout: 10000 },
  );
  await expect(confirm).toBeEnabled();
  occupied = [1, 2];
  await expect(page.locator("[data-pos-order-setup]")).toContainText(
    "Sin localizadores disponibles",
    { timeout: 10000 },
  );
  await expect(confirm).toBeEnabled();
  await page.getByRole("button", { name: "Cancelar", exact: true }).click();
  occupied = [];
  await expect(
    page.getByRole("button", {
      name: "Localizador 1 · Automático · Cambiar",
      exact: true,
    }),
  ).toBeVisible({ timeout: 10000 });
  await page
    .getByRole("button", {
      name: "Localizador 1 · Automático · Cambiar",
      exact: true,
    })
    .click();
  await page
    .getByRole("button", { name: "Localizador 2", exact: true })
    .click();
  await pay.click();
  await page.getByRole("button", { name: "Efectivo", exact: true }).click();
  await page
    .getByRole("button", { name: "Importe exacto", exact: true })
    .click();
  occupied = [2];
  await expect(confirm).toBeDisabled({ timeout: 10000 });
  await expect(page.getByRole("dialog")).toContainText("ya está ocupado");
  await page.getByRole("button", { name: "Cancelar", exact: true }).click();
  await page
    .getByRole("button", { name: "Localizador 2 · Cambiar", exact: true })
    .click();
  await page
    .getByRole("button", {
      name: "Volver a asignación automática",
      exact: true,
    })
    .click();
  await expect(pay).toBeEnabled();
});

test("changing a locator refreshes the order heading after confirmation", async ({
  page,
}) => {
  await page.goto("/__pickup-fixture#detail");
  await page.addScriptTag({ path: ".next/pickup-ui.js" });
  await expect(
    page.getByRole("heading", {
      name: "Pedido 12.1 · Localizador 3",
      exact: true,
    }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Localizador e historial" }).tap();
  await page.getByRole("button", { name: "Localizador 5", exact: true }).tap();
  await page
    .getByRole("checkbox", { name: "Recibí físicamente el localizador 3" })
    .check();
  await page
    .getByRole("button", { name: "Asignar localizador 5", exact: true })
    .tap();
  await expect(
    page.getByText("Asignación actualizada. El historial quedó guardado."),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Cerrar formulario", exact: true })
    .tap();
  await expect(
    page.getByRole("dialog", { name: "Venta #12", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", {
      name: "Pedido 12.1 · Localizador 5",
      exact: true,
    }),
  ).toBeVisible();
});

test("customer display opens directly while locator management stays separate", async ({
  page,
}) => {
  await page.goto("/__pickup-fixture");
  await page.addScriptTag({ path: ".next/pickup-ui.js" });
  const screen = page.getByRole("link", { name: /Pantalla de clientes/ });
  await expect(screen).toHaveAttribute("href", "/pickup/test");
  await expect(screen).toHaveAttribute("target", "_blank");
  await page.screenshot({ path: ".next/pickup-actions.png", fullPage: true });
  const popupPromise = page.waitForEvent("popup");
  await screen.tap();
  const popup = await popupPromise;
  await expect(popup).toHaveURL(/\/pickup\/test$/);
  await popup.close();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByRole("button", { name: "Localizadores", exact: true }).tap();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.getByText("15 de 16 disponibles")).toBeVisible();
});

test("the locator list returns a cancelled order's device in one click without opening its editor", async ({
  page,
}) => {
  let held = true;
  let finish: (() => void) | undefined;
  await page.route("**/api/pickup", (route) =>
    route.fulfill({
      json: {
        count: 16,
        publicPath: "/pickup/test",
        occupied: held
          ? [
              {
                id: "44444444-4444-4444-8444-444444444444",
                number: 3,
                orderId,
                saleId,
                label: "12.1",
                cancelled: true,
              },
            ]
          : [],
      },
    }),
  );
  await page.route(`**/api/pickup/orders/${orderId}`, async (route) => {
    expect(route.request().method()).toBe("POST");
    expect(route.request().postDataJSON()).toMatchObject({
      expectedAssignmentId: "44444444-4444-4444-8444-444444444444",
      number: null,
      returnConfirmed: true,
    });
    await new Promise<void>((resolve) => {
      finish = resolve;
    });
    held = false;
    await route.fulfill({ json: returnedLocatorHistory });
  });
  await page.goto("/__pickup-fixture");
  await page.addScriptTag({ path: ".next/pickup-ui.js" });
  await page.getByRole("button", { name: "Localizadores", exact: true }).tap();
  const action = page.getByRole("button", {
    name: "Devolver localizador 3",
    exact: true,
  });
  await action.tap();
  await expect(action).toBeDisabled();
  await expect(page.getByRole("checkbox")).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "Localizadores", exact: true }),
  ).toBeVisible();
  await expect.poll(() => !!finish).toBe(true);
  finish!();
  await expect(page.getByText("16 de 16 disponibles")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Devolver localizador 3", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "Localizadores", exact: true }),
  ).toBeVisible();
});

test("direct locator return retries the same request after a lost response", async ({
  page,
}) => {
  const requests: Record<string, unknown>[] = [];
  await page.route(`**/api/pickup/orders/${orderId}`, async (route) => {
    requests.push(route.request().postDataJSON());
    if (requests.length === 1) return route.abort();
    await route.fulfill({ json: returnedLocatorHistory });
  });
  await page.goto("/__pickup-fixture");
  await page.addScriptTag({ path: ".next/pickup-ui.js" });
  await page.getByRole("button", { name: "Localizadores", exact: true }).tap();
  const action = page.getByRole("button", {
    name: "Devolver localizador 3",
    exact: true,
  });
  await action.tap();
  await expect(action).toBeDisabled();
  await page.getByRole("button", { name: /Reintentar/ }).tap();
  await expect.poll(() => requests.length).toBe(2);
  expect(requests[0]).toEqual(requests[1]);
  expect(requests[0]).toMatchObject({
    expectedAssignmentId: "44444444-4444-4444-8444-444444444444",
    number: null,
    returnConfirmed: true,
  });
  await expect(
    page.getByText("Localizador devuelto. Ya está disponible.", {
      exact: true,
    }),
  ).toBeVisible();
});

test("a conflicting direct return keeps the locator visible and reports the assignment change", async ({
  page,
}) => {
  await page.route(`**/api/pickup/orders/${orderId}`, (route) =>
    route.fulfill({
      status: 409,
      json: { error: "La asignación cambió. Actualizá antes de confirmar." },
    }),
  );
  await page.goto("/__pickup-fixture");
  await page.addScriptTag({ path: ".next/pickup-ui.js" });
  await page.getByRole("button", { name: "Localizadores", exact: true }).tap();
  const action = page.getByRole("button", {
    name: "Devolver localizador 3",
    exact: true,
  });
  await action.tap();
  await expect(
    page.getByText("La asignación cambió. Actualizá antes de confirmar.", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(action).toBeEnabled();
  await expect(page.getByText("15 de 16 disponibles")).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Localizadores", exact: true }),
  ).toBeVisible();
});

test("tablet order entry keeps the catalogue spacious and the order accessible across rotation", async ({
  page,
}) => {
  await page.setViewportSize({ width: 768, height: 1024 });
  const names = [
    "Kybo Tea",
    "Taro Iced Latte",
    "Matcha Iced Latte",
    "Coffee Iced Latte",
    "Tropical Matcha",
    "Red Matcha",
    "Oreo Iced Latte",
    "Bubble Sunrise",
    "Kybo Shake",
    "Kybo Frozen",
    "Kybo Soft",
    "Café",
  ];
  await page.route("**/api/sales/lookup?kind=products**", (route) =>
    route.fulfill({
      json: {
        rows: names.map((name, index) => ({
          id: `product-${index}`,
          name,
          price: "5000.00",
          configured: true,
          categoryId: "drinks",
        })),
        total: names.length,
        categories: [{ id: "drinks", name: "Bebidas" }],
      },
    }),
  );
  await page.route("**/api/sales/products/*/configuration?**", (route) =>
    route.fulfill({
      json: {
        model: "direct",
        basePrice: "5000.00",
        pricingRevision: 1,
        fulfillmentVersionId: "fixture",
      },
    }),
  );
  await page.goto("/__pickup-fixture");
  await page.addScriptTag({ path: ".next/pickup-ui.js" });
  await page.locator("[data-pos]").evaluate((element) => {
    const parent = element.parentElement!;
    parent.style.height = "100dvh";
    parent.style.minHeight = "0";
    parent.style.boxSizing = "border-box";
  });
  await expect(
    page.getByRole("button", { name: "Herramientas" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Localizadores", exact: true }),
  ).toBeHidden();
  await expect(
    page.getByRole("region", { name: "Pedido actual" }),
  ).toBeHidden();
  const product = page.getByRole("button", {
    name: "Agregar Kybo Tea",
    exact: true,
  });
  await product.tap();
  const summary = page.getByRole("button", { name: /Ver pedido/ });
  await expect(summary).toContainText("1 unid.");
  await expect(summary).toContainText("5.000");
  const productBox = await product.boundingBox();
  expect(productBox!.width).toBeGreaterThan(200);
  const summaryBox = await summary.boundingBox();
  expect(summaryBox!.height).toBeGreaterThanOrEqual(56);
  expect(summaryBox!.y + summaryBox!.height).toBeLessThanOrEqual(1024);
  await page.screenshot({
    path: ".next/pos-tablet-portrait.png",
    fullPage: true,
  });
  await summary.tap();
  await expect(
    page.getByRole("region", { name: "Pedido actual" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Aumentar Kybo Tea" }).tap();
  await expect(
    page.getByRole("button", { name: "Cobrar", exact: true }),
  ).toBeInViewport();
  await page.screenshot({ path: ".next/pos-tablet-order.png", fullPage: true });
  await page.getByRole("button", { name: "Seguir agregando productos" }).tap();
  await expect(summary).toContainText("2 unid.");
  await page.getByRole("button", { name: "Herramientas" }).tap();
  await expect(
    page.getByRole("link", { name: /Pantalla de clientes/ }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Herramientas" }).tap();
  await page.setViewportSize({ width: 1024, height: 768 });
  await expect(product).toBeVisible();
  await expect(
    page.getByRole("region", { name: "Pedido actual" }),
  ).toBeVisible();
  await expect(summary).toBeHidden();
  await expect(
    page.getByRole("button", { name: "Cobrar", exact: true }),
  ).toBeInViewport();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: ".next/pos-tablet-landscape.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 600, height: 960 });
  await expect(summary).toBeInViewport();
  await expect(summary).toContainText("2 unid.");
  await summary.tap();
  await expect(
    page.getByRole("button", { name: "Cobrar", exact: true }),
  ).toBeInViewport();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test("customer autocomplete supports saved clients and new names without a modal or table management", async ({
  page,
}) => {
  await page.route("**/api/sales/lookup?kind=customers**", (route) =>
    route.fulfill({
      json: {
        rows: [
          {
            id: "77777777-7777-4777-8777-777777777777",
            name: "Lucía Torres",
            email: "lucia@test.local",
          },
        ],
        total: 1,
      },
    }),
  );
  await page.goto("/__pickup-fixture");
  await page.addScriptTag({ path: ".next/pickup-ui.js" });
  await expect(
    page.getByRole("link", { name: "Mesas", exact: true }),
  ).toHaveCount(0);
  const customer = page.getByRole("combobox", { name: "Cliente", exact: true });
  await customer.fill("Lucía");
  await page.getByRole("option", { name: /Lucía Torres/ }).tap();
  await expect(customer).toHaveValue("Lucía Torres");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await customer.fill("Martina");
  await page.keyboard.press("Tab");
  await expect(customer).toHaveValue("Martina");
  await page
    .getByLabel("Email del cliente (opcional)")
    .fill("martina@test.local");
  await page.getByRole("button", { name: "Historial", exact: true }).tap();
  await page
    .getByRole("button", { name: "Nueva venta", exact: true })
    .first()
    .tap();
  await expect(customer).toHaveValue("Martina");
  await expect(page.getByLabel("Email del cliente (opcional)")).toHaveValue(
    "martina@test.local",
  );
});

test("stock error stays compact and help preserves the payment form", async ({
  page,
}) => {
  await page.setViewportSize({ width: 768, height: 1024 });
  await page.goto("/__pickup-fixture#stock-error");
  await page.addScriptTag({ path: ".next/pickup-ui.js" });
  await expect(page.getByRole("alert")).toContainText(
    "Falta stock para completar el pedido.",
  );
  await expect(page.getByText(/Leche en Barra/)).toHaveCount(0);
  const help = page.getByRole("button", {
    name: "Ver detalle de insumos faltantes",
  });
  await help.tap();
  await expect(
    page.getByRole("dialog", { name: "Insumos faltantes", exact: true }),
  ).toBeVisible();
  await expect(page.getByText(/Leche en Barra/)).toBeVisible();
  await expect(page.getByText(/Preparado de té chai en Barra/)).toBeVisible();
  await page.getByRole("button", { name: "Entendido", exact: true }).tap();
  await expect(
    page.getByRole("dialog", { name: "Registrar cobro", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("textbox", { name: "Efectivo recibido" }),
  ).toHaveValue("5000");
  await expect(help).toBeFocused();
  await help.tap();
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("dialog", { name: "Registrar cobro", exact: true }),
  ).toBeVisible();
});

test("inline order actions use the shared customer autocomplete and automatic locator", async ({
  page,
}) => {
  await page.route("**/api/sales/lookup?kind=customers**", (route) =>
    route.fulfill({
      json: {
        rows: [
          {
            id: "77777777-7777-4777-8777-777777777777",
            name: "Lucía Torres",
            email: "lucia@test.local",
          },
        ],
        total: 1,
      },
    }),
  );
  await page.goto("/__pickup-fixture");
  await page.addScriptTag({ path: ".next/pickup-ui.js" });
  await expect(
    page.getByRole("group", { name: "Lugar de consumo", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("group", { name: "Forma de consumo", exact: true }),
  ).toBeVisible();
  const actions = page.getByRole("group", { name: "Acciones", exact: true });
  const customer = actions.getByRole("combobox", {
    name: "Cliente",
    exact: true,
  });
  await customer.fill("Lucía");
  await actions.getByRole("option", { name: /Lucía Torres/ }).click();
  await expect(customer).toHaveValue("Lucía Torres");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await actions
    .getByRole("button", { name: "Quitar cliente", exact: true })
    .click();
  await customer.fill("Martina nueva");
  await page.keyboard.press("Tab");
  await expect(customer).toHaveValue("Martina nueva");
  await expect(
    actions.getByLabel("Email del cliente (opcional)"),
  ).toBeVisible();
  await actions
    .getByLabel("Email del cliente (opcional)")
    .fill("martina@test.local");
  await expect(
    actions.getByRole("button", {
      name: "Localizador 1 · Automático · Cambiar",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page
      .locator("[data-pos-order]")
      .getByRole("button", { name: /Localizador/ }),
  ).toHaveCount(0);
  await page.screenshot({
    path: ".next-e2e/pos-entry-desktop.png",
    fullPage: true,
  });
});

test("typed customers and optional email travel with checkout without an extra registration request", async ({
  page,
}) => {
  const registrations: string[] = [];
  page.on("request", (request) => {
    if (request.method() === "POST" && request.url().includes("customers"))
      registrations.push(request.url());
  });
  await page.route("**/api/sales/lookup?kind=products**", (route) =>
    route.fulfill({
      json: {
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
      },
    }),
  );
  await page.route("**/api/sales/lookup?kind=payment-methods**", (route) =>
    route.fulfill({
      json: {
        rows: [{ id: "cash", name: "Efectivo", kind: "cash" }],
        total: 1,
      },
    }),
  );
  await page.route("**/api/sales/products/*/configuration?**", (route) =>
    route.fulfill({
      json: {
        model: "direct",
        basePrice: "100.00",
        pricingRevision: 1,
        fulfillmentVersionId: "fixture",
      },
    }),
  );
  const submissions: Record<string, unknown>[] = [];
  await page.route("**/api/sales", async (route) => {
    submissions.push(route.request().postDataJSON());
    await route.fulfill({
      json: {
        id: saleId,
        number: 88,
        status: "closed",
        origin: "counter",
        orders: [{ id: orderId, locatorNumber: 2 }],
      },
    });
  });
  await page.goto("/__pickup-fixture");
  await page.addScriptTag({ path: ".next/pickup-ui.js" });
  await page
    .getByRole("combobox", { name: "Cliente", exact: true })
    .fill("Martina nueva");
  await page
    .getByLabel("Email del cliente (opcional)")
    .fill("email-incorrecto");
  await page
    .getByRole("button", { name: "Agregar Kybo Tea", exact: true })
    .click();
  const pay = page.getByRole("button", { name: "Cobrar", exact: true });
  await expect(pay).toBeDisabled();
  await page
    .getByLabel("Email del cliente (opcional)")
    .fill("martina@test.local");
  await pay.click();
  await page.getByRole("button", { name: "Efectivo", exact: true }).click();
  await page
    .getByRole("button", { name: "Importe exacto", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Confirmar cobro", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Última venta #88", exact: true }),
  ).toBeVisible();
  expect(submissions).toHaveLength(1);
  expect(submissions[0]).toMatchObject({
    newCustomer: { name: "Martina nueva", email: "martina@test.local" },
    locatorMode: "automatic",
  });
  expect(submissions[0].locatorNumber).toBeUndefined();
  expect(submissions[0].customerName).toBeUndefined();
  expect(registrations).toHaveLength(0);
  await expect(
    page.getByRole("combobox", { name: "Cliente", exact: true }),
  ).toHaveValue("");
  await expect(page.getByLabel("Email del cliente (opcional)")).toHaveCount(0);
});

test("an exact existing name still permits a different optional email for a homonym", async ({
  page,
}) => {
  await page.route("**/api/sales/lookup?kind=customers**", (route) =>
    route.fulfill({
      json: {
        rows: [
          {
            id: "77777777-7777-4777-8777-777777777777",
            name: "Lucía Torres",
            email: "lucia@test.local",
          },
        ],
        total: 1,
      },
    }),
  );
  await page.goto("/__pickup-fixture");
  await page.addScriptTag({ path: ".next/pickup-ui.js" });
  const customer = page.getByRole("combobox", { name: "Cliente", exact: true });
  await customer.fill("Lucía Torres");
  await expect(
    page.getByRole("option", { name: /Lucía Torres/ }),
  ).toBeVisible();
  const email = page.getByLabel("Email del cliente (opcional)");
  await email.focus();
  await expect(email).toBeVisible();
  await email.fill("otra-lucia@test.local");
  await expect(customer).toHaveValue("Lucía Torres");
  await expect(email).toHaveValue("otra-lucia@test.local");
});

test("clearing a typed customer also clears its hidden email and permits an occasional sale", async ({
  page,
}) => {
  await page.route("**/api/sales/lookup?kind=products**", (route) =>
    route.fulfill({
      json: {
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
      },
    }),
  );
  await page.route("**/api/sales/products/*/configuration?**", (route) =>
    route.fulfill({
      json: {
        model: "direct",
        basePrice: "100.00",
        pricingRevision: 1,
        fulfillmentVersionId: "fixture",
      },
    }),
  );
  await page.goto("/__pickup-fixture");
  await page.addScriptTag({ path: ".next/pickup-ui.js" });
  await page
    .getByRole("button", { name: "Agregar Kybo Tea", exact: true })
    .click();
  const customer = page.getByRole("combobox", { name: "Cliente", exact: true });
  await customer.fill("Nombre anterior");
  await page.getByLabel("Email del cliente (opcional)").fill("invalido");
  const pay = page.getByRole("button", { name: "Cobrar", exact: true });
  await expect(pay).toBeDisabled();
  await customer.fill("");
  await customer.press("Tab");
  await expect(page.getByLabel("Email del cliente (opcional)")).toHaveCount(0);
  await expect(pay).toBeEnabled();
  await customer.fill("Otra persona");
  await expect(page.getByLabel("Email del cliente (opcional)")).toHaveValue("");
});
