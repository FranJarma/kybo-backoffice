import { test, expect } from "@playwright/test";
test("budgets expenses, compares profitability and revises a monthly close", async ({
  page,
}) => {
  test.setTimeout(180000);
  test.skip(process.env.E2E_MANAGED !== "1", "Disposable database required");
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/login");
  await page.getByLabel("Usuario o correo").fill(process.env.E2E_EMAIL!);
  await page.getByLabel("Contraseña").fill(process.env.E2E_PASSWORD!);
  await page.getByRole("button", { name: "Ingresar", exact: true }).click();
  await expect(page).toHaveURL(/\/(?:settings\/branches)?$/, {
    timeout: 45000,
  });
  const branchHeaders = { Origin: new URL(page.url()).origin };
  const available = await (await page.request.get("/api/branches")).json();
  const selection = await page.request.post("/api/branches/select", {
    headers: branchHeaders,
    data: { branchId: available.rows[0].id },
  });
  expect(selection.ok(), await selection.text()).toBe(true);
  await page.goto("/finance/expenses");
  await expect(
    page.getByRole("heading", { name: "Gastos del negocio" }),
  ).toBeVisible();
  await page.getByLabel("Mes de gastos").fill("2026-09");
  await expect(page.getByText("Sin gastos cargados")).toBeVisible();
  await page.getByLabel("Unidades previstas del mes").fill("4000");
  await page
    .getByLabel("Alícuota estimada de IIBB (%)", { exact: true })
    .fill("4,5");
  await page.getByRole("button", { name: "Agregar gasto" }).click();
  await page
    .getByLabel("Tipo de gasto 1", { exact: true })
    .selectOption("rent");
  await page.getByLabel("Presupuesto 1", { exact: true }).fill("2000000");
  await page.getByLabel("Real 1", { exact: true }).fill("2100000");
  await page.getByRole("button", { name: "Guardar mes", exact: true }).click();
  await expect(page.getByText("Mes guardado.", { exact: true })).toBeVisible();
  await expect(page.getByTestId("budget-rate")).toHaveText(/500,00/);
  await page.getByRole("button", { name: "Cerrar mes", exact: true }).click();
  await page
    .getByLabel("Confirmo que registré todos los gastos reales")
    .check();
  await page
    .getByRole("button", { name: "Confirmar cierre", exact: true })
    .click();
  await expect(
    page.getByText("Cierre mensual registrado.", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Revisar cierre", exact: true })
    .click();
  await page.getByLabel("Real 1", { exact: true }).fill("2200000");
  await page
    .getByLabel("Motivo de la revisión")
    .fill("Llegó factura corregida");
  await page
    .getByLabel("Confirmo que registré todos los gastos reales")
    .check();
  await page
    .getByRole("button", { name: "Guardar revisión del cierre", exact: true })
    .click();
  await expect(
    page.getByText("Revisión del cierre registrada.", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Llegó factura corregida", { exact: true }),
  ).toBeVisible();
  const savedMonth = await (
    await page.request.get("/api/finance/expenses?month=2026-09")
  ).json();
  expect(savedMonth.period).toMatchObject({
    expectedUnits: 4000,
    status: "closed",
    revision: 3,
  });
  const headers = { Origin: new URL(page.url()).origin };
  const setup = await (await page.request.get("/api/products/setup")).json();
  const method = await page.request.post("/api/catalog/payment-methods", {
    headers,
    data: { name: "Tarjeta gastos", kind: "card", commissionPercent: "3" },
  });
  expect(method.ok(), await method.text()).toBe(true);
  const response = await page.request.post("/api/catalog/products", {
    headers,
    data: {
      name: "Gaseosa con gastos",
      vatRate: "21",
      priceCounter: "10000",
      pricePedidosYa: "",
      priceUberEats: "",
      setup: {
        mode: "direct",
        branchId: setup.branch.id,
        dispatchLocationId: setup.locations[0].id,
        quantity: "1",
        source: {
          newItem: {
            name: "Gaseosa con gastos",
            class: "beverage",
            unitCost: "1200",
          },
        },
      },
    },
  });
  expect(response.ok(), await response.text()).toBe(true);
  const { row } = await response.json();
  const report = await page.request.post("/api/products/costs", {
    headers,
    data: { ids: [row.id], profitability: true, month: "2026-09" },
  });
  expect((await report.json()).profitability[0].overhead).toMatchObject({
    month: "2026-09",
    budgetTotal: "2000000.00",
    expectedUnits: 4000,
  });
  await page.goto("/products");
  await page
    .getByRole("row")
    .filter({ hasText: "Gaseosa con gastos" })
    .getByRole("button", { name: "Editar" })
    .click();
  await page.getByRole("tab", { name: "Costeo", exact: true }).click();
  await page.getByLabel("Mes del presupuesto").fill("2026-09");
  await expect(page.getByTestId("assigned-overhead")).toHaveText(/500,00/);
  await expect(
    page.getByRole("region", { name: "Impuestos", exact: true }),
  ).toBeVisible();
  await expect(page.getByTestId("costing-vat")).toHaveText(/1.735,54/);
  await expect(page.getByTestId("costing-iibb")).toHaveText(/371,90/);
  const paymentMethod = (await method.json()).row;
  await page
    .getByRole("combobox", { name: "Medio de pago", exact: true })
    .selectOption(paymentMethod.id);
  await expect(page.getByTestId("costing-margin")).toContainText("5.892,56");
  await page.getByText(/Comparar medios de pago/).click();
  await expect(
    page.getByRole("row").filter({ hasText: "Tarjeta gastos" }),
  ).toContainText("5.892,56");
  await page.getByText(/Comparar medios de pago/).click();
  const summaryBounds = await page.getByTestId("costing-margin").boundingBox();
  expect(summaryBounds!.y + summaryBounds!.height).toBeLessThan(800);
  await page.screenshot({
    path: "docs/previews/business-overheads-cost.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  const costPanel = page.getByRole("region", {
    name: "Rentabilidad por medio de pago",
    exact: true,
  });
  const mobileDialog = page.getByRole("dialog");
  // The shared dialog animates its size when the viewport changes.
  await expect
    .poll(async () => {
      const bounds = await mobileDialog.boundingBox();
      return !!bounds && bounds.x >= 0 && bounds.x + bounds.width <= 390;
    })
    .toBe(true);
  const geometry = await mobileDialog.evaluate((node) => ({
    left: node.getBoundingClientRect().left,
    width: node.getBoundingClientRect().width,
    viewport: window.innerWidth,
    scrollWidth: node.scrollWidth,
    clientWidth: node.clientWidth,
    cssWidth: getComputedStyle(node).width,
  }));
  expect(geometry.left, JSON.stringify(geometry)).toBeGreaterThanOrEqual(0);
  expect(geometry.width, JSON.stringify(geometry)).toBeLessThanOrEqual(390);
  expect(geometry.scrollWidth, JSON.stringify(geometry)).toBeLessThanOrEqual(
    geometry.clientWidth + 1,
  );
  expect(
    await costPanel.evaluate(
      (node) => node.scrollWidth <= node.clientWidth + 1,
    ),
  ).toBe(true);
  await page.screenshot({ path: "docs/previews/product-costing-mobile.png" });
  await costPanel
    .getByText("Gastos fijos y generales", { exact: true })
    .last()
    .click();
  await expect(
    costPanel.getByRole("cell", { name: /2.000.000,00/ }),
  ).toBeVisible();
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/finance/expenses");
  await page.getByLabel("Mes de gastos").fill("2026-09");
  await expect(
    page.getByText("Llegó factura corregida", { exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: "docs/previews/business-overheads-desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: "docs/previews/business-overheads-mobile.png",
    fullPage: true,
  });
});
