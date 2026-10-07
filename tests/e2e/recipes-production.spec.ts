import { test, expect, type Page, type BrowserContext } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
const email = process.env.E2E_EMAIL,
  password = process.env.E2E_PASSWORD;
test.skip(!email || !password, "Set E2E_EMAIL and E2E_PASSWORD");
let cookies: Awaited<ReturnType<BrowserContext["cookies"]>> | undefined;
async function signIn(page: Page) {
  if (cookies) {
    await page.context().addCookies(cookies);
    await page.goto("/");
    return;
  }
  await page.goto("/login");
  await page.getByLabel("Correo electrónico").fill(email!);
  await page.getByLabel("Contraseña").fill(password!);
  await page.getByRole("button", { name: "Ingresar" }).click();
  await expect(page).toHaveURL("/", { timeout: 25_000 });
  cookies = await page.context().cookies();
}
async function post(page: Page, url: string, data: unknown) {
  const response = await page.request.post(url, {
    data,
    headers: { Origin: new URL(page.url()).origin },
  });
  expect(response.ok(), await response.text()).toBe(true);
  return response.json();
}
test("edits a recipe, reviews shortages, records real yield and safely retries after a lost response", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await signIn(page);
  const raw = (
    await post(page, "/api/catalog/items", {
      name: "Tapioca cruda · prueba",
      baseUnit: "g",
      unitCost: "2",
    })
  ).row;
  const prepared = (
    await post(page, "/api/catalog/items", {
      name: "Tapioca cocida · prueba",
      baseUnit: "g",
      unitCost: "",
    })
  ).row;
  await page.goto("/products/recipes");
  await expect(
    page.getByRole("heading", { name: "Recetas", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Preparaciones base", exact: true })
    .click();
  await page.getByRole("button", { name: "Nueva receta", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog
    .getByRole("combobox", { name: "Preparado a ingresar" })
    .selectOption(prepared.id);
  await dialog.getByRole("textbox", { name: "Rendimiento base" }).fill("250");
  await dialog
    .getByRole("combobox", { name: "Ingrediente 1.1" })
    .selectOption(raw.id);
  await dialog.getByRole("textbox", { name: "Cantidad 1.1" }).fill("100");
  await dialog
    .getByRole("button", { name: "Guardar receta", exact: true })
    .click();
  await expect(dialog).not.toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Tapioca cocida · prueba", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", {
      name: "Ver receta de Tapioca cocida · prueba",
      exact: true,
    })
    .click();
  await expect(
    page.getByRole("heading", { name: "Tapioca cocida · prueba", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Editar receta", exact: true })
    .click();
  await dialog.getByRole("textbox", { name: "Rendimiento base" }).fill("240");
  await dialog
    .getByRole("button", { name: "Guardar receta", exact: true })
    .click();
  await expect(dialog).not.toBeVisible();
  await expect(
    page
      .getByRole("button", {
        name: "Ver receta de Tapioca cocida · prueba",
        exact: true,
      })
      .getByText("Versión 2", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Tapioca cocida · prueba", exact: true }),
  ).toBeVisible();
  await mkdir("docs/previews", { recursive: true });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: "docs/previews/recipes-desktop.png",
    fullPage: true,
  });
  await page.goto("/kitchen/production");
  await page
    .getByRole("button", { name: "Seleccionar Tapioca cocida · prueba" })
    .click();
  await page.getByRole("textbox", { name: "Producción real" }).fill("200");
  await page
    .getByRole("button", { name: "Seleccionar Tapioca cocida · prueba" })
    .click();
  await expect(
    page.getByRole("textbox", { name: "Producción real" }),
  ).toHaveValue("200");
  await page.getByRole("button", { name: "Revisar lote", exact: true }).click();
  await expect(
    page.getByText("Stock insuficiente", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Guardar lote", exact: true }),
  ).toBeDisabled();
  const date = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Argentina/Salta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  await post(page, "/api/inventory/adjustments", {
    requestId: randomUUID(),
    kind: "opening",
    itemId: raw.id,
    quantity: "200",
    unitCost: "2",
    receivedOn: date,
    reason: "Prueba de producción",
  });
  await page.getByRole("button", { name: "Revisar lote", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Guardar lote", exact: true }),
  ).toBeEnabled();
  await expect(page.getByText(/Costo total/)).toBeVisible();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: "docs/previews/production-desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: "docs/previews/production-mobile.png",
    fullPage: true,
  });
  let drop = true;
  await page.route("**/api/production", async (route) => {
    if (route.request().method() === "POST" && drop) {
      drop = false;
      await route.fetch();
      await route.abort("failed");
    } else await route.continue();
  });
  await page.getByRole("button", { name: "Guardar lote", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Reintentar mismo envío" }),
  ).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: "Reintentar mismo envío" }).click();
  await expect(
    page.getByText("Producción registrada", { exact: true }),
  ).toBeVisible();
  const list = await (await page.request.get("/api/production")).json();
  expect(list.total).toBe(1);
  expect(list.rows[0]).toMatchObject({
    actualOutput: "200.000000",
    totalCost: "200.000000",
    expectedOutput: "240.000000",
  });
  await page.goto("/inventory");
  await page
    .getByRole("searchbox", { name: "Buscar artículo" })
    .fill("Tapioca cocida · prueba");
  await expect(page.getByText(/200.*g/).first()).toBeVisible();
});

test("compares optional alternatives without editing the recipe and fits mobile", async ({
  page,
}) => {
  await signIn(page);
  const item = (
    await post(page, "/api/catalog/items", {
      name: "Perlas · prueba",
      baseUnit: "g",
      unitCost: "2",
    })
  ).row;
  const alternative = (
    await post(page, "/api/catalog/items", {
      name: "Alternativa sin precio · prueba",
      baseUnit: "g",
      unitCost: "",
    })
  ).row;
  const product = (
    await post(page, "/api/catalog/products", {
      name: "Bebida con perlas · prueba",
      priceCounter: "7000",
      pricePedidosYa: "7500",
      priceUberEats: "",
    })
  ).row;
  await page.goto("/products/recipes");
  await page.getByRole("button", { name: "Nueva receta", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog
    .getByRole("combobox", { name: "Producto", exact: true })
    .selectOption(product.id);
  await dialog
    .getByRole("combobox", { name: "Ingrediente 1.1" })
    .selectOption(item.id);
  await dialog.getByRole("textbox", { name: "Cantidad 1.1" }).fill("10");
  await dialog.getByRole("checkbox", { name: "Opcional" }).check();
  await dialog
    .getByRole("button", { name: "Agregar alternativa", exact: true })
    .click();
  await dialog
    .getByRole("combobox", { name: "Ingrediente 1.2" })
    .selectOption(alternative.id);
  await dialog.getByRole("textbox", { name: "Cantidad 1.2" }).fill("20");
  await dialog
    .getByRole("button", { name: "Guardar receta", exact: true })
    .click();
  await expect(dialog).not.toBeVisible();
  const panel = page.getByRole("region", { name: "Detalle de receta" });
  await expect(panel.getByText(/\$\s?20,00/)).toBeVisible();
  await panel
    .getByRole("combobox", { name: "Alternativa 1", exact: true })
    .selectOption({ label: alternative.name });
  await expect(
    panel.getByText("Costo pendiente", { exact: true }),
  ).toBeVisible();
  await panel
    .getByRole("combobox", { name: "Alternativa 1", exact: true })
    .selectOption("");
  await expect(panel.getByText(/\$\s?0,00/)).toBeVisible();
  await expect(panel.getByText("Omitido", { exact: true })).toBeVisible();
  const listing = await (
    await page.request.get(
      `/api/recipes?kind=product&q=${encodeURIComponent(product.name)}`,
    )
  ).json();
  const original = await (
    await page.request.get(`/api/recipes/${listing.rows[0].id}`)
  ).json();
  expect(original.revision).toBe(1);
  expect(original.cost.totalCost).toBe("20.000000");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => window.scrollTo(0, 0));
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "docs/previews/recipes-mobile.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: "docs/previews/recipes-products-desktop.png",
    fullPage: true,
  });
});
