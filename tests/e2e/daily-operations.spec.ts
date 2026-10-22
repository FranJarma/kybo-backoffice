import { test, expect } from "@playwright/test";
import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
const require = createRequire(import.meta.url);
let stylesheet = "";
test.beforeAll(async () => {
  const { build } = createRequire(require.resolve("tsx"))("esbuild");
  await build({
    entryPoints: ["tests/helpers/daily-operations-ui.tsx"],
    outfile: ".next-e2e/daily-ui.js",
    bundle: true,
    platform: "browser",
    jsx: "automatic",
    define: {
      "process.env.NODE_ENV": '"production"',
      "process.env": '{"NODE_ENV":"production"}',
    },
  });
  const tailwind = require("@tailwindcss/postcss");
  const postcss = createRequire(require.resolve("@tailwindcss/postcss"))(
    "postcss",
  );
  stylesheet = (
    await postcss([tailwind()]).process(
      await readFile("src/app/globals.css", "utf8"),
      { from: "src/app/globals.css" },
    )
  ).css;
});
test.use({ hasTouch: true });
for (const size of [
  { width: 600, height: 960 },
  { width: 768, height: 1024 },
  { width: 1024, height: 768 },
])
  test(`tasks and location stock at ${size.width}`, async ({ page }) => {
    page.on("pageerror", (error) => console.error(error.message));
    await page.setViewportSize(size);
    await page.route("**/__daily-fixture", (r) =>
      r.fulfill({
        contentType: "text/html",
        body: `<html lang="es"><head><meta name="viewport" content="width=device-width, initial-scale=1"><style>${stylesheet}</style></head><body></body></html>`,
      }),
    );
    const task = {
      id: "11111111-1111-4111-8111-111111111111",
      revision: 1,
      kind: "transfer",
      state: "pending",
      urgency: "high",
      title: "Reponer vasos descartables",
      reason: "Stock debajo del mínimo en Barra.",
      quantity: "20.000000",
      unit: "unit",
      itemId: "item",
      locationId: "bar",
      locationName: "Barra",
      originLocationId: "depot",
      originName: "Depósito",
      assignedTo: null as string | null,
      assignedToName: null,
      dueAt: null,
      documentId: null,
      documentRevision: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      dependencyIds: [],
    };
    let failNextRead = false;
    await page.route("**/api/operations/**", async (r) => {
      if (r.request().url().includes("/reconcile"))
        return r.fulfill({ json: { result: { created: 0 } } });
      if (
        r.request().method() === "POST" &&
        r.request().postDataJSON().action === "assign"
      ) {
        task.assignedTo = "staff";
        task.revision++;
        failNextRead = size.width === 600;
        return r.fulfill({ json: { result: { revision: task.revision } } });
      }
      if (r.request().method() === "POST")
        return r.fulfill({
          status: 409,
          json: {
            error: "La tarea cambió. Actualizá antes de continuar.",
            code: "DAILY_CONFLICT",
          },
        });
      if (failNextRead) {
        failNextRead = false;
        return r.abort();
      }
      return r.fulfill({
        json: {
          asOf: new Date().toISOString(),
          businessDate: "2026-10-22",
          canManage: true,
          tasks: [task],
          total: 1,
          configurationWarnings: [],
          summary: { critical: 0, high: 1, scheduled: 0 },
          people: [{ id: "staff", name: "Ana" }],
          locations: [
            { id: "bar", name: "Barra" },
            { id: "kitchen", name: "Cocina" },
            { id: "depot", name: "Depósito" },
          ],
          stock: ["bar", "kitchen", "depot"].flatMap((locationId) =>
            Array.from({ length: 50 }, (_, i) => ({
              itemId: `item-${i}`,
              itemName: i === 0 ? "Vasos descartables" : `Insumo ${i}`,
              unit: "unit",
              locationId,
              locationName:
                locationId === "bar"
                  ? "Barra"
                  : locationId === "kitchen"
                    ? "Cocina"
                    : "Depósito",
              physical:
                locationId === "depot"
                  ? "20.000000"
                  : locationId === "bar" && i === 0
                    ? "10.000000"
                    : "0.000000",
              reserved:
                locationId === "bar" && i === 0 ? "2.000000" : "0.000000",
              unusable: "0.000000",
              available:
                locationId === "depot"
                  ? "20.000000"
                  : locationId === "bar" && i === 0
                    ? "8.000000"
                    : "0.000000",
            })),
          ),
        },
      });
    });
    await page.goto("/__daily-fixture");
    await page.addScriptTag({ path: ".next-e2e/daily-ui.js" });
    await expect(
      page.getByRole("heading", { name: "Operación del día" }),
    ).toBeVisible();
    await expect(
      page.getByText("Reponer vasos descartables", { exact: true }),
    ).toBeVisible();
    await page.getByText("Reponer vasos descartables", { exact: true }).click();
    await page
      .getByRole("dialog")
      .getByLabel("Responsable", { exact: true })
      .selectOption("staff");
    await page.getByRole("button", { name: "Asignar", exact: true }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    if (size.width === 600) {
      await expect(page.getByRole("alert")).toContainText("actualizar");
      await page
        .getByRole("button", { name: "Actualizar", exact: true })
        .click();
      await expect(page.getByRole("alert")).toHaveCount(0);
    }
    await page.getByText("Reponer vasos descartables", { exact: true }).click();
    await page.getByLabel("Motivo o impedimento").fill("Falta un paquete");
    await page.getByRole("button", { name: "Informar bloqueo" }).click();
    await expect(page.getByRole("alert")).toContainText("La tarea cambió");
    await expect(page.getByLabel("Motivo o impedimento")).toHaveValue(
      "Falta un paquete",
    );
    await page.getByRole("button", { name: "Cerrar", exact: true }).click();
    await page.screenshot({
      path: `.next-e2e/daily-board-${size.width}.png`,
      fullPage: true,
    });
    await page.getByRole("button", { name: "Stock por ubicación" }).click();
    await expect(
      page.getByText("Vasos descartables", { exact: true }),
    ).toBeVisible();
    const cups = page
      .getByRole("article")
      .filter({ hasText: "Vasos descartables" });
    await expect(page.getByRole("article")).toHaveCount(50);
    await expect(cups.getByText("28 unit", { exact: true })).toBeVisible();
    await cups
      .getByText("Ver disponible por ubicación", { exact: false })
      .click();
    await expect(cups.getByText("Depósito", { exact: true })).toBeVisible();
    await expect(cups.getByText("20 unit", { exact: true })).toBeVisible();
    await page.getByLabel("Ubicación", { exact: true }).selectOption("bar");
    await expect(cups.getByText("8 unit", { exact: true })).toBeVisible();
    await expect(cups.getByText("28 unit", { exact: true })).toHaveCount(0);
    await page.getByLabel("Ubicación", { exact: true }).selectOption("");
    await expect(cups.getByText("28 unit", { exact: true })).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: `.next-e2e/daily-stock-${size.width}.png`,
      fullPage: true,
    });
  });
