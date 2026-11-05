import { expect, test, type Page } from "@playwright/test";
import { createRequire } from "node:module";
import { readFile, mkdir } from "node:fs/promises";
const require = createRequire(import.meta.url);
let css = "";
test.beforeAll(async () => {
  test.setTimeout(120_000);
  await createRequire(require.resolve("tsx"))("esbuild").build({
    entryPoints: ["tests/helpers/stock-location-ui.tsx"],
    outfile: ".next-e2e/stock-location-ui.js",
    bundle: true,
    platform: "browser",
    jsx: "automatic",
    define: {
      "process.env.NODE_ENV": '"production"',
      "process.env": '{"NODE_ENV":"production"}',
    },
  });
  css = (
    await createRequire(require.resolve("@tailwindcss/postcss"))("postcss")([
      require("@tailwindcss/postcss")(),
    ]).process(
      (await readFile("src/app/globals.css", "utf8")).replace(
        '@import "tailwindcss";',
        '@import "tailwindcss" source(none);\n@source "../components";',
      ),
      { from: "src/app/globals.css" },
    )
  ).css;
});
async function mount(page: Page) {
  await page.route("**/*", (route) =>
    new URL(route.request().url()).pathname === "/__stock-ux"
      ? route.fulfill({
          contentType: "text/html",
          body: `<html lang="es"><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style></head><body><div id="root"></div></body></html>`,
        })
      : route.abort(),
  );
  await page.goto("/__stock-ux");
  await page.addScriptTag({ path: ".next-e2e/stock-location-ui.js" });
}
test("el disponible de Depósito no oculta una necesidad en Barra, y los mínimos se ven por ubicación", async ({
  page,
}) => {
  await mount(page);
  const milk = page.getByRole("article").filter({ hasText: "Leche" });
  await expect(milk.getByText("21 l", { exact: true })).toBeVisible();
  await expect(milk.getByText("Barra", { exact: true })).toBeVisible();
  await expect(milk.getByText("Reponer", { exact: true })).toBeVisible();
  await expect(milk.getByText("2 l", { exact: true })).toBeVisible();
  await expect(milk.getByText("5 l", { exact: true })).toBeVisible();
  await page
    .getByRole("checkbox", { name: "Solo insumos para reponer", exact: true })
    .check();
  await expect(page.getByRole("article")).toHaveCount(1);
  await expect(
    page.getByText("Vasos descartables", { exact: true }),
  ).toHaveCount(0);
  await page.getByLabel("Ubicación", { exact: true }).selectOption("kitchen");
  await expect(
    page.getByText("No hay insumos para reponer en esta vista", {
      exact: true,
    }),
  ).toBeVisible();
  await page
    .getByRole("checkbox", { name: "Solo insumos para reponer", exact: true })
    .uncheck();
  await expect(
    page.getByText("3 kg", { exact: true }).filter({ visible: true }),
  ).toBeVisible();
});
for (const width of [390, 768, 1440])
  test(`saldos comparables y unidades legibles a ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 1000 });
    await mount(page);
    await expect(
      page.getByRole("link", { name: "Preparar traslado", exact: true }),
    ).toHaveAttribute("href", "/inventory/transfers");
    await page.getByLabel("Buscar insumo", { exact: true }).fill("jamon");
    await expect(page.getByRole("article")).toHaveCount(1);
    await expect(page.getByText("Jamón cocido", { exact: true })).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.getByLabel("Buscar insumo", { exact: true }).fill("");
    await mkdir(".next-e2e/stock-location-ux", { recursive: true });
    await page.screenshot({
      path: `.next-e2e/stock-location-ux/stock-${width}.png`,
      fullPage: true,
    });
  });
