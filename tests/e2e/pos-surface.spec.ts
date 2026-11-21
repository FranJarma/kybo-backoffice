import {
  test,
  expect,
  type Locator,
  type Page,
  type Route,
} from "@playwright/test";
import { createRequire } from "node:module";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
const require = createRequire(import.meta.url);
const reportDirectory = process.env.POS_SURFACE_REPORT_DIR;
const posFonts = [
  { file: "barlow-regular.ttf", weight: 400 },
  { file: "barlow-medium.ttf", weight: 500 },
  { file: "barlow-semibold.ttf", weight: 600 },
  { file: "barlow-bold.ttf", weight: 700 },
];
const posFontCss = posFonts
  .filter((font) => existsSync(`public/fonts/${font.file}`))
  .map(
    (font) =>
      `@font-face{font-family:Barlow;src:url(/fonts/${font.file});font-weight:${font.weight};font-display:swap}`,
  )
  .join("\n");
let css = "",
  script = "",
  scriptBytes = 0;
const id = (number: number) =>
  `20000000-0000-4000-8000-${String(number).padStart(12, "0")}`;
const rows = [
  {
    id: id(1),
    name: "Oreo Iced Latte",
    price: "7500.00",
    categoryId: "lattes",
  },
  { id: id(2), name: "Shake Oreo", price: "7900.00", categoryId: "shakes" },
  { id: id(3), name: "Soft Frutilla", price: "3500.00", categoryId: "soft" },
  { id: id(4), name: "Kybo Tea", price: "6900.00", categoryId: "lattes" },
  {
    id: id(5),
    name: "Taro Iced Latte",
    price: "7900.00",
    categoryId: "lattes",
  },
  {
    id: id(6),
    name: "Matcha Iced Latte",
    price: "7900.00",
    categoryId: "lattes",
  },
  { id: id(7), name: "Kybo Frozen", price: "4900.00", categoryId: "shakes" },
  { id: id(8), name: "Cappuccino", price: "3500.00", categoryId: "lattes" },
  {
    id: id(9),
    name: "Waffle con jamón y queso",
    price: "6500.00",
    categoryId: "salados",
  },
].map((row) => ({
  ...row,
  configured: true,
  vatPending: false,
  pricingRevision: 1,
  fulfillmentVersionId: id(100 + Number(row.id.slice(-3))),
}));
const categories = [
  { id: "lattes", name: "Lattes" },
  { id: "shakes", name: "Shakes" },
  { id: "soft", name: "Soft" },
  { id: "salados", name: "Salados" },
];
function configuration(productId: string) {
  const product = rows.find((row) => row.id === productId)!;
  return {
    basePrice: product.price,
    catalogBasePrice: product.price,
    vatRate: "0.00",
    fulfillmentVersionId: product.fulfillmentVersionId,
    recipeVersionId: productId === id(1) ? id(300) : null,
    pricingRevision: 1,
    model: productId === id(1) ? "configurable" : "unavailable",
    groups:
      productId === id(1)
        ? [
            {
              id: id(400),
              name: "Perlas",
              min: 1,
              max: 1,
              options: [
                {
                  id: id(401),
                  key: "chocolate",
                  name: "Chocolate",
                  defaultCount: 1,
                  maxCount: 1,
                  price: "0.00",
                  available: true,
                },
                {
                  id: id(402),
                  key: "mango",
                  name: "Mango",
                  defaultCount: 0,
                  maxCount: 1,
                  price: "0.00",
                  available: true,
                },
                {
                  id: id(403),
                  key: "no-pearls",
                  name: "Sin perlas",
                  defaultCount: 0,
                  maxCount: 1,
                  price: "0.00",
                  available: true,
                },
                {
                  id: id(404),
                  key: "blackberry",
                  name: "Mora",
                  defaultCount: 0,
                  maxCount: 1,
                  price: "0.00",
                  available: false,
                },
              ],
            },
            {
              id: id(410),
              name: "Salsas",
              min: 0,
              max: 2,
              options: [
                {
                  id: id(411),
                  key: "caramel",
                  name: "Caramelo",
                  defaultCount: 0,
                  maxCount: 2,
                  price: "100.00",
                  available: true,
                },
                {
                  id: id(412),
                  key: "strawberry",
                  name: "Frutilla",
                  defaultCount: 0,
                  maxCount: 1,
                  price: "100.00",
                  available: true,
                },
              ],
            },
          ]
        : [],
  };
}
test.beforeAll(async () => {
  test.setTimeout(120000);
  await mkdir(".next-e2e", { recursive: true });
  await createRequire(require.resolve("tsx"))("esbuild").build({
    entryPoints: ["tests/helpers/pos-surface-ui.tsx"],
    outfile: ".next-e2e/pos-surface-fixture.js",
    bundle: true,
    platform: "browser",
    jsx: "automatic",
    alias: { "react-dom/client": "react-dom/profiling" },
    define: {
      "process.env.NODE_ENV": '"production"',
      "process.env": '{"NODE_ENV":"production"}',
    },
  });
  script = await readFile(".next-e2e/pos-surface-fixture.js", "utf8");
  if (process.env.POS_SURFACE_USE_FROZEN_SOURCE === "1" && reportDirectory)
    script = await readFile(join(reportDirectory, "fixture.js"), "utf8");
  scriptBytes = Buffer.byteLength(script);
  const postcss = createRequire(require.resolve("@tailwindcss/postcss"))(
    "postcss",
  );
  css = (
    await postcss([require("@tailwindcss/postcss")()]).process(
      await readFile("src/app/globals.css", "utf8"),
      { from: "src/app/globals.css" },
    )
  ).css;
  if (
    existsSync("src/components/sales/pos.css") &&
    process.env.POS_SURFACE_USE_FROZEN_SOURCE !== "1"
  )
    css += "\n" + (await readFile("src/components/sales/pos.css", "utf8"));
});
type Call = { method: string; path: string; elapsedMs: number };
const longProductName =
  "Waffle de chipá con jamón, queso y una descripción extendida para comprobar el ajuste de nombres " +
  "superextensosininterrupciones".repeat(3);
async function mount(page: Page, edgeCases = false) {
  const calls: Call[] = [],
    errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const started = performance.now();
  await page.route("**/*", async (route: Route) => {
    const url = new URL(route.request().url());
    if (url.pathname === "/__pos-surface")
      return route.fulfill({
        contentType: "text/html; charset=utf-8",
        body: `<!doctype html><html lang="es-AR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>@font-face{font-family:Manrope;src:url(/fonts/manrope.ttf)}${posFontCss}:root{--font-manrope:Manrope;--font-barlow:Barlow} ${css} html,body{height:100%;margin:0}#fixture{height:100dvh;padding:16px;min-width:0;overflow:hidden}</style></head><body><main id="fixture"></main><script src="/__pos-surface.js"></script></body></html>`,
      });
    if (url.pathname === "/__pos-surface.js")
      return route.fulfill({
        contentType: "text/javascript; charset=utf-8",
        body: script,
      });
    if (url.pathname === "/fonts/manrope.ttf")
      return route.fulfill({
        contentType: "font/ttf",
        body: await readFile("public/fonts/manrope.ttf"),
      });
    const posFont = posFonts.find(
      (font) => url.pathname === `/fonts/${font.file}`,
    );
    if (posFont)
      return route.fulfill({
        contentType: "font/ttf",
        body: await readFile(`public/fonts/${posFont.file}`),
      });
    if (!url.pathname.startsWith("/api/")) return route.abort();
    calls.push({
      method: route.request().method(),
      path: url.pathname + url.search,
      elapsedMs: performance.now() - started,
    });
    if (url.pathname === "/api/cash/status")
      return route.fulfill({
        json: {
          available: true,
          activated: true,
          open: true,
          sessionId: id(500),
          canOpen: true,
        },
      });
    if (url.pathname === "/api/pickup")
      return route.fulfill({
        json: {
          count: 16,
          occupied: [],
          publicPath: "/pickup/surface-fixture",
        },
      });
    if (url.pathname === "/api/inventory/replenishment")
      return route.fulfill({
        json: {
          policies: [],
          alerts: [],
          locations: [],
          items: [],
          asOf: "2026-11-20T20:00:00.000Z",
        },
      });
    if (url.pathname === "/api/sales/lookup") {
      const kind = url.searchParams.get("kind");
      if (kind === "products")
        return route.fulfill({
          json: {
            rows: edgeCases
              ? rows.map((row, index) =>
                  index === rows.length - 1
                    ? { ...row, name: longProductName, imageAssetId: null }
                    : row,
                )
              : rows,
            categories: edgeCases
              ? [...categories, { id: "empty", name: "Sin productos" }]
              : categories,
            total: rows.length,
            offset: 0,
          },
        });
      if (kind === "payment-methods")
        return route.fulfill({
          json: {
            rows: [
              { id: id(601), name: "Efectivo", kind: "cash" },
              { id: id(602), name: "Débito", kind: "card" },
              { id: id(603), name: "Crédito", kind: "card" },
              { id: id(604), name: "Transferencia", kind: "transfer" },
            ],
            total: 4,
          },
        });
      return route.fulfill({ json: { rows: [], total: 0 } });
    }
    const config = url.pathname.match(
      /^\/api\/sales\/products\/([^/]+)\/configuration$/,
    );
    if (config) return route.fulfill({ json: configuration(config[1]) });
    if (url.pathname.startsWith("/api/media/"))
      return route.fulfill({ status: 404, body: "Missing fixture photo" });
    // The fixture has no external transport: unneeded read endpoints remain empty.
    if (route.request().method() === "GET")
      return route.fulfill({
        json: { rows: [], total: 0, offset: 0, orders: [] },
      });
    return route.fulfill({
      status: 409,
      json: { error: "Esta prueba no registra operaciones reales." },
    });
  });
  await page.goto("/__pos-surface");
  await expect(
    page.getByRole("button", { name: "Agregar Oreo Iced Latte", exact: true }),
  )
    .toBeEnabled()
    .catch((error) => {
      throw new Error(
        `${error.message}\nRuntime errors: ${JSON.stringify(errors)}\nAPI calls: ${JSON.stringify(calls)}`,
      );
    });
  const catalogueReadyMs = performance.now() - started;
  return { calls, errors, catalogueReadyMs };
}
const profiles: unknown[] = [];
async function expectUnclippedKeyboardFocus(button: Locator) {
  await expect(button).toBeFocused();
  const focus = await button.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    const extent =
      parseFloat(style.outlineWidth) + parseFloat(style.outlineOffset);
    const clipped: { ancestor: string; edge: string; clearance: number }[] = [];
    let ancestor = element.parentElement;
    while (ancestor) {
      const ancestorStyle = getComputedStyle(ancestor);
      const bounds = ancestor.getBoundingClientRect();
      const left = bounds.left + ancestor.clientLeft;
      const top = bounds.top + ancestor.clientTop;
      const right = left + ancestor.clientWidth;
      const bottom = top + ancestor.clientHeight;
      if (
        ["auto", "scroll", "hidden", "clip"].includes(ancestorStyle.overflowX)
      ) {
        if (rect.left - extent < left - 0.5)
          clipped.push({
            ancestor: ancestor.className || ancestor.tagName,
            edge: "left",
            clearance: rect.left - extent - left,
          });
        if (rect.right + extent > right + 0.5)
          clipped.push({
            ancestor: ancestor.className || ancestor.tagName,
            edge: "right",
            clearance: right - rect.right - extent,
          });
      }
      if (
        ["auto", "scroll", "hidden", "clip"].includes(ancestorStyle.overflowY)
      ) {
        if (rect.top - extent < top - 0.5)
          clipped.push({
            ancestor: ancestor.className || ancestor.tagName,
            edge: "top",
            clearance: rect.top - extent - top,
          });
        if (rect.bottom + extent > bottom + 0.5)
          clipped.push({
            ancestor: ancestor.className || ancestor.tagName,
            edge: "bottom",
            clearance: bottom - rect.bottom - extent,
          });
      }
      ancestor = ancestor.parentElement;
    }
    return {
      visible: element.matches(":focus-visible"),
      outlineStyle: style.outlineStyle,
      extent,
      clipped,
    };
  });
  expect(focus.visible).toBe(true);
  expect(focus.outlineStyle).not.toBe("none");
  expect(focus.extent).toBeGreaterThanOrEqual(4);
  expect(focus.clipped).toEqual([]);
}
for (const region of ["categories", "products"] as const)
  test(`catalogue focus ring stays visible at the first and last ${region} when using the keyboard`, async ({
    page,
  }) => {
    // The baseline 844px height cannot fit one complete card until Task4.
    // Keep this check about the focus halo, with room for a full card.
    await page.setViewportSize({ width: 390, height: 1024 });
    await mount(page);
    const catalogue = page.locator("[data-pos-catalogue]");
    const categoryButtons = catalogue
      .getByRole("group", { name: "Categorías de productos" })
      .getByRole("button");
    const cards = catalogue.locator(".pos-product-card");
    await catalogue
      .getByRole("textbox", { name: "Buscar productos", exact: true })
      .focus();
    await page.keyboard.press("Tab");
    if (region === "categories") {
      await expectUnclippedKeyboardFocus(categoryButtons.first());
      for (let index = 1; index < (await categoryButtons.count()); index++)
        await page.keyboard.press("Tab");
      await expectUnclippedKeyboardFocus(categoryButtons.last());
    } else {
      for (let index = 0; index < (await categoryButtons.count()); index++)
        await page.keyboard.press("Tab");
      await expectUnclippedKeyboardFocus(cards.first());
      for (let index = 1; index < (await cards.count()); index++)
        await page.keyboard.press("Tab");
      await expectUnclippedKeyboardFocus(cards.last());
    }
    if (reportDirectory) {
      await mkdir(reportDirectory, { recursive: true });
      await page.screenshot({
        path: join(reportDirectory, `focus-${region}-390.png`),
      });
    }
  });

test("catalogue handles an empty category and a long product name with a missing photo", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 720 });
  const app = await mount(page, true);
  const catalogue = page.locator("[data-pos-catalogue]");
  const longCard = catalogue.getByRole("button", {
    name: `Agregar ${longProductName}`,
    exact: true,
  });
  await longCard.scrollIntoViewIfNeeded();
  await expect(longCard.getByLabel("Sin foto", { exact: true })).toBeVisible();
  const nameGeometry = await longCard
    .locator(".pos-product-name")
    .evaluate((element) => ({
      scrollWidth: element.scrollWidth,
      clientWidth: element.clientWidth,
    }));
  expect(nameGeometry.scrollWidth).toBeLessThanOrEqual(
    nameGeometry.clientWidth,
  );
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(320);
  const before = app.calls.filter((call) =>
    call.path.includes("kind=products"),
  ).length;
  await catalogue
    .getByRole("button", { name: "Sin productos", exact: true })
    .click();
  await expect(
    catalogue.getByText("No hay productos con estos filtros", { exact: true }),
  ).toBeVisible();
  await expect(catalogue.locator(".pos-product-card")).toHaveCount(0);
  await catalogue.getByRole("button", { name: "Todas", exact: true }).click();
  await expect(longCard).toBeVisible();
  expect(
    app.calls.filter((call) => call.path.includes("kind=products")).length,
  ).toBe(before);
  expect(app.errors).toEqual([]);
});
test.use({ actionTimeout: 15000 });
test.afterAll(async () => {
  if (!reportDirectory) return;
  await mkdir(reportDirectory, { recursive: true });
  await writeFile(
    join(reportDirectory, "metrics.json"),
    JSON.stringify(
      {
        source:
          "SalesManager isolated browser fixture; mocked API, no DB; production profiling build",
        node: process.version,
        scriptBytes,
        runs: profiles,
      },
      null,
      2,
    ),
  );
});
for (const viewport of [
  { width: 1280, height: 800 },
  { width: 768, height: 1024 },
  { width: 390, height: 844 },
])
  test(`POS baseline preserves one draft and cached options at ${viewport.width}px`, async ({
    page,
  }) => {
    test.setTimeout(120000);
    await page.setViewportSize(viewport);
    const app = await mount(page);
    await expect
      .poll(
        () =>
          app.calls.filter((call) => call.path.includes("/configuration"))
            .length,
      )
      .toBe(rows.length);
    const configStart = performance.now();
    await page
      .getByRole("button", { name: "Agregar Oreo Iced Latte", exact: true })
      .click();
    const options = page.getByRole("dialog");
    await expect(
      options.getByText("Perlas", { exact: false }).first(),
    ).toBeVisible();
    const configurationReadyMs = performance.now() - configStart;
    if (reportDirectory) {
      await mkdir(reportDirectory, { recursive: true });
      await page.screenshot({
        path: join(reportDirectory, `modifiers-${viewport.width}.png`),
      });
    }
    await options
      .getByRole("button", { name: "Agregar al pedido", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Agregar Shake Oreo", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Agregar Soft Frutilla", exact: true })
      .click();
    const catalogueCalls = () =>
      app.calls.filter((call) => call.path.includes("kind=products")).length;
    const configurationCalls = () =>
      app.calls.filter((call) => call.path.includes("/configuration")).length;
    const before = {
      catalogue: catalogueCalls(),
      configuration: configurationCalls(),
    };
    const beforeSearch = await page.evaluate(() => window.posProfile);
    await page
      .getByRole("textbox", { name: "Buscar productos", exact: true })
      .fill("taro");
    await expect(
      page.getByRole("button", {
        name: "Agregar Taro Iced Latte",
        exact: true,
      }),
    ).toBeVisible();
    await page
      .getByRole("textbox", { name: "Buscar productos", exact: true })
      .fill("");
    await page.getByRole("button", { name: "Shakes", exact: true }).click();
    await expect(
      page.getByRole("button", { name: "Agregar Shake Oreo", exact: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Todas", exact: true }).click();
    const afterSearch = await page.evaluate(() => window.posProfile);
    if (reportDirectory)
      await page.screenshot({
        path: join(reportDirectory, `catalogue-${viewport.width}.png`),
      });
    if (viewport.width < 1024)
      await page.getByRole("button", { name: /Ver pedido/ }).click();
    await expect(page.getByTestId("cart-total")).toHaveText(/18[.]900/);
    if (reportDirectory)
      await page.screenshot({
        path: join(reportDirectory, `order-${viewport.width}.png`),
      });
    const lineArea = await page.getByTestId("cart-lines").boundingBox();
    const collapsedBaseline =
      process.env.POS_SURFACE_USE_FROZEN_SOURCE === "1" &&
      (lineArea?.height ?? 0) < 44;
    const beforeEdit = await page.evaluate(() => window.posProfile);
    if (!collapsedBaseline) {
      expect(lineArea?.height).toBeGreaterThanOrEqual(44);
      await page
        .getByRole("button", {
          name: "Editar opciones de Oreo Iced Latte",
          exact: true,
        })
        .click();
      await page
        .getByRole("dialog")
        .getByRole("button", { name: "Cancelar", exact: true })
        .click();
    }
    const afterEdit = await page.evaluate(() => window.posProfile);
    await expect(page.getByTestId("cart-total")).toHaveText(/18[.]900/);
    await page.setViewportSize({
      width: viewport.width === 1280 ? 390 : 1280,
      height: viewport.height,
    });
    await expect(page.getByTestId("cart-lines")).toHaveCount(1);
    await page.setViewportSize(viewport);
    expect(catalogueCalls()).toBe(before.catalogue);
    expect(configurationCalls()).toBe(before.configuration);
    await page.getByRole("button", { name: "Cobrar", exact: true }).click();
    const payment = page.getByRole("dialog");
    await payment
      .getByRole("button", { name: "Efectivo", exact: true })
      .click();
    await payment
      .getByRole("textbox", { name: "Efectivo recibido 1", exact: true })
      .fill("20000");
    if (reportDirectory)
      await page.screenshot({
        path: join(reportDirectory, `payment-${viewport.width}.png`),
      });
    await payment
      .getByRole("button", { name: /^(Volver al pedido|Cancelar)$/ })
      .click();
    await expect(page.getByTestId("cart-total")).toHaveText(/18[.]900/);
    expect(app.errors).toEqual([]);
    profiles.push({
      viewport,
      catalogueReadyMs: app.catalogueReadyMs,
      configurationReadyMs,
      calls: app.calls,
      renderProfile: await page.evaluate(() => window.posProfile),
      searchProfile: {
        commits: afterSearch.commits - beforeSearch.commits,
        actualDurationMs:
          afterSearch.actualDurationMs - beforeSearch.actualDurationMs,
      },
      editProfile: collapsedBaseline
        ? null
        : {
            commits: afterEdit.commits - beforeEdit.commits,
            actualDurationMs:
              afterEdit.actualDurationMs - beforeEdit.actualDurationMs,
          },
      lineAreaHeight: lineArea?.height,
      baselineIssues: collapsedBaseline
        ? [
            "Order lines collapse to zero height at this viewport; options cannot be edited.",
          ]
        : [],
    });
  });
test("catalogue uses one responsive grid, real quantities and cached data across filters and widths", async ({
  page,
}) => {
  test.setTimeout(90000);
  await page.setViewportSize({ width: 1280, height: 800 });
  const app = await mount(page);
  await expect
    .poll(
      () =>
        app.calls.filter((call) => call.path.includes("/configuration")).length,
    )
    .toBe(rows.length);
  const counts = () => ({
    catalogue: app.calls.filter((call) => call.path.includes("kind=products"))
      .length,
    configurations: app.calls.filter((call) =>
      call.path.includes("/configuration"),
    ).length,
  });
  const initialCalls = counts();
  expect(initialCalls).toEqual({ catalogue: 1, configurations: rows.length });
  const catalogue = page.locator("[data-pos-catalogue]");
  const grid = catalogue.locator(".pos-product-grid");
  const frames: { width: number; columns: number; gridWidth: number }[] = [];
  for (const viewport of [
    { width: 1280, height: 800, columns: 3 },
    { width: 768, height: 1024, columns: 2 },
    { width: 390, height: 844, columns: 1 },
    { width: 360, height: 740, columns: 1 },
    { width: 320, height: 720, columns: 1 },
  ]) {
    await page.setViewportSize({
      width: viewport.width,
      height: viewport.height,
    });
    await expect(grid).toHaveCount(1);
    await expect
      .poll(() =>
        grid.evaluate(
          (element) =>
            getComputedStyle(element)
              .gridTemplateColumns.split(" ")
              .filter(Boolean).length,
        ),
      )
      .toBe(viewport.columns);
    const box = await grid.boundingBox();
    expect(box!.width).toBeGreaterThan(0);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(viewport.width);
    frames.push({
      width: viewport.width,
      columns: viewport.columns,
      gridWidth: box!.width,
    });
    expect(counts()).toEqual(initialCalls);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  const first = catalogue.getByRole("button", {
    name: "Agregar Oreo Iced Latte",
    exact: true,
  });
  await first.click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Agregar al pedido", exact: true })
    .click();
  await expect(first).toHaveAttribute("data-in-order", "true");
  await expect(first.getByText("1 en pedido", { exact: true })).toBeVisible();
  await first.click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Agregar al pedido", exact: true })
    .click();
  await expect(first.getByText("2 en pedido", { exact: true })).toBeVisible();
  for (const viewport of [
    { width: 1280, height: 800 },
    { width: 768, height: 1024 },
    { width: 390, height: 844 },
  ]) {
    await page.setViewportSize(viewport);
    await expect(grid).toHaveCount(1);
    await expect(first.getByText("2 en pedido", { exact: true })).toBeVisible();
    await expect(page.getByTestId("cart-lines")).toHaveCount(1);
    await expect(page.getByTestId("cart-line")).toHaveCount(1);
    await expect(page.getByTestId("cart-total")).toHaveText(/15[.]000/);
    expect(counts()).toEqual(initialCalls);
  }
  await page.setViewportSize({ width: 1280, height: 800 });
  await page
    .getByRole("button", {
      name: "Editar opciones de Oreo Iced Latte",
      exact: true,
    })
    .click();
  await expect(
    page.getByRole("dialog").getByRole("radio", { name: /Chocolate/ }),
  ).toBeChecked();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Cancelar", exact: true })
    .click();
  await expect(first.getByText("2 en pedido", { exact: true })).toBeVisible();
  expect(counts()).toEqual(initialCalls);
  await catalogue
    .getByRole("textbox", { name: "Buscar productos", exact: true })
    .fill("taro");
  await expect(
    catalogue.getByRole("button", {
      name: "Agregar Taro Iced Latte",
      exact: true,
    }),
  ).toBeVisible();
  await expect(first).toHaveCount(0);
  await catalogue
    .getByRole("textbox", { name: "Buscar productos", exact: true })
    .fill("");
  await catalogue.getByRole("button", { name: "Shakes", exact: true }).click();
  await expect(
    catalogue.getByRole("button", { name: "Agregar Shake Oreo", exact: true }),
  ).toBeVisible();
  await expect(first).toHaveCount(0);
  await catalogue.getByRole("button", { name: "Todas", exact: true }).click();
  await expect(first.getByText("2 en pedido", { exact: true })).toBeVisible();
  expect(counts()).toEqual(initialCalls);
  expect(app.errors).toEqual([]);
  expect(
    await page
      .locator("[data-pos]")
      .evaluate((element) => getComputedStyle(element).fontFamily),
  ).toContain("Barlow");
  if (reportDirectory) {
    await mkdir(reportDirectory, { recursive: true });
    for (const viewport of [
      { width: 1280, height: 800 },
      { width: 768, height: 1024 },
      { width: 390, height: 844 },
    ]) {
      await page.setViewportSize(viewport);
      await page.screenshot({
        path: join(reportDirectory, `catalogue-${viewport.width}.png`),
      });
    }
  }
  profiles.push({
    scope: "catalogue",
    frames,
    calls: app.calls,
    renderProfile: await page.evaluate(() => window.posProfile),
  });
});
