import { test, expect, type Page } from "@playwright/test";
import { createRequire } from "node:module";
import { readFile, writeFile } from "node:fs/promises";
const require = createRequire(import.meta.url);
const bundle = ".next-e2e/ui-consistency-fixture.js";
let css = "";
test.beforeAll(async () => {
  test.setTimeout(120_000);
  await createRequire(require.resolve("tsx"))("esbuild").build({
    entryPoints: ["tests/helpers/ui-consistency.tsx"],
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
    ]).process(
      (await readFile("src/app/globals.css", "utf8")).replace(
        '@import "tailwindcss";',
        '@import "tailwindcss" source(none);\n@source "../components";\n@source "../../tests/helpers/ui-consistency.tsx";',
      ),
      { from: "src/app/globals.css" },
    )
  ).css;
  css += await readFile("src/components/cash/cash.css", "utf8");
  await writeFile(".next-e2e/ui-consistency-fixture.css", css);
});
async function fixture(page: Page, view = "foundation") {
  // Every request is intercepted, including writes: this test cannot reach Neon.
  await page.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === "/__ui-consistency")
      return route.fulfill({
        contentType: "text/html",
        body: `<html lang="es"><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style></head><body><div id="root"></div></body></html>`,
      });
    if (route.request().method() !== "GET")
      return route.fulfill({
        status: 409,
        json: { error: "Prueba sin escrituras" },
      });
    if (url.pathname === "/api/catalog/items" && view === "ingredients")
      return route.fulfill({
        json: {
          rows: [
            {
              id: "milk",
              name: "Leche",
              code: "LECHE",
              class: "food",
              baseUnit: "ml",
              unitCost: "1",
              recipeUsable: true,
              purchasable: true,
              stockTracked: true,
              revision: 1,
              archivedAt: null,
            },
          ],
          total: 1,
        },
      });
    if (url.pathname === "/api/products/setup")
      return route.fulfill({
        json: {
          branch: { id: "branch", name: "Prueba" },
          locations: [{ id: "store", name: "Depósito" }],
          stations: [],
          current: null,
        },
      });
    if (url.pathname.startsWith("/api/"))
      return route.fulfill({ json: { rows: [], total: 0, products: {} } });
    return route.abort();
  });
  await page.goto(`/__ui-consistency?view=${view}`);
  await page.addScriptTag({ path: bundle });
}
function contrast(hex: string) {
  const values = hex
    .match(/[\d.]+/g)!
    .slice(0, 3)
    .map(Number)
    .map((v) => {
      const n = v / 255;
      return n <= 0.04045 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4;
    });
  return (
    1.05 / (values[0] * 0.2126 + values[1] * 0.7152 + values[2] * 0.0722 + 0.05)
  );
}
test("outlined primary ink is readable and an explicit touch height wins", async ({
  page,
}) => {
  await fixture(page);
  const ink = await page
    .getByRole("button", { name: "Abrir caja", exact: true })
    .evaluate((el) => getComputedStyle(el).color);
  expect(contrast(ink)).toBeGreaterThanOrEqual(4.5);
  expect(
    (await page
      .getByRole("button", { name: "Actualizar", exact: true })
      .boundingBox())!.height,
  ).toBeGreaterThanOrEqual(48);
});
test("controlled dialogs restore the actual opener after Escape, Cancel and nesting", async ({
  page,
}) => {
  await fixture(page);
  const opener = page.getByRole("button", { name: "Abrir ficha", exact: true });
  await opener.click();
  await page.keyboard.press("Escape");
  await expect(opener).toBeFocused();
  await opener.click();
  await page
    .getByRole("button", { name: "Abrir detalle", exact: true })
    .click();
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("button", { name: "Abrir detalle", exact: true }),
  ).toBeFocused();
  await page.getByRole("button", { name: "Cancelar", exact: true }).click();
  await expect(opener).toBeFocused();
});
test("cash input keeps a clear focus cue and auxiliary targets fit touch", async ({
  page,
}) => {
  await fixture(page);
  const input = page.getByLabel("Fondo inicial");
  await input.focus();
  const color = await input.evaluate((el) => getComputedStyle(el).outlineColor);
  expect(contrast(color)).toBeGreaterThanOrEqual(3);
  expect(
    (await page.getByRole("button", { name: "Acción auxiliar" }).boundingBox())!
      .height,
  ).toBeGreaterThanOrEqual(44);
});
test("shared tabs support keyboard selection, panels and preserved drafts", async ({
  page,
}) => {
  await fixture(page);
  await page.getByLabel("Borrador de tarea").fill("Conservar este pedido");
  const tasks = page.getByRole("tab", { name: "Tareas", exact: true });
  const stock = page.getByRole("tab", { name: "Stock", exact: true });
  await tasks.focus();
  await page.keyboard.press("ArrowRight");
  await expect(stock).toBeFocused();
  await expect(stock).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("tabpanel")).toContainText("Stock disponible");
  await expect(page.getByRole("tab", { selected: true })).toHaveCount(1);
  await page.keyboard.press("Home");
  await expect(tasks).toBeFocused();
  await expect(page.getByLabel("Borrador de tarea")).toHaveValue(
    "Conservar este pedido",
  );
  await page.keyboard.press("End");
  await expect(stock).toBeFocused();
});
test("ingredient secondary actions stay accessible and duplication returns focus to its menu", async ({
  page,
}) => {
  await fixture(page, "ingredients");
  const row = page
    .getByRole("row")
    .filter({ has: page.getByRole("cell", { name: "Leche", exact: true }) });
  await expect(
    row.getByRole("button", { name: "Editar", exact: true }),
  ).toBeVisible();
  const menu = row.getByRole("button", {
    name: "Más acciones de Leche",
    exact: true,
  });
  await menu.focus();
  await page.keyboard.press("Enter");
  await expect(
    page.getByRole("menuitem", { name: "Duplicar", exact: true }),
  ).toBeVisible();
  await page.getByRole("menuitem", { name: "Duplicar", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(
    page.getByRole("textbox", { name: "Nombre", exact: true }),
  ).toHaveValue("");
  await page.keyboard.press("Escape");
  await expect(menu).toBeFocused();
});
test("category creation is clearly named and cancelling returns to its opener", async ({
  page,
}) => {
  await fixture(page, "categories");
  const create = page.getByRole("button", {
    name: "Crear categoría",
    exact: true,
  });
  await create.click();
  await expect(
    page.getByRole("dialog", { name: "Crear categoría" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Cancelar", exact: true }).click();
  await expect(create).toBeFocused();
});
test("product optional channel prices retain their draft and actions stay reachable", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await fixture(page, "products");
  await page
    .getByRole("button", { name: "Nuevo producto", exact: true })
    .click();
  await expect(
    page.getByRole("textbox", { name: "Precio final mostrador", exact: true }),
  ).toBeAttached();
  const enabled = page.getByRole("combobox", {
    name: "Disponible en PedidosYa",
    exact: true,
  });
  await enabled.selectOption("true");
  await page
    .getByRole("textbox", { name: "Precio final PedidosYa", exact: true })
    .fill("5000");
  await enabled.selectOption("false");
  await expect(
    page.getByRole("textbox", { name: "Precio final PedidosYa", exact: true }),
  ).toHaveCount(0);
  await enabled.selectOption("true");
  await expect(
    page.getByRole("textbox", { name: "Precio final PedidosYa", exact: true }),
  ).toHaveValue("5000");
  const cancel = page.getByRole("button", { name: "Cancelar", exact: true });
  const bounds = (await cancel.boundingBox())!;
  expect(bounds.y + bounds.height).toBeLessThanOrEqual(844);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await cancel.click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
});
test("an invalid optional price remains reachable after disabling its channel", async ({
  page,
}) => {
  await fixture(page, "products");
  await page
    .getByRole("button", { name: "Nuevo producto", exact: true })
    .click();
  const channel = page.getByRole("combobox", {
    name: "Disponible en PedidosYa",
    exact: true,
  });
  await channel.selectOption("true");
  const price = page.getByRole("textbox", {
    name: "Precio final PedidosYa",
    exact: true,
  });
  await price.fill("12.50");
  await channel.selectOption("false");
  await expect(price).toBeVisible();
  await expect(price).toHaveAttribute("aria-invalid", "true");
  await price.fill("1250");
  await expect(price).toHaveCount(0);
});
test("a delayed archive error keeps keyboard focus in its ingredient row", async ({
  page,
}) => {
  await fixture(page, "ingredients");
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/api/catalog/items/milk", async (route) => {
    await gate;
    await route.fulfill({
      status: 503,
      json: {
        error: "No pudimos archivar el ingrediente de prueba.",
      },
    });
  });
  const menu = page
    .getByRole("row")
    .filter({ has: page.getByRole("cell", { name: "Leche", exact: true }) })
    .getByRole("button", { name: "Más acciones de Leche", exact: true });
  await menu.press("Enter");
  await page
    .getByRole("menuitem", { name: "Archivar", exact: true })
    .press("Enter");
  try {
    await expect(menu).toBeFocused();
    await expect(menu).toHaveAttribute("aria-disabled", "true");
  } finally {
    release();
  }
  await expect(menu).not.toHaveAttribute("aria-disabled", "true");
  await expect(menu).toBeFocused();
});
test("archiving an ingredient returns focus to the list when its row disappears", async ({
  page,
}) => {
  await fixture(page, "ingredients");
  const menu = page
    .getByRole("row")
    .filter({ has: page.getByRole("cell", { name: "Leche", exact: true }) })
    .getByRole("button", { name: "Más acciones de Leche", exact: true });
  await expect(menu).toBeVisible();
  await page.route("**/api/catalog/items?**", (route) =>
    route.fulfill({ json: { rows: [], total: 0 } }),
  );
  await page.route("**/api/catalog/items/milk", (route) =>
    route.fulfill({ json: { ok: true } }),
  );
  await menu.press("Enter");
  await page
    .getByRole("menuitem", { name: "Archivar", exact: true })
    .press("Enter");
  await expect(menu).toHaveCount(0);
  await expect(page.getByRole("textbox", { name: /^Buscar / })).toBeFocused();
});
test("a valid disabled channel price remains in the submitted product", async ({
  page,
}) => {
  await fixture(page, "products");
  let payload: Record<string, unknown> | undefined;
  await page.route("**/api/catalog/products", (route) => {
    payload = route.request().postDataJSON();
    return route.fulfill({
      status: 409,
      json: { error: "Operación de prueba interceptada." },
    });
  });
  await page
    .getByRole("button", { name: "Nuevo producto", exact: true })
    .click();
  await page
    .getByRole("textbox", { name: "Nombre", exact: true })
    .fill("Producto de prueba");
  await page
    .getByRole("combobox", { name: "Tipo de producto", exact: true })
    .selectOption("combo");
  await page
    .getByRole("textbox", { name: "Precio final mostrador", exact: true })
    .fill("5000");
  const channel = page.getByRole("combobox", {
    name: "Disponible en PedidosYa",
    exact: true,
  });
  await channel.selectOption("true");
  await page
    .getByRole("textbox", { name: "Precio final PedidosYa", exact: true })
    .fill("6000");
  await channel.selectOption("false");
  await page.getByRole("button", { name: "Guardar", exact: true }).click();
  await expect
    .poll(() => payload)
    .toMatchObject({
      priceCounter: "5000",
      pricePedidosYa: "6000",
      enabledPedidosYa: "false",
    });
});
