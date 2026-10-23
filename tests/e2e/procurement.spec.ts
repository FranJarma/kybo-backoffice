import { test, expect } from "@playwright/test";
import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
const require = createRequire(import.meta.url);
let stylesheet = "";
test.beforeAll(async () => {
  const { build } = createRequire(require.resolve("tsx"))("esbuild");
  await build({
    entryPoints: ["tests/helpers/procurement-ui.tsx"],
    outfile: ".next-e2e/procurement-ui.js",
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
for (const width of [600, 768, 1024])
  test(`order, ETA and partial receipt at ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1024 });
    const id = "11111111-1111-4111-8111-111111111111",
      supplierId = "22222222-2222-4222-8222-222222222222",
      itemId = "33333333-3333-4333-8333-333333333333",
      lineId = "44444444-4444-4444-8444-444444444444",
      locationId = "55555555-5555-4555-8555-555555555555";
    const day = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Argentina/Buenos_Aires",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
    const nextDate = new Date(`${day}T12:00:00Z`);
    nextDate.setUTCDate(nextDate.getUTCDate() + 7);
    const eta = nextDate.toISOString().slice(0, 10);
    const catalog = (id: string, name: string, extra = {}) => ({
      id,
      name,
      revision: 1,
      archivedAt: null,
      ...extra,
    });
    const order = {
      id,
      branchId: id,
      supplierId,
      supplierName: "Proveedor de Bolivia",
      state: "draft",
      orderedOn: day,
      expectedOn: eta,
      notes: "",
      revision: 1,
      actorId: "manager",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      lines: [
        {
          id: lineId,
          orderId: id,
          position: 0,
          itemId,
          itemName: "Vasos descartables",
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
      receipts: [] as {
        id: string;
        receivedOn: string;
        documentNumber: null;
      }[],
    };
    const sent: Record<string, unknown>[] = [];
    let receipt: Record<string, unknown> | null = null;
    await page.route("**/__procurement-fixture", (r) =>
      r.fulfill({
        contentType: "text/html",
        body: `<html lang="es"><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>${stylesheet}</style></head><body></body></html>`,
      }),
    );
    await page.route("**/api/catalog/**", (r) => {
      const path = new URL(r.request().url()).pathname;
      const rows = path.endsWith("/suppliers")
        ? [catalog(supplierId, "Proveedor de Bolivia")]
        : path.endsWith("/items")
          ? [
              catalog(itemId, "Vasos descartables", {
                baseUnit: "unit",
                purchasable: true,
                stockTracked: true,
              }),
            ]
          : [];
      return r.fulfill({ json: { rows, total: rows.length } });
    });
    await page.route("**/api/branches/current", (r) =>
      r.fulfill({
        json: {
          locations: [
            { id: locationId, name: "Depósito principal", code: "DEPOSITO" },
          ],
        },
      }),
    );
    await page.route("**/api/procurement/orders**", (r) => {
      if (r.request().method() === "POST") {
        const body = r.request().postDataJSON();
        sent.push(body);
        if (body.action === "confirm") {
          order.state = "ordered";
          order.revision = 2;
        }
        if (body.action === "reschedule") {
          order.expectedOn = body.expectedOn;
          order.revision++;
        }
        return r.fulfill({ json: { result: order } });
      }
      return r.fulfill({ json: { available: true, orders: [order] } });
    });
    await page.route("**/api/purchases**", (r) => {
      if (r.request().method() === "POST") {
        const body = r.request().postDataJSON();
        sent.push(body);
        order.state = "partially_received";
        order.revision = 3;
        order.lines[0].receivedQuantity = "40.000000";
        order.lines[0].pendingQuantity = "60.000000";
        order.receipts = [{ id, receivedOn: day, documentNumber: null }];
        receipt = {
          id,
          supplierId,
          supplierName: order.supplierName,
          receivedOn: day,
          createdAt: new Date().toISOString(),
          documentNumber: null,
          notes: null,
          totalAmount: null,
          merchandiseAmount: null,
          landedAmount: null,
          outstandingAmount: null,
          paidAmount: "0.00",
          balanceDue: null,
          shippingAmount: "0.00",
          shippingSupplierId: null,
          shippingSupplierName: null,
          shippingAllocation: "value",
          shippingPaidAmount: "0.00",
          shippingBalanceDue: "0.00",
          lineCount: 1,
          payments: [],
          lines: [
            {
              id,
              receiptId: id,
              itemId,
              itemName: "Vasos descartables",
              baseUnit: "unit",
              presentationId: null,
              presentationName: null,
              conversionFactor: "1.000000",
              quantity: "40.000000",
              baseQuantity: "40.000000",
              unitPrice: null,
              discount: "0.00",
              lineTotal: null,
              shippingAmount: "0.00",
              landedTotal: null,
              lotId: id,
              lotCode: null,
              expiresOn: null,
            },
          ],
        };
        return r.fulfill({ json: { receipt } });
      }
      return r.fulfill({
        json: { rows: receipt ? [receipt] : [], total: receipt ? 1 : 0 },
      });
    });
    await page.goto("http://127.0.0.1:3000/__procurement-fixture");
    await page.addScriptTag({ path: ".next-e2e/procurement-ui.js" });
    await page.getByRole("button", { name: "Ver pedido", exact: true }).click();
    await expect(page.getByText("100 unid.").last()).toBeVisible();
    await page
      .getByRole("button", { name: "Confirmar pedido realizado" })
      .click();
    await expect(
      page.getByText("Pedido en camino", { exact: true }),
    ).toBeVisible();
    expect(sent[0]).toMatchObject({ action: "confirm", expectedRevision: 1 });
    await page
      .getByRole("button", { name: "Registrar llegada", exact: true })
      .click();
    await expect(page.getByRole("combobox", { name: "Ubicación" })).toHaveValue(
      locationId,
    );
    await page
      .getByRole("textbox", { name: "Cantidad recibida", exact: true })
      .fill("40");
    await page.getByRole("button", { name: "Revisar recepción" }).click();
    await page.getByRole("button", { name: "Confirmar recepción" }).click();
    await page
      .getByRole("button", { name: "Volver al pedido", exact: true })
      .click();
    await expect(
      page.getByText("Recibido parcialmente", { exact: true }),
    ).toBeVisible();
    await expect(page.getByText("60 unid.", { exact: true })).toBeVisible();
    expect(sent[1]).toMatchObject({
      purchaseOrderId: id,
      expectedOrderRevision: 2,
      lines: [expect.objectContaining({ orderLineId: lineId, quantity: "40" })],
    });
    await page
      .getByRole("button", { name: "Actualizar fecha", exact: true })
      .click();
    await page
      .getByLabel("Motivo del cambio")
      .fill("Fecha acordada por recepción parcial");
    await page
      .getByRole("button", { name: "Guardar fecha", exact: true })
      .click();
    expect(sent[2]).toMatchObject({
      action: "reschedule",
      expectedRevision: 3,
      expectedOn: eta,
    });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: `.next-e2e/procurement-partial-${width}.png`,
      fullPage: true,
    });
    await page
      .getByRole("button", { name: "Volver a pedidos", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Nuevo pedido", exact: true })
      .click();
    await page
      .getByRole("combobox", { name: "Proveedor", exact: true })
      .click();
    await page
      .getByRole("option", { name: "Proveedor de Bolivia", exact: true })
      .click();
    await page.getByRole("combobox", { name: "Insumo", exact: true }).click();
    await page
      .getByRole("option", { name: "Vasos descartables", exact: true })
      .click();
    await page.getByLabel(/Cantidad a pedir/).fill("100");
    await page.getByLabel(/Llegada estimada/).fill(eta);
    await page.screenshot({
      path: `.next-e2e/procurement-new-${width}.png`,
      fullPage: true,
    });
    await page
      .getByRole("button", { name: "Guardar borrador", exact: true })
      .click();
    expect(sent[3]).toMatchObject({
      supplierId,
      expectedOn: eta,
      lines: [{ itemId, presentationId: null, quantity: "100" }],
    });
  });
