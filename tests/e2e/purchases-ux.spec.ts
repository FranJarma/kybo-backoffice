import { test, expect, type Page } from "@playwright/test";
import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
const require = createRequire(import.meta.url);
let css = "";
const supplierId = "22222222-2222-4222-8222-222222222222";
const itemId = "33333333-3333-4333-8333-333333333333";
const locationId = "44444444-4444-4444-8444-444444444444";
const orderId = "55555555-5555-4555-8555-555555555555";
const timeZone = "America/Argentina/Buenos_Aires";
const day = new Intl.DateTimeFormat("en-CA", {
  timeZone,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
}).format(new Date());
test.beforeAll(async () => {
  const { build } = createRequire(require.resolve("tsx"))("esbuild");
  await build({
    entryPoints: ["tests/helpers/procurement-ui.tsx"],
    outfile: ".next-e2e/purchases-ux.js",
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
  options: { failNeeds?: boolean; manyLines?: boolean; needs?: boolean } = {},
) {
  const control = {
    failNeeds: !!options.failNeeds,
    posts: [] as unknown[],
    advances: 0,
    releaseAdvance: () => {},
  };
  const advanceGate = Promise.withResolvers<void>();
  control.releaseAdvance = advanceGate.resolve;
  const catalog = (id: string, name: string, extra = {}) => ({
    id,
    name,
    revision: 1,
    archivedAt: null,
    ...extra,
  });
  const item = catalog(itemId, "Vasos descartables de 500 ml con tapa", {
    baseUnit: "unit",
    purchasable: true,
    stockTracked: true,
  });
  const order = {
    id: orderId,
    branchId: orderId,
    supplierId,
    supplierName: "Distribuidora de insumos",
    state: "ordered",
    orderedOn: day,
    expectedOn: day,
    notes: "",
    revision: 1,
    actorId: "manager",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    receipts: [],
    lines: Array.from({ length: options.manyLines ? 8 : 1 }, (_, index) => ({
      id: `${itemId.slice(0, -2)}${String(index).padStart(2, "0")}`,
      orderId,
      position: index,
      itemId,
      itemName: index ? `Insumo de reposición ${index + 1}` : item.name,
      baseUnit: "unit",
      presentationId: null,
      presentationName: null,
      conversionFactor: "1.000000",
      quantity: "100.000000",
      orderedQuantity: "100.000000",
      receivedQuantity: "0.000000",
      cancelledQuantity: "0.000000",
      pendingQuantity: "100.000000",
    })),
    financial: {
      available: true,
      advancedAmount: "0.00",
      appliedAmount: "0.00",
      availableAmount: "0.00",
      advances: [],
    },
  };
  await page.route("**/__purchases-ux", (r) =>
    r.fulfill({
      contentType: "text/html",
      body: `<html lang="es"><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style></head><body></body></html>`,
    }),
  );
  await page.route("**/api/**", async (r) => {
    const path = new URL(r.request().url()).pathname;
    if (r.request().method() === "POST") {
      control.posts.push(r.request().postDataJSON());
      if (path.endsWith("/advances")) {
        control.advances++;
        await advanceGate.promise;
      }
      return r.fulfill({
        status: 409,
        json: { error: "Revisá el estado antes de volver a intentar." },
      });
    }
    if (path.endsWith("/supply-alerts"))
      return r.fulfill(
        control.failNeeds
          ? {
              status: 503,
              json: { error: "No pudimos consultar las necesidades." },
            }
          : {
              json: {
                available: true,
                asOf: new Date().toISOString(),
                items: [item],
                policies: [],
                alerts: options.needs
                  ? [
                      {
                        id: itemId,
                        revision: 1,
                        itemId,
                        itemName: item.name,
                        baseUnit: "unit",
                        dailyConsumption: "150.000000",
                        leadDays: 7,
                        safetyDays: 3,
                        targetDays: 17,
                        enabled: true,
                        incomingQuantity: "0.000000",
                        unconfirmedIncomingQuantity: "0.000000",
                        projectedCoverageDays: "10.000000",
                        projectedCoverageAtLeast: false,
                        availableQuantity: "1500.000000",
                        suggestedQuantity: "1050.000000",
                        coverageDays: "10.000000",
                        coverageAtLeast: false,
                        riskOn: day,
                        orderBy: day,
                        urgency: "high",
                        status: "action",
                      },
                    ]
                  : [],
              },
            },
      );
    if (path === "/api/procurement/orders")
      return r.fulfill({ json: { available: true, orders: [order] } });
    if (path === "/api/purchases")
      return r.fulfill({ json: { rows: [], total: 0 } });
    if (path === "/api/branches/current")
      return r.fulfill({
        json: {
          locations: [
            { id: locationId, name: "Depósito principal", code: "DEPOSITO" },
          ],
        },
      });
    if (path.startsWith("/api/catalog/")) {
      const rows = path.endsWith("/suppliers")
        ? [catalog(supplierId, order.supplierName)]
        : path.endsWith("/items")
          ? [item]
          : path.endsWith("/payment-methods")
            ? [catalog(itemId, "Transferencia", { kind: "transfer" })]
            : [];
      return r.fulfill({ json: { rows, total: rows.length } });
    }
    return r.fulfill({ json: {} });
  });
  await page.goto("/__purchases-ux");
  await page.addScriptTag({ path: ".next-e2e/purchases-ux.js" });
  return control;
}
for (const width of [390, 1440])
  test(`purchase needs allow batch selection at ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    const control = await mount(page, { needs: true });
    await page
      .getByRole("checkbox", { name: "Seleccionar todos", exact: true })
      .check();
    await expect(
      page.getByRole("checkbox", {
        name: "Seleccionar Vasos descartables de 500 ml con tapa",
        exact: true,
      }),
    ).toBeChecked();
    await expect(
      page.getByText("1 insumo seleccionado", { exact: true }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    expect(control.posts).toHaveLength(0);
    await page.screenshot({
      path: `.next-e2e/purchases-needs-${width}.png`,
      fullPage: true,
    });
  });
test("failed needs never look like healthy stock, and refresh recovers", async ({
  page,
}) => {
  const control = await mount(page, { failNeeds: true });
  await expect(
    page.getByText("No pudimos consultar las necesidades.", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("No hay insumos para comprar en esta vista", {
      exact: true,
    }),
  ).toHaveCount(0);
  await expect(
    page.getByText("Revisá las próximas compras", { exact: true }),
  ).toHaveCount(0);
  control.failNeeds = false;
  await page.getByRole("button", { name: "Actualizar", exact: true }).click();
  await expect(
    page.getByText("No hay insumos para comprar en esta vista", {
      exact: true,
    }),
  ).toBeVisible();
  expect(control.posts).toHaveLength(0);
});
test("receipt draft and supplier survive workspace tab changes without saving", async ({
  page,
}) => {
  const control = await mount(page);
  await page.getByRole("tab", { name: "Recepciones", exact: true }).click();
  await page
    .getByRole("button", { name: "Nueva recepción", exact: true })
    .click();
  await page
    .getByRole("textbox", { name: "Comprobante externo", exact: true })
    .fill("REM-123");
  await page
    .getByRole("textbox", { name: "Notas", exact: true })
    .fill("Llegaron dos cajas");
  await page.getByRole("tab", { name: "Pedidos", exact: true }).click();
  await page.getByRole("tab", { name: "Recepciones", exact: true }).click();
  await expect(
    page.getByRole("textbox", { name: "Comprobante externo", exact: true }),
  ).toHaveValue("REM-123");
  await expect(
    page.getByRole("textbox", { name: "Notas", exact: true }),
  ).toHaveValue("Llegaron dos cajas");
  expect(control.posts).toHaveLength(0);
});
test("order search filters suppliers and detail keeps the next action before a long list", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1024, height: 900 });
  await mount(page, { manyLines: true });
  await page.getByRole("tab", { name: "Pedidos", exact: true }).click();
  await page
    .getByRole("searchbox", { name: "Buscar pedido", exact: true })
    .fill("no coincide");
  await expect(
    page.getByRole("button", { name: "Ver pedido", exact: true }),
  ).toHaveCount(0);
  await page
    .getByRole("searchbox", { name: "Buscar pedido", exact: true })
    .fill("distribuidora");
  await page.getByRole("button", { name: "Ver pedido", exact: true }).click();
  const panel = page.getByRole("dialog");
  expect((await panel.boundingBox())!.width).toBeGreaterThan(700);
  await expect(
    panel.getByRole("button", { name: "Registrar llegada", exact: true }),
  ).toBeInViewport();
});
test("pending advance protects its parent panel and workspace", async ({
  page,
}) => {
  const control = await mount(page);
  await page.getByRole("tab", { name: "Pedidos", exact: true }).click();
  await page.getByRole("button", { name: "Ver pedido", exact: true }).click();
  await page
    .getByRole("button", {
      name: "Registrar anticipo al proveedor",
      exact: true,
    })
    .click();
  await page
    .getByRole("combobox", { name: "Medio del anticipo", exact: true })
    .click();
  await page
    .getByRole("option", { name: "Transferencia", exact: true })
    .click();
  await page
    .getByRole("textbox", { name: "Importe pagado (ARS)", exact: true })
    .fill("1000");
  await page
    .getByRole("button", { name: "Confirmar anticipo", exact: true })
    .click();
  await expect.poll(() => control.advances).toBe(1);
  try {
    await expect(
      page.getByRole("button", { name: "Cerrar detalle", exact: true }),
    ).toBeDisabled();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toBeVisible();
  } finally {
    control.releaseAdvance();
  }
});
for (const width of [390, 768, 1440])
  test(`receipt review cost and actions remain clear at ${width}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    const control = await mount(page, { manyLines: true });
    await page.getByRole("tab", { name: "Pedidos", exact: true }).click();
    await page
      .getByRole("button", { name: "Registrar llegada", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "Revisar recepción", exact: true }),
    ).toBeInViewport();
    await page.screenshot({
      path: `.next-e2e/purchases-draft-${width}.png`,
      fullPage: false,
    });
    for (const input of await page
      .getByRole("textbox", { name: "Precio por unidad", exact: true })
      .all())
      await input.fill("100");
    await page
      .getByRole("button", { name: "Revisar recepción", exact: true })
      .click();
    const cost = page.getByRole("region", {
      name: "Costo de esta recepción",
      exact: true,
    });
    await expect(cost).toBeInViewport();
    await expect(cost.getByText(/^\$\s*80\.000,00$/)).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Confirmar recepción", exact: true }),
    ).toBeInViewport();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    expect(control.posts).toHaveLength(0);
    await page.screenshot({
      path: `.next-e2e/purchases-review-${width}.png`,
      fullPage: false,
    });
  });
