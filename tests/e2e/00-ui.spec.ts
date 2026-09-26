import { test, expect, type Page } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { saveAdminSession } from "../helpers/browser-session";

const email = process.env.E2E_EMAIL;
const password = process.env.E2E_PASSWORD;
test.skip(!email || !password, "Requires an isolated E2E account");
const businessDay = (delta = 0) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Argentina/Salta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(Date.now() + delta * 86_400_000));
async function post(page: Page, url: string, data: unknown) {
  const response = await page.request.post(url, {
    headers: { Origin: new URL(page.url()).origin },
    data,
  });
  expect(response.ok(), await response.text()).toBe(true);
  return response.json();
}
async function screenshot(page: Page, name: string) {
  await page.evaluate(async () => {
    await document.fonts.ready;
    document.getElementById("visual-test-label")?.remove();
    const label = document.createElement("div");
    label.id = "visual-test-label";
    label.textContent = "Vista de prueba · datos ficticios";
    label.style.cssText =
      "position:fixed;bottom:10px;right:16px;z-index:100;background:#071b42;color:white;font:10px sans-serif;padding:6px 10px;border-radius:6px;pointer-events:none;opacity:.9";
    document.body.append(label);
  });
  await page.screenshot({
    path: `docs/previews/ui-${name}.png`,
    fullPage: true,
    animations: "disabled",
  });
}

test("prototype layout aligns headers, shows actual records, and works on mobile", async ({
  page,
}) => {
  test.slow();
  await mkdir("docs/previews", { recursive: true });
  await page.goto("/login");
  await page.getByLabel("Correo electrónico").fill(email!);
  await page.getByLabel("Contraseña").fill(password!);
  await page.getByRole("button", { name: "Ingresar", exact: true }).click();
  await expect(page).toHaveURL("/", { timeout: 20_000 });
  await saveAdminSession(page);
  await post(page, "/api/auth/update-user", { name: "Francisco" });
  const create = async (entity: string, data: unknown) =>
    (await post(page, `/api/catalog/${entity}`, data)).row;
  const supplier = await create("suppliers", {
    name: "Distribuidora del Norte",
    phone: "",
    email: "",
  });
  await create("suppliers", { name: "Almacén de insumos" });
  const payment = await create("payment-methods", {
    name: "Transferencia",
    kind: "transfer",
  });
  const items = [
    { name: "Tapioca cruda", baseUnit: "g", quantity: "1400", cost: "8,5" },
    { name: "Azúcar mascabo", baseUnit: "g", quantity: "400", cost: null },
    { name: "Café en grano", baseUnit: "g", quantity: "800", cost: "39,5" },
    { name: "Leche entera", baseUnit: "ml", quantity: "14000", cost: "1,45" },
    {
      name: "Pulpa de maracuyá",
      baseUnit: "g",
      quantity: "3000",
      cost: "14,2",
    },
    { name: "Vasos de 500 ml", baseUnit: "unit", quantity: "48", cost: "150" },
  ];
  const ids: string[] = [];
  for (const [index, item] of items.entries()) {
    const ingredient = await create("ingredients", {
      name: item.name,
      baseUnit: item.baseUnit,
      unitCost: item.cost ?? "",
    });
    ids.push(ingredient.id);
    const result = await post(page, "/api/inventory/adjustments", {
      requestId: crypto.randomUUID(),
      kind: "opening",
      ingredientId: ingredient.id,
      quantity: item.quantity,
      unitCost: item.cost,
      receivedOn: businessDay(),
      expiresOn: index === 0 ? businessDay(-1) : businessDay(14),
      reason: "Datos de prueba visual",
      lotCode: `DEMO-${index + 1}`,
    });
    if (index === 2)
      await post(page, "/api/inventory/adjustments", {
        requestId: crypto.randomUUID(),
        kind: "block",
        lotId: result.lot.id,
        revision: result.lot.revision,
        blocked: true,
        reason: "Revisión de lote de ejemplo",
      });
  }
  for (const product of [
    { name: "Taro Iced Latte", priceCounter: "7000", pricePedidosYa: "7500" },
    { name: "Kybo Shake", priceCounter: "7500", pricePedidosYa: "8000" },
    { name: "Dúo Waffle", priceCounter: "8500", pricePedidosYa: "9500" },
    { name: "Coffee Iced Latte", priceCounter: "7000", pricePedidosYa: "7500" },
  ])
    await create("products", { ...product, priceUberEats: "" });
  await create("presentations", {
    name: "Bolsa de 1 kg",
    supplierId: supplier.id,
    ingredientId: ids[2],
    baseQuantity: "1000",
  });
  const receipt = await post(page, "/api/purchases", {
    requestId: crypto.randomUUID(),
    supplierId: supplier.id,
    receivedOn: businessDay(),
    documentNumber: "DEMO-0001",
    lines: [
      {
        ingredientId: ids[3],
        quantity: "8000",
        unitPrice: "1,45",
        discount: "0",
        expiresOn: businessDay(10),
      },
    ],
  });
  await post(page, `/api/purchases/${receipt.receipt.id}/payments`, {
    requestId: crypto.randomUUID(),
    paymentMethodId: payment.id,
    paidOn: businessDay(),
    amount: "5000",
    reference: "Pago de ejemplo",
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Buen día, Francisco" }),
  ).toBeVisible();
  await expect(page.getByText("Tapioca cruda").first()).toBeVisible();
  const geometry = await page.evaluate(() => {
    const brand = document
      .querySelector("[data-brand-header]")!
      .getBoundingClientRect();
    const bar = document
      .querySelector("[data-topbar]")!
      .getBoundingClientRect();
    const header = document
      .querySelector(".page-heading")!
      .getBoundingClientRect();
    const action = document
      .querySelector(".page-heading > a")!
      .getBoundingClientRect();
    return {
      brandBottom: brand.bottom,
      barBottom: bar.bottom,
      headerTop: header.top,
      actionTop: action.top,
      overflow: document.documentElement.scrollWidth > innerWidth,
    };
  });
  expect(
    Math.abs(geometry.brandBottom - geometry.barBottom),
  ).toBeLessThanOrEqual(1);
  expect(Math.abs(geometry.headerTop - geometry.actionTop)).toBeLessThanOrEqual(
    2,
  );
  expect(geometry.overflow).toBe(false);
  await screenshot(page, "home-desktop");
  // Wait for the first client fetch: Next dev may compile this endpoint on demand.
  const inventoryLoaded = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === "/api/inventory" &&
      response.request().method() === "GET",
  );
  await page.goto("/inventory");
  expect((await inventoryLoaded).ok()).toBe(true);
  await expect(
    page.getByText("Pulpa de maracuyá", { exact: true }),
  ).toBeVisible();
  await screenshot(page, "inventory-desktop");
  await page.goto("/products");
  await expect(
    page.getByRole("cell", { name: "Taro Iced Latte", exact: true }),
  ).toBeVisible();
  await screenshot(page, "products-desktop");
  await page.goto("/purchases");
  await expect(page.getByText("DEMO-0001", { exact: true })).toBeVisible();
  await screenshot(page, "purchases-desktop");
  await page.getByRole("button", { name: "Nueva recepción" }).click();
  await expect(
    page.getByRole("combobox", { name: "Proveedor", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("combobox", { name: "Proveedor", exact: true }),
  ).toBeEnabled();
  await expect(
    page.getByRole("combobox", { name: "Insumo", exact: true }),
  ).toBeEnabled();
  await screenshot(page, "purchase-form-desktop");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/inventory");
  await expect(
    page.getByText("Pulpa de maracuyá", { exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
  ).toBe(false);
  await screenshot(page, "inventory-mobile");
  await page.getByRole("button", { name: "Abrir menú" }).click();
  const menu = page.getByRole("dialog", { name: "Menú de Kybo" });
  await expect(menu).toBeVisible();
  await expect(
    menu.getByRole("link", { name: "Compras", exact: true }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(menu).not.toBeVisible();
  await expect(page.getByRole("button", { name: "Abrir menú" })).toBeFocused();
  await page.getByRole("button", { name: "Abrir menú" }).click();
  await page.setViewportSize({ width: 1280, height: 900 });
  await expect(menu).not.toBeVisible();
  await expect(
    page.getByRole("link", { name: "Compras", exact: true }),
  ).toBeVisible();
  for (let i = 0; i < 7; i++)
    await create("suppliers", { name: `Proveedor visual ${i}` });
  await page.goto("/purchases");
  await page.getByRole("button", { name: "Nueva recepción" }).click();
  const supplierSearch = page.getByRole("searchbox", {
    name: "Buscar proveedor",
  });
  await supplierSearch.fill("Distribuidora");
  await expect(
    page
      .getByRole("combobox", { name: "Proveedor", exact: true })
      .locator("option"),
  ).toHaveCount(2);
  await supplierSearch.clear();
  await expect(
    page
      .getByRole("combobox", { name: "Proveedor", exact: true })
      .locator("option"),
  ).toHaveCount(10);
  await expect(supplierSearch).toBeFocused();
});
