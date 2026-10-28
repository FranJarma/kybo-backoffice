import { test, expect, type Page } from "@playwright/test";
import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
const require = createRequire(import.meta.url);
let css = "",
  script = "";
test.beforeAll(async () => {
  test.setTimeout(120000);
  await createRequire(require.resolve("tsx"))("esbuild").build({
    entryPoints: ["tests/helpers/payment-receipt-ui.tsx"],
    outfile: ".next-e2e/payment-receipt-fixture.js",
    bundle: true,
    platform: "browser",
    jsx: "automatic",
    define: {
      "process.env.NODE_ENV": '"production"',
      "process.env": '{"NODE_ENV":"production"}',
    },
  });
  script = await readFile(".next-e2e/payment-receipt-fixture.js", "utf8");
  css = (
    await createRequire(require.resolve("@tailwindcss/postcss"))("postcss")([
      require("@tailwindcss/postcss")(),
    ]).process(await readFile("src/app/globals.css", "utf8"), {
      from: "src/app/globals.css",
    })
  ).css;
});
async function mount(page: Page, query = "") {
  await page.route("**/*", (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === "/__payment-receipt")
      return route.fulfill({
        contentType: "text/html; charset=utf-8",
        body: `<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style></head><body><script src="/__payment-receipt.js"></script></body></html>`,
      });
    if (url.pathname === "/__payment-receipt.js")
      return route.fulfill({
        contentType: "text/javascript; charset=utf-8",
        body: script,
      });
    return route.abort();
  });
  await page.goto(`/__payment-receipt${query}`);
  await expect(page.getByRole("dialog")).toBeVisible();
}
const confirm = (page: Page) =>
  page.getByRole("button", { name: "Confirmar cobro", exact: true });
test("card receipt is inline, required, focused and preserves leading zeros after an error", async ({
  page,
}) => {
  await mount(page, "?error=1");
  await page
    .getByRole("button", { name: "Tarjeta débito", exact: true })
    .click();
  const receipt = page.getByRole("textbox", {
    name: "Número de comprobante",
    exact: true,
  });
  await expect(receipt).toBeVisible();
  await expect(receipt).toBeFocused();
  await expect(confirm(page)).toBeDisabled();
  await receipt.fill("   ");
  await expect(confirm(page)).toBeDisabled();
  await receipt.fill("0000123");
  await expect(confirm(page)).toBeEnabled();
  await confirm(page).click();
  await expect(receipt).toHaveValue("0000123");
  expect(
    JSON.parse((await page.locator("[data-payments-json]").textContent())!)[0],
  ).toMatchObject({ methodId: "card", reference: "0000123" });
});
test("split card payments keep separate receipt numbers", async ({ page }) => {
  await mount(page);
  await page
    .getByRole("button", { name: "Tarjeta débito", exact: true })
    .click();
  await page
    .getByRole("textbox", { name: "Número de comprobante", exact: true })
    .fill("00001");
  await page
    .getByRole("button", { name: "Dividir cobro", exact: true })
    .click();
  await page
    .getByRole("textbox", { name: "Importe 1", exact: true })
    .fill("50");
  await page
    .getByRole("textbox", { name: "Importe 2", exact: true })
    .fill("50");
  await page
    .getByRole("group", { name: "Medio de pago 2", exact: true })
    .getByRole("button", { name: "Tarjeta crédito", exact: true })
    .click();
  await expect(confirm(page)).toBeDisabled();
  await page
    .getByRole("textbox", {
      name: "Número de comprobante del pago 2",
      exact: true,
    })
    .fill("00002");
  await confirm(page).click();
  const payments = JSON.parse(
    (await page.locator("[data-payments-json]").textContent())!,
  );
  expect(payments.map((row: { reference: string }) => row.reference)).toEqual([
    "00001",
    "00002",
  ]);
});
test("switching to cash clears a card receipt and does not require one", async ({
  page,
}) => {
  await mount(page);
  await page
    .getByRole("button", { name: "Tarjeta débito", exact: true })
    .click();
  await page
    .getByRole("textbox", { name: "Número de comprobante", exact: true })
    .fill("00001");
  await page.getByRole("button", { name: "Efectivo", exact: true }).click();
  await expect(
    page.getByRole("textbox", { name: "Número de comprobante", exact: true }),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: "Importe exacto", exact: true })
    .click();
  await confirm(page).click();
  expect(
    JSON.parse((await page.locator("[data-payments-json]").textContent())!)[0],
  ).toMatchObject({ methodId: "cash", reference: "" });
});
test("platform collections do not request a posnet receipt", async ({
  page,
}) => {
  await mount(page, "?delivery=1");
  await page
    .getByRole("combobox", { name: "Cobrado por 1", exact: true })
    .selectOption("platform");
  await expect(
    page.getByRole("textbox", { name: "Número de comprobante", exact: true }),
  ).toHaveCount(0);
  await expect(confirm(page)).toBeEnabled();
});
for (const width of [390, 1024, 1440])
  test(`card receipt and confirmation remain usable at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await mount(page);
    await page
      .getByRole("button", { name: "Tarjeta débito", exact: true })
      .click();
    await page
      .getByRole("textbox", { name: "Número de comprobante", exact: true })
      .fill("0000123");
    await expect(confirm(page)).toBeInViewport();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: `.next-e2e/payment-receipt-${width}.png`,
      fullPage: true,
    });
  });
