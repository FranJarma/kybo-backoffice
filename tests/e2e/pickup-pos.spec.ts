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

test("a new draft does not inherit the abandoned draft's locator", async ({
  page,
}) => {
  await page.goto("/__pickup-fixture");
  await page.addScriptTag({ path: ".next/pickup-ui.js" });
  await page.getByRole("button", { name: "Sin localizador · Elegir" }).tap();
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
    page.getByRole("button", { name: "Sin localizador · Elegir" }),
  ).toBeVisible();
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
  await expect(page.getByRole("dialog")).toHaveCount(0);
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

test("customer picker supports saved customers and a name only without table management", async ({
  page,
}) => {
  await page.route("**/api/sales/lookup?kind=customers**", (route) =>
    route.fulfill({
      json: {
        rows: [
          { id: "77777777-7777-4777-8777-777777777777", name: "Lucía Torres" },
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
  await page
    .getByRole("button", { name: "Agregar cliente", exact: true })
    .tap();
  const dialog = page.getByRole("dialog");
  await expect(
    dialog.getByRole("textbox", { name: "Buscar cliente guardado" }),
  ).toBeVisible();
  await expect(
    dialog.getByLabel("Cliente guardado", { exact: true }),
  ).toBeEnabled();
  await dialog
    .getByLabel("Cliente guardado", { exact: true })
    .selectOption("77777777-7777-4777-8777-777777777777");
  await dialog.getByRole("button", { name: "Usar cliente" }).tap();
  await page.getByRole("button", { name: "Cliente: Lucía Torres" }).tap();
  await dialog.getByLabel("O escribí un nombre").fill("Martina");
  await expect(
    dialog.getByLabel("Cliente guardado", { exact: true }),
  ).toHaveValue("");
  await dialog.getByRole("button", { name: "Usar cliente" }).tap();
  await page.getByRole("button", { name: "Cliente: Martina" }).tap();
  await dialog.getByLabel("O escribí un nombre").fill("Cambio descartado");
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("button", { name: "Cliente: Martina" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Historial", exact: true }).tap();
  await page
    .getByRole("button", { name: "Nueva venta", exact: true })
    .first()
    .tap();
  await expect(
    page.getByRole("button", { name: "Agregar cliente", exact: true }),
  ).toBeVisible();
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
