import { test, expect } from "@playwright/test";
import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
const require = createRequire(import.meta.url);
let stylesheet = "";
test.beforeAll(async () => {
  const { build } = createRequire(require.resolve("tsx"))("esbuild");
  await build({
    entryPoints: ["tests/helpers/supply-alerts-ui.tsx"],
    outfile: ".next-e2e/supply-ui.js",
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
  test(`Bolivia estimates, urgency and edits at ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1024 });
    const policies = [
      {
        id: "11111111-1111-4111-8111-111111111111",
        revision: 1,
        itemId: "cups",
        itemName: "Vasos descartables",
        baseUnit: "unit",
        dailyConsumption: "150.000000",
        leadDays: 7,
        safetyDays: 3,
        targetDays: 17,
        enabled: true,
      },
      {
        id: "11111111-1111-4111-8111-111111111112",
        revision: 1,
        itemId: "pearls",
        itemName: "Perlas de mango",
        baseUnit: "g",
        dailyConsumption: "421.052632",
        leadDays: 7,
        safetyDays: 3,
        targetDays: 17,
        enabled: true,
      },
    ];
    const alerts = policies.map((p, i) => ({
      ...p,
      availableQuantity: i ? "2500.000000" : "1500.000000",
      suggestedQuantity: i ? "4657.894744" : "1050.000000",
      coverageDays: i ? "5.937499" : "10.000000",
      coverageAtLeast: false,
      projectedCoverageDays: i ? "5.937499" : "10.000000",
      projectedCoverageAtLeast: false,
      incomingQuantity: "0.000000",
      unconfirmedIncomingQuantity: "0.000000",
      riskOn: "2026-11-02",
      orderBy: i ? "2026-10-18" : "2026-10-23",
      urgency: i ? "critical" : "high",
      status: "action",
    }));
    const sent: unknown[] = [];
    await page.route("**/__supply-fixture", (r) =>
      r.fulfill({
        contentType: "text/html",
        body: `<html lang="es"><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>${stylesheet}</style></head><body></body></html>`,
      }),
    );
    await page.route("**/api/inventory/supply-alerts", (r) => {
      if (r.request().method() === "POST") {
        sent.push(r.request().postDataJSON());
        return r.fulfill({ json: { result: { revision: 2 } } });
      }
      return r.fulfill({
        json: {
          available: true,
          asOf: new Date().toISOString(),
          policies,
          alerts,
          items: policies.map((p) => ({
            id: p.itemId,
            name: p.itemName,
            baseUnit: p.baseUnit,
          })),
        },
      });
    });
    await page.goto("/__supply-fixture");
    await page.addScriptTag({ path: ".next-e2e/supply-ui.js" });
    await expect(
      page.getByRole("heading", { name: "Compras de Bolivia", exact: true }),
    ).toBeVisible();
    await expect(page.getByRole("article").first()).toContainText(
      "Perlas de mango",
    );
    const cups = page
      .getByRole("article")
      .filter({ hasText: "Vasos descartables" });
    await expect(cups).toContainText("10 días");
    await expect(cups).toContainText("1.050 unid.");
    await cups.getByText("Ver cálculo y condiciones", { exact: true }).click();
    await expect(cups).toContainText("Pedido con fecha vigente: 0 unid.");
    await expect(
      cups.getByRole("link", { name: "Ver pedidos a proveedores" }),
    ).toHaveAttribute("href", "/inventory/purchases");
    await page
      .getByRole("button", { name: "Editar Vasos descartables", exact: true })
      .click();
    await expect(
      page.getByLabel("Consumo diario estimado (unid.)", { exact: true }),
    ).toHaveValue("150");
    await page
      .getByLabel("Objetivo de cobertura (días)", { exact: true })
      .fill("10");
    await page
      .getByRole("button", { name: "Guardar compra anticipada", exact: true })
      .click();
    await expect(page.getByRole("alert")).toContainText(
      "objetivo debe superar",
    );
    expect(sent).toHaveLength(0);
    await page
      .getByLabel("Objetivo de cobertura (días)", { exact: true })
      .fill("17");
    await page.screenshot({
      path: `.next-e2e/supply-edit-${width}.png`,
      fullPage: true,
    });
    await page
      .getByRole("button", { name: "Guardar compra anticipada", exact: true })
      .click();
    await expect(page.getByRole("status")).toContainText(
      "Regla de compra guardada",
    );
    expect(sent).toEqual([
      expect.objectContaining({
        policy: expect.objectContaining({
          dailyConsumption: "150",
          leadDays: 7,
          safetyDays: 3,
          targetDays: 17,
          revision: 1,
        }),
      }),
    ]);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: `.next-e2e/supply-list-${width}.png`,
      fullPage: true,
    });
  });
