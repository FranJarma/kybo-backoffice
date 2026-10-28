import { test, expect } from "@playwright/test";
import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import type { PurchaseOrder } from "@/modules/procurement/types";
const require = createRequire(import.meta.url);
let stylesheet = "";
test.beforeAll(async () => {
  const { build } = createRequire(require.resolve("tsx"))("esbuild");
  await build({
    entryPoints: ["tests/helpers/procurement-ui.tsx"],
    outfile: ".next-e2e/cash-purchases-ui.js",
    bundle: true,
    platform: "browser",
    jsx: "automatic",
    define: {
      "process.env.NODE_ENV": '"production"',
      "process.env": '{"NODE_ENV":"production"}',
    },
  });
  const tailwind = require("@tailwindcss/postcss"),
    postcss = createRequire(require.resolve("@tailwindcss/postcss"))("postcss");
  stylesheet = (
    await postcss([tailwind()]).process(
      await readFile("src/app/globals.css", "utf8"),
      { from: "src/app/globals.css" },
    )
  ).css;
});
for (const width of [390, 1024])
  test(`supplier advance source, balance and partial receipt preview at ${width}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    const id = "11111111-1111-4111-8111-111111111111",
      supplierId = "22222222-2222-4222-8222-222222222222",
      itemId = "33333333-3333-4333-8333-333333333333",
      lineId = "44444444-4444-4444-8444-444444444444",
      transferId = "55555555-5555-4555-8555-555555555555",
      cashId = "66666666-6666-4666-8666-666666666666";
    const day = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Argentina/Buenos_Aires",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
    const order: PurchaseOrder = {
      id,
      branchId: id,
      supplierId,
      supplierName: "Proveedor anticipado",
      state: "ordered",
      orderedOn: day,
      expectedOn: day,
      notes: "",
      revision: 1,
      actorId: "manager",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      receipts: [],
      lines: [
        {
          id: lineId,
          orderId: id,
          position: 0,
          itemId,
          itemName: "Vasos",
          baseUnit: "unit",
          presentationId: null,
          presentationName: null,
          conversionFactor: "1.000000",
          quantity: "100.000000",
          orderedQuantity: "100.000000",
          receivedQuantity: "0.000000",
          cancelledQuantity: "0.000000",
          pendingQuantity: "100.000000",
        },
      ],
      financial: {
        available: true,
        advancedAmount: "0.00",
        appliedAmount: "0.00",
        availableAmount: "0.00",
        advances: [],
      },
    };
    const sent: Record<string, unknown>[] = [];
    await page.route("**/__cash-purchases-fixture", (r) =>
      r.fulfill({
        contentType: "text/html",
        body: `<html lang="es"><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>${stylesheet}</style></head><body></body></html>`,
      }),
    );
    await page.route("**/api/catalog/**", (r) => {
      const path = new URL(r.request().url()).pathname;
      const rows = path.endsWith("/payment-methods")
        ? [
            {
              id: transferId,
              name: "Transferencia",
              kind: "transfer",
              revision: 1,
              archivedAt: null,
            },
            {
              id: cashId,
              name: "Efectivo",
              kind: "cash",
              revision: 1,
              archivedAt: null,
            },
          ]
        : path.endsWith("/items")
          ? [
              {
                id: itemId,
                name: "Vasos",
                baseUnit: "unit",
                revision: 1,
                purchasable: true,
                stockTracked: true,
                archivedAt: null,
              },
            ]
          : [];
      return r.fulfill({ json: { rows, total: rows.length } });
    });
    await page.route("**/api/branches/current", (r) =>
      r.fulfill({
        json: { locations: [{ id, name: "Depósito", code: "MAIN" }] },
      }),
    );
    await page.route("**/api/purchases**", (r) =>
      r.fulfill({ json: { rows: [], total: 0 } }),
    );
    await page.route("**/api/procurement/orders**", (r) => {
      if (r.request().method() === "POST") {
        sent.push(r.request().postDataJSON());
        order.financial = {
          available: true,
          advancedAmount: "100000.00",
          appliedAmount: "0.00",
          availableAmount: "100000.00",
          advances: [
            {
              id: cashId,
              amount: "100000.00",
              appliedAmount: "0.00",
              availableAmount: "100000.00",
              source: "external",
              paymentMethodName: "Transferencia",
              paidOn: day,
              reference: "TR-BOL-100",
              createdAt: new Date().toISOString(),
            },
          ],
        };
        return r.fulfill({
          json: { result: { id: cashId, orderId: id }, replayed: false },
        });
      }
      return r.fulfill({ json: { available: true, orders: [order] } });
    });
    await page.goto("http://127.0.0.1:3000/__cash-purchases-fixture");
    await page.addScriptTag({ path: ".next-e2e/cash-purchases-ui.js" });
    await page.getByRole("button", { name: "Pedidos", exact: true }).click();
    await page.getByRole("button", { name: "Ver pedido", exact: true }).click();
    await page
      .getByRole("button", { name: "Registrar anticipo al proveedor" })
      .click();
    await expect(page.getByLabel("Origen del dinero")).toHaveValue("external");
    await page.getByLabel("Origen del dinero").selectOption("cash");
    await page.getByRole("combobox", { name: "Medio del anticipo" }).click();
    await expect(
      page.getByRole("option", { name: "Efectivo", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("option", { name: "Transferencia", exact: true }),
    ).toHaveCount(0);
    await page.getByLabel("Origen del dinero").selectOption("external");
    await page.getByRole("combobox", { name: "Medio del anticipo" }).click();
    await page
      .getByRole("option", { name: "Transferencia", exact: true })
      .click();
    await page.getByLabel("Importe pagado (ARS)").fill("100.000");
    await page
      .getByRole("textbox", { name: "Referencia", exact: true })
      .fill("TR-BOL-100");
    await page
      .getByRole("button", { name: "Confirmar anticipo", exact: true })
      .click();
    await expect(
      page.getByText("Pagado fuera de caja · Transferencia", { exact: true }),
    ).toBeVisible();
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({
      supplierId,
      paymentMethodId: transferId,
      source: "external",
      amount: "100.000",
      reference: "TR-BOL-100",
      expectedRevision: 1,
    });
    await page
      .getByRole("button", { name: "Registrar llegada", exact: true })
      .click();
    await page.getByRole("combobox", { name: "Ubicación" }).selectOption(id);
    await page
      .getByRole("textbox", { name: "Cantidad recibida", exact: true })
      .fill("60");
    await page
      .getByRole("textbox", { name: "Precio por unidad", exact: true })
      .fill("1000");
    await page.getByRole("button", { name: "Revisar recepción" }).click();
    await expect(page.getByText(/Anticipo a aplicar:/)).toContainText("60.000");
    await expect(page.getByText(/Crédito restante:/)).toContainText("40.000");
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: `.next-e2e/cash-purchases-preview-${width}.png`,
      fullPage: true,
    });
  });
