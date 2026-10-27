import { test, expect } from "@playwright/test";
import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
const require = createRequire(import.meta.url);
let stylesheet = "";
const itemId = "33333333-3333-4333-8333-333333333333";
const policy = {
  id: "11111111-1111-4111-8111-111111111111",
  revision: 2,
  itemId,
  itemName: "Vasos descartables",
  baseUnit: "unit",
  dailyConsumption: "150.000000",
  leadDays: 7,
  safetyDays: 3,
  targetDays: 17,
  enabled: true,
};
const alert = {
  ...policy,
  incomingQuantity: "0.000000",
  unconfirmedIncomingQuantity: "0.000000",
  projectedCoverageDays: "10.000000",
  projectedCoverageAtLeast: false,
  availableQuantity: "1500.000000",
  suggestedQuantity: "1050.000000",
  coverageDays: "10.000000",
  coverageAtLeast: false,
  riskOn: "2026-11-02",
  orderBy: "2026-10-23",
  urgency: "high",
  status: "action",
};
test.beforeAll(async () => {
  const { build } = createRequire(require.resolve("tsx"))("esbuild");
  await build({
    entryPoints: ["tests/helpers/unified-purchases-ui.tsx"],
    outfile: ".next-e2e/unified-purchases-ui.js",
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
  test(`unified needs, item settings and task at ${width}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 1024 });
    const sent: Record<string, unknown>[] = [];
    const preparationGate = Promise.withResolvers<void>();
    let delayPreparation = false,
      preparationWaiting = false;
    await page.route("**/__unified**", (r) =>
      r.fulfill({
        contentType: "text/html",
        body: `<html lang="es"><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>${stylesheet}</style></head><body></body></html>`,
      }),
    );
    await page.route("**/api/inventory/supply-alerts", async (r) => {
      if (r.request().method() === "POST") {
        sent.push(r.request().postDataJSON());
        return r.fulfill({ json: { result: { revision: 3 } } });
      }
      if (delayPreparation) {
        delayPreparation = false;
        preparationWaiting = true;
        await preparationGate.promise;
      }
      return r.fulfill({
        json: {
          available: true,
          asOf: "2026-10-23T12:00:00Z",
          policies: [policy],
          alerts: [alert],
          items: [{ id: itemId, name: policy.itemName, baseUnit: "unit" }],
        },
      });
    });
    await page.route("**/api/procurement/orders", (r) =>
      r.fulfill({ json: { available: true, orders: [] } }),
    );
    await page.route("**/api/catalog/**", (r) => {
      const path = new URL(r.request().url()).pathname;
      const rows = path.endsWith("/suppliers")
        ? [
            {
              id: "supplier",
              name: "Proveedor de descartables",
              revision: 1,
              archivedAt: null,
            },
          ]
        : path.endsWith("/presentations")
          ? [
              {
                id: "pack",
                name: "Caja de 100 vasos",
                supplierId: "supplier",
                itemId,
                baseQuantity: "100.000000",
                revision: 1,
                archivedAt: null,
              },
            ]
          : [];
      return r.fulfill({ json: { rows, total: rows.length } });
    });
    await page.goto("/__unified");
    await page.addScriptTag({ path: ".next-e2e/unified-purchases-ui.js" });
    await expect(
      page.getByRole("heading", { name: "Compras", exact: true }),
    ).toBeVisible();
    await expect(page.getByText("1.050", { exact: true })).toBeVisible();
    await page
      .getByRole("checkbox", {
        name: "Seleccionar Vasos descartables",
        exact: true,
      })
      .check();
    delayPreparation = true;
    await page
      .getByRole("button", { name: "Preparar pedido", exact: true })
      .last()
      .click();
    await expect.poll(() => preparationWaiting).toBe(true);
    try {
      await expect(
        page.getByRole("button", { name: "Nuevo pedido", exact: true }),
      ).toBeDisabled();
    } finally {
      preparationGate.resolve();
    }
    await expect(page.getByRole("dialog")).toBeVisible();
    await expect(page.getByLabel("Cantidad a pedir · unidades")).toHaveValue(
      "1050",
    );
    await page
      .getByRole("combobox", { name: "Proveedor", exact: true })
      .click();
    await page
      .getByRole("option", { name: "Proveedor de descartables", exact: true })
      .click();
    await page
      .getByRole("combobox", { name: "Presentación", exact: true })
      .click();
    await page
      .getByRole("option", { name: "Caja de 100 vasos", exact: true })
      .click();
    await expect(
      page.getByLabel("Cantidad a pedir · Caja de 100 vasos"),
    ).toHaveValue("");
    expect(sent).toHaveLength(0);
    await page.screenshot({
      path: `.next-e2e/unified-prefill-${width}.png`,
      fullPage: true,
    });
    await page.goto("/__unified?mode=settings");
    await page.addScriptTag({ path: ".next-e2e/unified-purchases-ui.js" });
    await expect(
      page.getByLabel("Consumo diario estimado (unid.)", { exact: true }),
    ).toHaveValue("150");
    await page
      .getByLabel("Reponer para cubrir (días)", { exact: true })
      .fill("10");
    await page
      .getByRole("button", { name: "Guardar configuración", exact: true })
      .click();
    await expect(page.getByRole("alert")).toContainText(
      "objetivo debe superar",
    );
    expect(sent).toHaveLength(0);
    await page
      .getByLabel("Reponer para cubrir (días)", { exact: true })
      .fill("17");
    await page
      .getByRole("button", { name: "Guardar configuración", exact: true })
      .click();
    await expect.poll(() => sent.length).toBe(1);
    expect(sent[0]).toMatchObject({
      policy: {
        itemId,
        id: policy.id,
        revision: 2,
        dailyConsumption: "150",
        leadDays: 7,
        safetyDays: 3,
        targetDays: 17,
      },
    });
    await page.goto("/__unified?mode=task");
    await page.evaluate(
      (task) => {
        (window as unknown as { testTask: unknown }).testTask = task;
      },
      {
        id: policy.id,
        revision: 1,
        kind: "purchase",
        state: "pending",
        urgency: "high",
        title: "Comprar Vasos descartables",
        reason: "CÁLCULO EXTENSO DE PRUEBA",
        quantity: "1050.000000",
        unit: "unit",
        itemId,
        locationId: null,
        locationName: null,
        originLocationId: null,
        originName: null,
        assignedTo: null,
        assignedToName: null,
        assigneeUnavailable: false,
        materials: [],
        dueAt: "2026-10-24T02:59:59.999Z",
        documentId: null,
        documentRevision: null,
        createdAt: "2026-10-23T12:00:00Z",
        updatedAt: "2026-10-23T12:00:00Z",
        dependencyIds: [],
        purchaseAlert: alert,
      },
    );
    await page.addScriptTag({ path: ".next-e2e/unified-purchases-ui.js" });
    await expect(page.getByRole("dialog")).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Preparar pedido", exact: true }),
    ).toHaveAttribute("href", `/inventory/purchases?item=${itemId}`);
    await expect(
      page.getByText("CÁLCULO EXTENSO DE PRUEBA", { exact: true }),
    ).not.toBeVisible();
    await page.getByText("Ver cómo se calcula", { exact: true }).click();
    await expect(
      page.getByText("150 unid.", { exact: false }).first(),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: `.next-e2e/unified-task-${width}.png`,
      fullPage: true,
    });
  });

test("linked purchase task keeps arrival date and opens the existing order", async ({
  page,
}) => {
  await page.route("**/__unified**", (r) =>
    r.fulfill({
      contentType: "text/html",
      body: `<html lang="es"><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>${stylesheet}</style></head><body></body></html>`,
    }),
  );
  await page.goto("/__unified?mode=task");
  await page.evaluate(
    (task) => {
      (window as unknown as { testTask: unknown }).testTask = task;
    },
    {
      id: policy.id,
      revision: 1,
      kind: "purchase",
      state: "pending",
      urgency: "high",
      title: "Recibir pedido",
      reason: "Pedido en camino",
      quantity: null,
      unit: null,
      itemId: null,
      locationId: null,
      locationName: null,
      originLocationId: null,
      originName: null,
      assignedTo: null,
      assignedToName: null,
      assigneeUnavailable: false,
      materials: [],
      dueAt: new Date().toISOString(),
      documentId: policy.id,
      documentRevision: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      dependencyIds: [],
    },
  );
  await page.addScriptTag({ path: ".next-e2e/unified-purchases-ui.js" });
  await expect(page.getByText("Hoy", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Ver pedido", exact: true }),
  ).toHaveAttribute("href", `/inventory/purchases?order=${policy.id}`);
  await page.getByText("Informar un impedimento", { exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Cancelar tarea", exact: true }),
  ).toHaveCount(0);
});

test("item configuration belongs to manager catalog tab and is a separate form", async ({
  page,
}) => {
  await page.route("**/__unified**", (r) =>
    r.fulfill({
      contentType: "text/html",
      body: `<html lang="es"><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>${stylesheet}</style></head><body></body></html>`,
    }),
  );
  await page.route("**/api/catalog/**", (r) =>
    r.fulfill({
      json: {
        rows: [
          {
            id: itemId,
            name: policy.itemName,
            code: "VASO",
            class: "packaging",
            baseUnit: "unit",
            unitCost: null,
            purchasable: true,
            recipeUsable: false,
            stockTracked: true,
            revision: 1,
            archivedAt: null,
          },
        ],
        total: 1,
      },
    }),
  );
  let settingsReads = 0;
  await page.route("**/api/inventory/supply-alerts", (r) => {
    settingsReads++;
    return r.fulfill({
      json: {
        available: true,
        asOf: "2026-10-23T12:00:00Z",
        policies: [policy],
        alerts: [alert],
        items: [{ id: itemId, name: policy.itemName, baseUnit: "unit" }],
      },
    });
  });
  await page.goto("/__unified?mode=catalog");
  await page.addScriptTag({ path: ".next-e2e/unified-purchases-ui.js" });
  await page
    .getByRole("button", { name: "Editar", exact: true })
    .first()
    .click();
  await page
    .getByRole("tab", { name: "Reposición y compras", exact: true })
    .click();
  await expect(
    page.getByLabel("Consumo diario estimado (unid.)", { exact: true }),
  ).toHaveValue("150");
  expect(await page.locator("form form").count()).toBe(0);
  const reads = settingsReads;
  await page.goto("/__unified?mode=catalog&staff=1");
  await page.addScriptTag({ path: ".next-e2e/unified-purchases-ui.js" });
  await page
    .getByRole("button", { name: "Editar", exact: true })
    .first()
    .click();
  await expect(
    page.getByRole("tab", { name: "Reposición y compras", exact: true }),
  ).toHaveCount(0);
  expect(settingsReads).toBe(reads);
});
