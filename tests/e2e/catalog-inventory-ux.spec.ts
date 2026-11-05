import { test, expect, type Page } from "@playwright/test";
import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
const require = createRequire(import.meta.url);
let css = "";
const milk = "11111111-1111-4111-8111-111111111111",
  ham = "22222222-2222-4222-8222-222222222222",
  lot = "33333333-3333-4333-8333-333333333333",
  location = "44444444-4444-4444-8444-444444444444";
test.beforeAll(async () => {
  const { build } = createRequire(require.resolve("tsx"))("esbuild");
  await build({
    entryPoints: ["tests/helpers/catalog-inventory-ui.tsx"],
    outfile: ".next-e2e/catalog-inventory-ui.js",
    bundle: true,
    platform: "browser",
    jsx: "automatic",
    define: {
      "process.env.NODE_ENV": '"production"',
      "process.env": '{"NODE_ENV":"production"}',
    },
  });
  const postcss = createRequire(require.resolve("@tailwindcss/postcss"))(
    "postcss",
  );
  css = (
    await postcss([require("@tailwindcss/postcss")()]).process(
      await readFile("src/app/globals.css", "utf8"),
      { from: "src/app/globals.css" },
    )
  ).css;
});
async function mount(
  page: Page,
  mode = "inventory",
  options: {
    failRead?: boolean;
    many?: boolean;
    holdWrite?: boolean;
    tiny?: boolean;
    productList?: boolean;
  } = {},
) {
  const gate = Promise.withResolvers<void>();
  const control = {
    failRead: !!options.failRead,
    posts: [] as { path: string; body: unknown }[],
    release: gate.resolve,
    errors: [] as string[],
  };
  const products = options.productList
    ? [
        {
          id: milk,
          name: "Combo Waffle con Gaseosa",
          priceCounter: "5500.00",
          pricePedidosYa: null,
          priceUberEats: null,
          categoryName: "Combos",
          kind: "combo",
        },
        {
          id: ham,
          name: "Combo Superpancho con Gaseosa",
          priceCounter: "3500.00",
          pricePedidosYa: "4500.00",
          priceUberEats: "0.00",
          categoryName: "Combos",
          kind: "combo",
        },
        {
          id: lot,
          name: "Kybo Tea con perlas y leche",
          priceCounter: null,
          pricePedidosYa: null,
          priceUberEats: null,
          categoryName: "Bubble Teas",
          kind: "individual",
        },
      ]
    : [
        {
          id: milk,
          name: "Kybo Tea con perlas y leche",
          priceCounter: "5000.00",
          pricePedidosYa: null,
          priceUberEats: null,
          categoryName: "Bubble Tea",
          kind: "individual",
        },
      ];
  page.on("pageerror", (error) => control.errors.push(error.message));
  const items = [
    {
      id: milk,
      name: "Leche",
      code: "LECHE",
      class: "beverage",
      baseUnit: "ml",
      unitCost: "1.000000",
    },
    {
      id: ham,
      name: "Jamón cocido",
      code: "JAMON",
      class: "food",
      baseUnit: "g",
      unitCost: "8.000000",
    },
  ].map((i) => ({
    ...i,
    revision: 1,
    archivedAt: null,
    purchasable: true,
    stockTracked: true,
    recipeUsable: true,
  }));
  const stocks = [
    {
      itemId: milk,
      name: "Leche",
      baseUnit: "ml",
      physicalQuantity: options.tiny ? "0.004000" : "21000.000000",
      usableQuantity: "0.000000",
    },
    {
      itemId: ham,
      name: "Jamón cocido",
      baseUnit: "g",
      physicalQuantity: "3000.000000",
      usableQuantity: "3000.000000",
    },
    ...(options.many
      ? Array.from({ length: 25 }, (_, i) => ({
          itemId: `extra-${i}`,
          name: `Insumo ${i}`,
          baseUnit: "unit",
          physicalQuantity: "10.000000",
          usableQuantity: "10.000000",
        }))
      : []),
  ].map((i) => ({
    ...i,
    archived: false,
    expiredQuantity: "0.000000",
    blockedQuantity: "0.000000",
    undatedQuantity: "0.000000",
    stockValue: "21000.000000",
    averageCost: "1.000000",
  }));
  await page.route("**/*", async (r) => {
    const url = new URL(r.request().url()),
      path = url.pathname;
    if (path === "/__catalog-inventory")
      return r.fulfill({
        contentType: "text/html",
        body: `<html lang="es"><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style></head><body></body></html>`,
      });
    if (!path.startsWith("/api/")) return r.abort();
    if (r.request().method() !== "GET") {
      if (path === "/api/products/costs")
        return r.fulfill({
          json: {
            branchName: "Prueba",
            products: products.map((product) => ({
              productId: product.id,
              status: "ready",
              min: options.productList ? "2600.140000" : "800.000000",
              max: options.productList ? "2843.970000" : "800.000000",
              defaultCost: "800.000000",
              fixed: "800.000000",
              referenceItems: [],
              groups: [],
            })),
          },
        });
      control.posts.push({ path, body: r.request().postDataJSON() });
      if (options.holdWrite) await gate.promise;
      return r.fulfill({
        status: 409,
        json: { error: "Los datos cambiaron. Actualizá antes de continuar." },
      });
    }
    if (path === "/api/inventory")
      return r.fulfill(
        control.failRead
          ? { status: 503, json: { error: "Consulta no disponible." } }
          : {
              json: {
                rows: stocks.filter((i) =>
                  i.name
                    .toLowerCase()
                    .includes((url.searchParams.get("q") ?? "").toLowerCase()),
                ),
                total: stocks.length,
                asOf: new Date().toISOString(),
                businessDate: "2026-11-04",
              },
            },
      );
    if (path.startsWith("/api/inventory/"))
      return r.fulfill({
        json: {
          lots: {
            rows: [
              {
                id: lot,
                itemId: milk,
                itemName: "Leche",
                baseUnit: "ml",
                locationId: location,
                locationName: "Barra",
                reservedQuantity: options.tiny ? "0.004000" : "21000.000000",
                receiptId: null,
                receivedOn: "2026-11-01",
                expiresOn: "2027-01-01",
                lotCode: "LEC-01",
                initialQuantity: options.tiny ? "0.004000" : "21000.000000",
                remainingQuantity: options.tiny ? "0.004000" : "21000.000000",
                blocked: false,
                expired: false,
                revision: 1,
                createdAt: new Date().toISOString(),
              },
            ],
            total: 1,
          },
          movements: { rows: [], total: 0 },
        },
      });
    if (path === "/api/catalog/items")
      return r.fulfill(
        control.failRead && mode !== "inventory"
          ? {
              status: 503,
              json: { error: "No pudimos consultar el catálogo." },
            }
          : {
              json: {
                rows: items.filter((i) =>
                  i.name
                    .toLowerCase()
                    .includes((url.searchParams.get("q") ?? "").toLowerCase()),
                ),
                total: items.length,
              },
            },
      );
    if (path === "/api/catalog/products")
      return r.fulfill({
        json: {
          rows: products.map((product) => ({
            ...product,
            revision: 1,
            archivedAt: null,
          })),
          total: products.length,
        },
      });
    if (path === "/api/products/setup")
      return r.fulfill({
        json: {
          branch: { id: location, name: "Prueba" },
          locations: [{ id: location, name: "Barra" }],
          stations: [],
          current: null,
        },
      });
    if (path === "/api/branches/current")
      return r.fulfill({
        json: { locations: [{ id: location, name: "Barra", code: "BARRA" }] },
      });
    if (path.endsWith("/suppliers") && path.startsWith("/api/items/"))
      return r.fulfill({
        json: {
          item: { id: milk, baseUnit: "ml", unitCost: "1.000000" },
          suppliers: [],
          presentations: [],
        },
      });
    return r.fulfill({ json: { rows: [], total: 0 } });
  });
  await page.goto(`/__catalog-inventory?mode=${mode}`);
  await page.addScriptTag({ path: ".next-e2e/catalog-inventory-ui.js" });
  return control;
}
test("inventory read failure replaces loading with a local retry", async ({
  page,
}) => {
  const c = await mount(page, "inventory", { failRead: true });
  await expect(
    page
      .getByText("No pudimos cargar el inventario. Probá de nuevo.")
      .filter({ visible: true })
      .first(),
  ).toBeVisible();
  await expect(
    page.getByText("Cargando inventario…", { exact: true }),
  ).toHaveCount(0);
  c.failRead = false;
  await page
    .getByRole("button", { name: "Actualizar inventario", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Ver lotes de Leche", exact: true }),
  ).toBeVisible();
});
test("fully reserved stock never claims it is available and keeps units explicit", async ({
  page,
}) => {
  await mount(page);
  const row = page
    .getByRole("row")
    .filter({ has: page.getByText("Leche", { exact: true }) });
  await expect(
    row.getByText("Sin stock utilizable", { exact: true }),
  ).toBeVisible();
  await expect(row.getByText("Disponible", { exact: true })).toHaveCount(0);
  await expect(row.getByText("21 l", { exact: true })).toBeVisible();
});
test("lot detail gets focus from a long list and returns it on close", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 850 });
  await mount(page, "inventory", { many: true });
  const opener = page.getByRole("button", {
    name: "Ver lotes de Leche",
    exact: true,
  });
  await opener.click();
  const heading = page.getByRole("heading", { name: "Leche", exact: true });
  await expect(heading).toBeFocused();
  await expect(heading).toBeInViewport();
  await page.getByRole("tab", { name: "Movimientos", exact: true }).click();
  await expect(
    page.getByText("Sin movimientos.", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Cerrar detalle", exact: true })
    .click();
  await expect(opener).toBeFocused();
});
test("inventory adjustment uses protected focus, Escape and pending recovery", async ({
  page,
}) => {
  const c = await mount(page, "inventory", { holdWrite: true });
  const opener = page.getByRole("button", {
    name: "Ingreso manual",
    exact: true,
  });
  await opener.click();
  const dialog = page.getByRole("dialog");
  await expect(
    dialog.getByRole("combobox", { name: "Ubicación", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(opener).toBeFocused();
  await opener.click();
  await dialog
    .getByRole("textbox", { name: "Observaciones", exact: true })
    .fill("Control inicial");
  const article = dialog.getByRole("combobox", {
    name: "Artículo o ingrediente",
    exact: true,
  });
  await article.click();
  await expect(article).toHaveAttribute("aria-expanded", "true");
  await page.keyboard.press("Escape");
  await expect(dialog).toBeVisible();
  await expect(article).toHaveAttribute("aria-expanded", "false");
  await expect(
    dialog.getByRole("textbox", { name: "Observaciones", exact: true }),
  ).toHaveValue("Control inicial");
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await page
    .getByRole("button", { name: "Ver lotes de Leche", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Registrar conteo", exact: true })
    .click();
  await page.getByRole("textbox", { name: /^Cantidad/ }).fill("21000");
  await page
    .getByRole("textbox", { name: "Motivo", exact: true })
    .fill("Control diario");
  await page
    .getByRole("button", { name: "Confirmar conteo", exact: true })
    .click();
  await expect.poll(() => c.posts.length).toBe(1);
  try {
    await page.keyboard.press("Escape");
    await expect(dialog).toBeVisible();
  } finally {
    c.release();
  }
});
test("adjustment context preserves tiny base quantities and canonical count payload", async ({
  page,
}) => {
  const control = await mount(page, "inventory", { tiny: true });
  await page
    .getByRole("button", { name: "Ver lotes de Leche", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Registrar conteo", exact: true })
    .click();
  await expect(
    page.getByRole("dialog").getByText(/físico 0,004 ml/),
  ).toBeVisible();
  await page.getByRole("textbox", { name: /^Cantidad contada/ }).fill("0,004");
  await page
    .getByRole("textbox", { name: "Motivo", exact: true })
    .fill("Control de precisión");
  await page
    .getByRole("button", { name: "Confirmar conteo", exact: true })
    .click();
  await expect.poll(() => control.posts.length).toBe(1);
  expect(control.posts[0].body).toMatchObject({
    kind: "count",
    countedQuantity: "0,004",
    lotId: lot,
    revision: 1,
  });
});
test("catalog failure does not claim there are no records and can recover", async ({
  page,
}) => {
  const c = await mount(page, "items", { failRead: true });
  await expect(
    page
      .getByText("No pudimos consultar el catálogo.")
      .filter({ visible: true })
      .first(),
  ).toBeVisible();
  await expect(
    page.getByText("Todavía no hay registros", { exact: true }),
  ).toHaveCount(0);
  c.failRead = false;
  await page
    .getByRole("button", { name: "Actualizar lista", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Más acciones de Leche", exact: true }),
  ).toBeVisible();
});
for (const width of [320, 390, 727])
  test(`product comparison stays compact and retains channel prices at ${width}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 1000 });
    const control = await mount(page, "products", { productList: true });
    const first = page
      .locator("article")
      .filter({ hasText: "Combo Waffle con Gaseosa" });
    const second = page
      .locator("article")
      .filter({ hasText: "Combo Superpancho con Gaseosa" });
    await expect(first.getByText(/^\$\s*2.600,14/)).toBeVisible();
    const bounds = await first.boundingBox();
    expect(bounds!.height).toBeLessThanOrEqual(width < 600 ? 230 : 190);
    for (const button of await first.getByRole("button").all()) {
      const controlBounds = await button.boundingBox();
      expect(controlBounds!.x + controlBounds!.width).toBeLessThanOrEqual(
        bounds!.x + bounds!.width,
      );
    }
    await expect(
      page.getByRole("heading", {
        name: "Kybo Tea con perlas y leche",
        exact: true,
      }),
    ).toBeInViewport();
    await expect(
      first.getByRole("button", { name: "Editar", exact: true }),
    ).toBeInViewport();
    await expect(
      first.getByText("Costo estimado", { exact: true }),
    ).toHaveCount(1);
    const channels = first.getByRole("button", {
      name: "Otros canales",
      exact: true,
    });
    await channels.focus();
    await page.keyboard.press("Enter");
    await expect(first.getByText("Sin precio", { exact: true })).toHaveCount(2);
    await expect(channels).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(channels).toHaveAttribute("aria-expanded", "false");
    await second
      .getByRole("button", { name: "Otros canales", exact: true })
      .click();
    await expect(second.getByText(/^\$\s*4.500,00$/)).toBeVisible();
    await expect(second.getByText(/^\$\s*0,00$/)).toBeVisible();
    await second
      .getByRole("button", { name: "Otros canales", exact: true })
      .click();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    expect(control.posts).toHaveLength(0);
    expect(control.errors).toEqual([]);
    await page.screenshot({
      path: `.next-e2e/catalog-product-density-${width}.png`,
      fullPage: true,
    });
  });

for (const width of [390, 768, 1440])
  test(`catalog and inventory retain readable controls at ${width}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 1000 });
    const c = await mount(page, "items");
    const search = page.getByRole("textbox", { name: /^Buscar / });
    await search.fill("Leche");
    await page
      .getByRole("button", { name: "Editar", exact: true })
      .first()
      .click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page
      .getByRole("textbox", { name: "Nombre", exact: true })
      .fill("Leche (borrador)");
    await page.getByRole("button", { name: "Cancelar", exact: true }).click();
    await expect(search).toHaveValue("Leche");
    await page
      .getByRole("button", { name: "Más acciones de Leche", exact: true })
      .click();
    await expect(
      page.getByRole("menuitem", { name: "Archivar", exact: true }),
    ).toBeVisible();
    await page.keyboard.press("Escape");
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    expect(c.posts).toHaveLength(0);
    await page.screenshot({
      path: `.next-e2e/catalog-items-${width}.png`,
      fullPage: true,
    });
    const inventory = await mount(page, "inventory");
    await expect(
      page.getByRole("button", { name: "Ver lotes de Leche", exact: true }),
    ).toBeEnabled();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: `.next-e2e/inventory-stock-${width}.png`,
      fullPage: true,
    });
    await page
      .getByRole("button", { name: "Ver lotes de Leche", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Leche", exact: true }),
    ).toBeFocused();
    await page.screenshot({
      path: `.next-e2e/inventory-lots-${width}.png`,
      fullPage: false,
    });
    await page
      .getByRole("button", { name: "Registrar conteo", exact: true })
      .click();
    await expect(
      page
        .getByRole("dialog")
        .getByRole("button", { name: "Confirmar conteo", exact: true }),
    ).toBeInViewport();
    await page.screenshot({
      path: `.next-e2e/inventory-adjustment-${width}.png`,
      fullPage: false,
    });
    await page.keyboard.press("Escape");
    expect(inventory.posts).toHaveLength(0);
    const products = await mount(page, "products");
    await expect(
      page.getByRole("button", { name: "Editar", exact: true }).first(),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await expect(
      page
        .getByText(/^\$\s*800,00/)
        .filter({ visible: true })
        .first(),
    ).toBeVisible();
    expect(products.errors).toEqual([]);
    await page.screenshot({
      path: `.next-e2e/catalog-products-${width}.png`,
      fullPage: true,
    });
  });
