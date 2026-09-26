import { test, expect, type Page, type BrowserContext } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import {
  restoreAdminSession,
  saveAdminSession,
  restoreStaffSession,
  saveStaffSession,
} from "../helpers/browser-session";
const email = process.env.E2E_EMAIL,
  password = process.env.E2E_PASSWORD;
test.skip(!email || !password, "Temporary E2E credentials required");
let cookies: Awaited<ReturnType<BrowserContext["cookies"]>> | undefined;
async function signIn(page: Page) {
  if (!cookies && (await restoreAdminSession(page)))
    cookies = await page.context().cookies();
  if (cookies) {
    await page.context().addCookies(cookies);
    await page.goto("/sales");
    return;
  }
  await page.goto("/login");
  await page.getByLabel("Correo electrónico").fill(email!);
  await page.getByLabel("Contraseña").fill(password!);
  await page.getByRole("button", { name: "Ingresar" }).click();
  await expect(page).toHaveURL("/", { timeout: 25000 });
  cookies = await page.context().cookies();
  await saveAdminSession(page);
  await page.goto("/sales");
}
async function post(page: Page, url: string, data: unknown) {
  const r = await page.request.post(url, {
    data,
    headers: { Origin: new URL(page.url()).origin },
  });
  expect(r.ok(), await r.text()).toBe(true);
  return r.json();
}
async function fixtures(page: Page, suffix: string) {
  const product = (
    await post(page, "/api/catalog/products", {
      name: `Taro Latte · ${suffix}`,
      priceCounter: "7000",
      pricePedidosYa: "7500",
      priceUberEats: "",
    })
  ).row;
  const method = (
    await post(page, "/api/catalog/payment-methods", {
      name: `Efectivo · ${suffix}`,
      kind: "cash",
    })
  ).row;
  const customer = (
    await post(page, "/api/catalog/customers", {
      name: `Cliente · ${suffix}`,
      phone: "",
      email: "",
    })
  ).row;
  return { product, method, customer };
}
test("staff reaches POS without administrative catalog access", async ({
  page,
  request,
}) => {
  test.setTimeout(90000);
  test.skip(!process.env.E2E_STAFF_EMAIL, "Temporary staff fixture required");
  expect((await request.get("/api/sales")).status()).toBe(401);
  if (!(await restoreStaffSession(page))) {
    await page.goto("/login");
    await page
      .getByLabel("Correo electrónico")
      .fill(process.env.E2E_STAFF_EMAIL!);
    await page.getByLabel("Contraseña").fill(password!);
    await page.getByRole("button", { name: "Ingresar" }).click();
    await expect(page).toHaveURL("/sales", { timeout: 25000 });
    await saveStaffSession(page);
  } else await page.goto("/sales");
  await expect(
    page.getByRole("heading", { name: "Ventas", exact: true }),
  ).toBeVisible();
  await expect(
    page
      .getByRole("navigation", { name: "Principal" })
      .getByRole("link", { name: "Insumos" }),
  ).toHaveCount(0);
  const lookup = await page.request.get("/api/sales/lookup?kind=products");
  expect(lookup.status()).toBe(200);
  expect(await lookup.text()).not.toMatch(/unitCost|marketingOptIn/);
  expect((await page.request.get("/api/catalog/ingredients")).status()).toBe(
    403,
  );
  expect((await page.request.get("/api/recipes")).status()).toBe(403);
  const table = await page.request.post("/api/sales/tables", {
    headers: { Origin: new URL(page.url()).origin },
    data: {
      requestId: randomUUID(),
      name: "No autorizado",
      capacity: 2,
      x: 0,
      y: 0,
    },
  });
  expect(table.status()).toBe(403);
  const crossOrigin = await page.request.post("/api/sales", {
    headers: { Origin: "https://untrusted.example" },
    data: {},
  });
  expect(crossOrigin.status()).toBe(403);
});
test("counter sale recovers a lost response without a second sale", async ({
  page,
}) => {
  test.setTimeout(120000);
  await signIn(page);
  await expect(
    page.getByRole("heading", { name: "Ventas", exact: true }),
  ).toBeVisible();
  const { product, method, customer } = await fixtures(page, "mostrador");
  await page.reload();
  await page
    .getByRole("combobox", { name: "Cliente" })
    .selectOption(customer.id);
  await page
    .getByRole("button", { name: `Agregar ${product.name}`, exact: true })
    .click();
  await page.getByRole("button", { name: `Aumentar ${product.name}` }).click();
  await expect(page.getByTestId("cart-total")).toHaveText(/14\.000/);
  await mkdir("docs/previews", { recursive: true });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: "docs/previews/sales-desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator("body")).toHaveJSProperty("scrollWidth", 390);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: "docs/previews/sales-mobile.png",
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Cobrar y registrar", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  await dialog
    .getByRole("combobox", { name: "Medio de pago 1" })
    .selectOption(method.id);
  await dialog.getByRole("textbox", { name: "Referencia 1" }).fill("A-00012");
  let intercepted = false;
  await page.route("**/api/sales", async (route) => {
    if (route.request().method() === "POST" && !intercepted) {
      intercepted = true;
      const r = await route.fetch();
      expect(r.ok()).toBe(true);
      await route.abort();
    } else await route.continue();
  });
  await dialog
    .getByRole("button", { name: "Confirmar cobro", exact: true })
    .click();
  await expect(
    page.getByRole("alert").filter({ hasText: /confirmar el resultado/ }),
  ).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: "Reintentar mismo envío" }).click();
  await expect(page.getByRole("heading", { name: /Venta #/ })).toBeVisible();
  await expect(page.getByText("A-00012", { exact: true })).toBeVisible();
  const result = await (
    await page.request.get(`/api/sales?q=${encodeURIComponent(customer.name)}`)
  ).json();
  expect(result.total).toBe(1);
  expect(result.rows[0].totalAmount).toBe("14000.00");
  await page.reload();
  await expect(
    page.getByRole("heading", {
      name: `Venta #${result.rows[0].number}`,
      exact: true,
    }),
  ).toBeVisible();
});
test("table keeps multiple orders in one visit, settles balance and delivery preserves its effective price", async ({
  page,
}) => {
  test.setTimeout(120000);
  await signIn(page);
  const { product, method } = await fixtures(page, "mesa");
  await page.goto("/tables");
  await page.getByRole("button", { name: "Editar disposición" }).click();
  await page.getByRole("button", { name: "Celda 2, 2" }).click();
  await page
    .getByRole("textbox", { name: "Nombre de la mesa" })
    .fill("Mesa jardín");
  await page.getByRole("button", { name: "Guardar mesa", exact: true }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await page.getByRole("button", { name: "Terminar edición" }).click();
  await page.getByRole("link", { name: /Mesa jardín/ }).click();
  await page
    .getByRole("button", { name: `Agregar ${product.name}`, exact: true })
    .click();
  await page.getByRole("button", { name: "Abrir cuenta", exact: true }).click();
  await expect(page.getByRole("heading", { name: /Venta #/ })).toBeVisible();
  await page
    .getByRole("button", { name: "Agregar pedido", exact: true })
    .click();
  await page
    .getByRole("button", { name: `Agregar ${product.name}`, exact: true })
    .click();
  await page
    .getByRole("button", { name: "Guardar pedido", exact: true })
    .click();
  await expect(page.getByText("Pedido 2", { exact: true })).toBeVisible();
  await page
    .getByRole("button", { name: "Registrar cobro", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  await dialog
    .getByRole("combobox", { name: "Medio de pago 1" })
    .selectOption(method.id);
  await dialog.getByRole("textbox", { name: "Importe 1" }).fill("4000");
  await dialog.getByRole("button", { name: "Confirmar cobro" }).click();
  await expect(page.getByTestId("sale-balance")).toHaveText(/10\.000/);
  await page.goto("/tables");
  await expect(page.getByRole("link", { name: /Mesa jardín/ })).toContainText(
    "2 pedidos",
  );
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: "docs/previews/tables-desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator("body")).toHaveJSProperty("scrollWidth", 390);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: "docs/previews/tables-mobile.png",
    fullPage: true,
  });
  await page.getByRole("link", { name: /Mesa jardín/ }).click();
  await page
    .getByRole("button", { name: "Registrar cobro", exact: true })
    .click();
  await dialog
    .getByRole("combobox", { name: "Medio de pago 1" })
    .selectOption(method.id);
  await dialog.getByRole("button", { name: "Confirmar cobro" }).click();
  await expect(page.getByTestId("sale-balance")).toHaveText(/0,00/);
  await page.goto("/tables");
  await expect(page.getByRole("link", { name: /Mesa jardín/ })).toContainText(
    "Libre",
  );
  await page.goto("/sales");
  await page.getByRole("button", { name: "Delivery", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Número del pedido externo" })
    .fill("PEYA-UI-001");
  await page
    .getByRole("button", { name: `Agregar ${product.name}`, exact: true })
    .click();
  await page
    .getByRole("textbox", { name: `Precio de ${product.name}` })
    .fill("7400");
  await page
    .getByRole("textbox", { name: `Motivo del precio de ${product.name}` })
    .fill("Precio informado por PedidosYa");
  await page
    .getByRole("button", { name: "Registrar con cobro", exact: true })
    .click();
  await dialog
    .getByRole("combobox", { name: "Cobrado por 1" })
    .selectOption("platform");
  await dialog.getByRole("button", { name: "Confirmar cobro" }).click();
  await expect(page.getByTestId("platform-collected")).toHaveText(/7\.400/);
  const response = await page.request.post("/api/sales", {
    headers: { Origin: new URL(page.url()).origin },
    data: {
      requestId: randomUUID(),
      origin: "delivery",
      channel: "pedidosya",
      fulfillment: "delivery",
      externalId: "peya-ui-001",
      lines: [
        {
          productId: product.id,
          quantity: 1,
          expectedPrice: "7500.00",
          price: "7500",
        },
      ],
      payments: [],
    },
  });
  expect(response.status()).toBe(409);
});
