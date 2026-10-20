import { expect, test } from "@playwright/test";

test("simulates the financial break-even locally, preserves expense drafts and refreshes only explicitly", async ({
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
  const headers = { Origin: new URL(page.url()).origin };
  const branches = await (await page.request.get("/api/branches")).json();
  expect(
    (
      await page.request.post("/api/branches/select", {
        headers,
        data: { branchId: branches.rows[0].id },
      })
    ).ok(),
  ).toBe(true);
  const setup = await (await page.request.get("/api/products/setup")).json();
  const created = await page.request.post("/api/catalog/products", {
    headers,
    data: {
      name: "Bebida para equilibrio",
      vatRate: "21",
      priceCounter: "121",
      pricePedidosYa: "",
      priceUberEats: "",
      setup: {
        mode: "direct",
        branchId: setup.branch.id,
        dispatchLocationId: setup.locations[0].id,
        quantity: "1",
        source: {
          newItem: {
            name: "Bebida equilibrio",
            class: "beverage",
            unitCost: "40",
          },
        },
      },
    },
  });
  expect(created.ok(), await created.text()).toBe(true);
  const { row } = await created.json();
  const cash = await page.request.post("/api/catalog/payment-methods", {
    headers,
    data: { name: "Efectivo equilibrio", kind: "cash", commissionPercent: "0" },
  });
  expect(cash.ok()).toBe(true);
  const method = (await cash.json()).row;
  const saved = await page.request.post("/api/finance/expenses", {
    headers,
    data: {
      requestId: crypto.randomUUID(),
      command: {
        action: "save",
        month: "2026-10",
        revision: 0,
        expectedUnits: 500,
        iibbRate: "2",
        entries: [
          {
            category: "rent",
            concept: "",
            budget: "10000",
            actual: "",
            notes: "",
          },
        ],
      },
    },
  });
  expect(saved.ok(), await saved.text()).toBe(true);
  let reads = 0;
  page.on("request", (request) => {
    if (request.url().includes("/api/finance/break-even")) reads++;
  });
  await page.goto("/finance/expenses?month=2026-10");
  await expect(
    page.getByRole("button", { name: "Agregar gasto" }),
  ).toBeEnabled();
  expect(reads).toBe(0);
  await page.getByLabel("Presupuesto 1", { exact: true }).fill("12000");
  await page
    .getByRole("tab", { name: "Punto de equilibrio", exact: true })
    .click();
  const panel = page.getByRole("tabpanel", {
    name: "Punto de equilibrio",
    exact: true,
  });
  await expect(
    panel.getByText("Definí la mezcla", { exact: true }),
  ).toBeVisible();
  await expect(panel.getByText(/No hay ventas cerradas/)).toBeVisible();
  await expect(panel.getByText(/presupuesto guardado/).first()).toBeVisible();
  expect(reads).toBe(1);
  await panel
    .getByRole("combobox", { name: /Medio de pago/ })
    .selectOption(method.id);
  await panel
    .getByRole("combobox", { name: /Agregar producto a la mezcla/ })
    .selectOption(row.id);
  const metric = (label: string) =>
    panel.getByText(label, { exact: true }).locator("..");
  await expect(metric("Unidades para cubrir gastos")).toContainText("173");
  await expect(metric("Aporte por unidad final")).toContainText("58,00");
  await expect(metric("Resultado mensual estimado")).toContainText("19.000,00");
  await panel.getByLabel(/Días de apertura/).fill("26");
  await expect(metric("Unidades para cubrir gastos")).toContainText(
    "7 unidades finales por día",
  );
  await panel.getByLabel(/Volumen previsto/).fill("100");
  await expect(metric("Resultado mensual estimado")).toContainText(
    /-\$\s*4\.200,00/,
  );
  await panel
    .getByLabel("Cantidad relativa de Bebida para equilibrio", { exact: true })
    .fill("2");
  await expect(metric("Unidades para cubrir gastos")).toContainText("173");
  expect(reads).toBe(1);
  await page.getByRole("tab", { name: "Gastos del mes", exact: true }).click();
  await expect(page.getByLabel("Presupuesto 1", { exact: true })).toHaveValue(
    "12000",
  );
  await page
    .getByRole("tab", { name: "Punto de equilibrio", exact: true })
    .click();
  await expect(panel.getByLabel(/Volumen previsto/)).toHaveValue("100");
  expect(reads).toBe(1);
  const period = await (
    await page.request.get("/api/finance/expenses?month=2026-10", {
      maxRetries: 2,
    })
  ).json();
  expect(period.period.expectedUnits).toBe(500);
  expect(period.period.entries[0].budget).toBe("10000.00");
  await page.screenshot({
    path: "docs/previews/finance-break-even-desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect
    .poll(async () =>
      page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    )
    .toBe(true);
  await page.screenshot({
    path: "docs/previews/finance-break-even-mobile.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.route("**/api/finance/break-even?*", (route) =>
    route.fulfill({
      status: 503,
      json: { error: "No se pudo consultar el análisis. Probá otra vez." },
    }),
  );
  await panel.getByRole("button", { name: "Actualizar", exact: true }).click();
  await expect(
    page.getByText("No se pudo consultar el análisis. Probá otra vez.", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(panel.getByText(/Mostrando la última consulta/)).toBeVisible();
  await expect(panel.getByLabel(/Volumen previsto/)).toHaveValue("100");
  expect(reads).toBe(2);
  await page.unroute("**/api/finance/break-even?*");
  await page.getByRole("tab", { name: "Gastos del mes", exact: true }).click();
  await page.getByRole("button", { name: "Guardar mes", exact: true }).click();
  await expect(page.getByText("Mes guardado.", { exact: true })).toBeVisible();
  await page
    .getByRole("tab", { name: "Punto de equilibrio", exact: true })
    .click();
  await expect(metric("Gastos del mes a cubrir")).toContainText("12.000,00");
  await expect(panel.getByLabel(/Volumen previsto/)).toHaveValue("100");
  await expect(metric("Resultado mensual estimado")).toContainText(
    /-\$\s*6\.200,00/,
  );
  expect(reads).toBe(3);
});
