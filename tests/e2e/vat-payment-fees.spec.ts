import { test, expect, type Locator } from "@playwright/test";
import { randomUUID } from "node:crypto";
test.use({ hasTouch: true });

async function expectReadablePrices(product: Locator) {
  for (const channel of ["Mostrador:", "Pedidos Ya:", "Uber Eats:"]) {
    const gap = await product
      .getByText(channel, { exact: true })
      .evaluate((label) => {
        const value = label.nextElementSibling!;
        return (
          value.getBoundingClientRect().left -
          label.getBoundingClientRect().right
        );
      });
    expect(
      gap,
      `${channel} must not overlap its amount`,
    ).toBeGreaterThanOrEqual(8);
  }
}
test("configures VAT and fees, charges final prices and preserves the historical snapshots", async ({
  page,
  playwright,
}) => {
  test.setTimeout(180000);
  test.skip(process.env.E2E_MANAGED !== "1", "Disposable database required");
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/login");
  await page.getByLabel("Usuario o correo").fill(process.env.E2E_EMAIL!);
  await page.getByLabel("Contraseña").fill(process.env.E2E_PASSWORD!);
  await page.getByRole("button", { name: "Ingresar", exact: true }).tap();
  await expect(page).toHaveURL(/\/(?:settings\/branches)?$/, {
    timeout: 45000,
  });
  const headers = { Origin: new URL(page.url()).origin };
  const post = async (url: string, data: unknown) => {
    const r = await page.request.post(url, { headers, data });
    expect(r.ok(), await r.text()).toBe(true);
    return r.json();
  };
  const branches = await (await page.request.get("/api/branches")).json();
  const branchId = branches.rows[0].id;
  await post("/api/branches/select", { branchId });
  const setup = await (await page.request.get("/api/products/setup")).json();
  const locationId = setup.locations[0].id;
  const name = `Producto IVA ${Date.now()}`;
  const p = (
    await post("/api/catalog/products", {
      name,
      vatRate: "21",
      priceCounter: "10000",
      pricePedidosYa: "12000",
      priceUberEats: "",
      setup: {
        mode: "direct",
        branchId,
        dispatchLocationId: locationId,
        quantity: "1",
        source: { newItem: { name, class: "beverage", unitCost: "1200" } },
      },
    })
  ).row;
  const physical = await (
    await page.request.get(`/api/products/${p.id}/fulfillment`)
  ).json();
  await post("/api/inventory/adjustments", {
    requestId: randomUUID(),
    kind: "opening",
    itemId: physical.itemId,
    locationId,
    quantity: "10",
    unitCost: "1200",
    receivedOn: new Date().toISOString().slice(0, 10),
  });
  const methodName = `Tarjeta IVA ${Date.now()}`;
  const method = (
    await post("/api/catalog/payment-methods", {
      name: methodName,
      kind: "card",
      commissionPercent: "0",
    })
  ).row;
  await page.goto("/products");
  const row = page.getByRole("row").filter({ hasText: name });
  await expect(
    page.getByRole("columnheader", { name: "Precios", exact: true }),
  ).toBeVisible();
  await expect(row.getByText("Sin IVA", { exact: true })).toHaveCount(0);
  await expect(row.getByText("Con IVA", { exact: true })).toHaveCount(0);
  await expect(
    page.getByRole("columnheader", { name: "PedidosYa", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("columnheader", { name: "Uber Eats", exact: true }),
  ).toHaveCount(0);
  await expect(row).toContainText("10.000,00");
  await expect(row).toContainText("12.000,00");
  await expect(row.getByText("Mostrador:", { exact: true })).toBeVisible();
  await expect(row.getByText("Pedidos Ya:", { exact: true })).toBeVisible();
  await expect(row.getByText("Uber Eats:", { exact: true })).toBeVisible();
  await expect(row).not.toContainText("8.264,46");
  await expectReadablePrices(row);
  await row.scrollIntoViewIfNeeded();
  await page.screenshot({
    path: "docs/previews/product-prices-vat-desktop.png",
  });
  await page.setViewportSize({ width: 390, height: 844 });
  const mobileProduct = page
    .locator("article[data-catalog-row]")
    .filter({ hasText: name });
  await expect(mobileProduct.getByText("Sin IVA", { exact: true })).toHaveCount(
    0,
  );
  await expect(mobileProduct.getByText("Con IVA", { exact: true })).toHaveCount(
    0,
  );
  await expect(mobileProduct).toContainText("10.000,00");
  await expect(mobileProduct).toContainText("12.000,00");
  await expect(
    mobileProduct.getByText("Sin precio", { exact: true }),
  ).toBeVisible();
  await expect(mobileProduct).not.toContainText("8.264,46");
  await expectReadablePrices(mobileProduct);
  await mobileProduct.scrollIntoViewIfNeeded();
  await page.screenshot({
    path: "docs/previews/product-prices-vat-mobile.png",
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await row.getByRole("button", { name: "Editar", exact: true }).tap();
  let dialog = page.getByRole("dialog");
  await expect(
    dialog.getByLabel("IVA del producto", { exact: true }),
  ).toHaveValue("21");
  await expect(dialog.getByLabel(/Precio final mostrador/)).toHaveValue(
    "10000",
  );
  await dialog
    .getByLabel("IVA del producto", { exact: true })
    .selectOption("10,5");
  await expect(dialog).toContainText("10.000,00");
  await dialog
    .getByText("Precio final al cliente · Mostrador", { exact: true })
    .scrollIntoViewIfNeeded();
  await page.screenshot({ path: "docs/previews/product-vat.png" });
  await dialog.getByRole("button", { name: "Guardar", exact: true }).tap();
  await expect(dialog).toBeHidden();
  await expect(row).toContainText("10.000,00");
  await page.goto("/settings/payment-methods");
  await page
    .getByRole("row")
    .filter({ hasText: methodName })
    .getByRole("button", { name: "Editar", exact: true })
    .tap();
  dialog = page.getByRole("dialog");
  await dialog.getByLabel("Comisión total (%)", { exact: true }).fill("3");
  await dialog.getByRole("button", { name: "Guardar", exact: true }).tap();
  await expect(dialog).toBeHidden();
  let profitabilityRequests = 0;
  page.on("request", (request) => {
    if (
      request.url().endsWith("/api/products/costs") &&
      request.method() === "POST" &&
      request.postDataJSON()?.profitability
    )
      profitabilityRequests++;
  });
  await page.goto("/products");
  await page
    .getByRole("row")
    .filter({ hasText: name })
    .getByRole("button", { name: "Editar", exact: true })
    .tap();
  dialog = page.getByRole("dialog");
  await dialog.getByRole("tab", { name: "Costeo", exact: true }).tap();
  const profitability = dialog.getByRole("region", {
    name: "Rentabilidad por medio de pago",
    exact: true,
  });
  // Other finance flows may have budgeted the current month in this shared fixture.
  await profitability.getByLabel("Mes del presupuesto").fill("2099-01");
  await profitability
    .getByRole("combobox", { name: "Medio de pago", exact: true })
    .selectOption(method.id);
  await expect(profitability.getByTestId("costing-price")).toContainText(
    "10.000,00",
  );
  await expect(profitability.getByTestId("costing-direct")).toContainText(
    "1.200,00",
  );
  await expect(profitability.getByTestId("costing-vat")).toContainText(
    "950,23",
  );
  await expect(profitability.getByTestId("costing-commission")).toContainText(
    "300,00",
  );
  await expect(profitability).toContainText("7.549,77");
  await expect(profitability.getByTestId("costing-margin")).toHaveText(
    "Pendiente",
  );
  await profitability.screenshot({
    path: "docs/previews/product-profitability.png",
  });
  await profitability
    .getByRole("combobox", { name: "Canal de venta", exact: true })
    .selectOption("ubereats", { timeout: 15000 });
  await expect(profitability.getByTestId("costing-price")).toHaveText(
    "Pendiente",
  );
  await profitability
    .getByRole("combobox", { name: "Canal de venta", exact: true })
    .selectOption("counter", { timeout: 15000 });
  await dialog.getByRole("tab", { name: "Producto", exact: true }).tap();
  await dialog.getByRole("tab", { name: "Costeo", exact: true }).tap();
  await expect(
    profitability.getByRole("combobox", { name: "Medio de pago", exact: true }),
  ).toHaveValue(method.id);
  await profitability
    .getByRole("combobox", { name: "Medio de pago", exact: true })
    .selectOption(method.id);
  await expect(profitability).toContainText("7.549,77");
  await profitability.getByText(/Comparar medios de pago/).tap();
  const methodEstimate = profitability
    .getByRole("row")
    .filter({ hasText: methodName });
  await expect(methodEstimate).toContainText("300,00");
  await profitability.getByText(/Comparar medios de pago/).tap();
  expect(profitabilityRequests).toBe(2); // Initial snapshot and the explicit month change.
  const anonymous = await playwright.request.newContext();
  const forbidden = await anonymous.post(
    `${new URL(page.url()).origin}/api/products/costs`,
    { headers, data: { ids: [p.id], profitability: true } },
  );
  expect(forbidden.status()).toBe(401);
  await anonymous.dispose();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await page.goto("/sales");
  const add = page.getByRole("button", {
    name: `Agregar ${name}`,
    exact: true,
  });
  await expect(add).toContainText("10.000,00");
  await add.tap();
  await expect(page.getByTestId("cart-total")).toHaveText(/10\.000,00/);
  await page.getByRole("button", { name: "Cobrar", exact: true }).tap();
  dialog = page.getByRole("dialog");
  await expect(dialog.getByText(/Comisión/i)).toHaveCount(0);
  await dialog.getByRole("button", { name: methodName, exact: true }).tap();
  const response = page.waitForResponse(
    (r) => r.url().endsWith("/api/sales") && r.request().method() === "POST",
  );
  await dialog
    .getByRole("button", { name: "Confirmar cobro", exact: true })
    .tap();
  const saved = await response;
  expect(saved.ok(), await saved.text()).toBe(true);
  const sale = await saved.json();
  expect(sale.totalAmount).toBe("10000.00");
  expect(sale.paidAmount).toBe("10000.00");
  expect(sale.orders[0].lines[0]).toMatchObject({
    vatRate: "10.50",
    netTotal: "9049.77",
    vatTotal: "950.23",
  });
  expect(sale.payments[0]).toMatchObject({
    commissionPercent: "3.00",
    commissionAmount: "300.00",
    settlementNet: "9700.00",
  });
  await page
    .getByRole("button", { name: `Última venta #${sale.number}`, exact: true })
    .tap();
  await expect(page.getByText(/Comisión 3%:/)).toBeVisible();
  const current = (
    await (await page.request.get("/api/catalog/payment-methods")).json()
  ).rows.find((m: { id: string }) => m.id === method.id);
  const update = await page.request.patch(
    `/api/catalog/payment-methods/${method.id}`,
    {
      headers,
      data: {
        revision: current.revision,
        name: methodName,
        kind: "card",
        commissionPercent: "8",
      },
    },
  );
  expect(update.ok(), await update.text()).toBe(true);
  const old = await (await page.request.get(`/api/sales/${sale.id}`)).json();
  expect(old.payments[0].commissionPercent).toBe("3.00");
  expect(old.orders[0].lines[0].vatRate).toBe("10.50");
});
