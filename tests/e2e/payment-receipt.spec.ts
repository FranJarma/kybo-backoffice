import { test, expect, type Page } from "@playwright/test";
import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
const require = createRequire(import.meta.url);
const barlow = [
  ["regular", 400],
  ["medium", 500],
  ["semibold", 600],
  ["bold", 700],
] as const;
const fonts = barlow.map(([name, weight]) => ({
  file: `barlow-${name}.ttf`,
  weight,
}));
const fontCss = fonts
  .map(
    ({ file, weight }) =>
      `@font-face{font-family:Barlow;src:url(/fonts/${file});font-weight:${weight};font-display:swap}`,
  )
  .join("\n");
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
  css += "\n" + (await readFile("src/components/sales/pos.css", "utf8"));
});
async function mount(page: Page, query = "") {
  await page.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === "/__payment-receipt")
      return route.fulfill({
        contentType: "text/html; charset=utf-8",
        body: `<!doctype html><html lang="es-AR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${fontCss}\n${css}</style></head><body><script src="/__payment-receipt.js"></script></body></html>`,
      });
    if (url.pathname === "/__payment-receipt.js")
      return route.fulfill({
        contentType: "text/javascript; charset=utf-8",
        body: script,
      });
    const font = fonts.find(({ file }) => url.pathname === `/fonts/${file}`);
    if (font)
      return route.fulfill({
        contentType: "font/ttf",
        body: await readFile(`public/fonts/${font.file}`),
      });
    return route.abort();
  });
  await page.goto(`/__payment-receipt${query}`);
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
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
    .getByRole("combobox", { name: "Medio de pago 2", exact: true })
    .selectOption("card-2");
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

test("cash needs valid tender and distinguishes exact, over and under payment", async ({
  page,
}) => {
  await mount(page, "?example=1");
  await page.getByRole("button", { name: "Efectivo", exact: true }).click();
  const received = page.getByRole("textbox", {
    name: "Efectivo recibido 1",
    exact: true,
  });
  await expect(confirm(page)).toBeDisabled();
  await received.fill("18899,99");
  await expect(
    page.getByText("El efectivo recibido no cubre el cobro."),
  ).toBeVisible();
  await expect(confirm(page)).toBeDisabled();
  for (const [amount, expected] of [
    ["20000", /1\.100,00/],
    ["18900", /0,00$/],
    ["50000", /31\.100,00/],
  ] as const) {
    await received.fill(amount);
    await expect(page.getByText(/Vuelto:/)).toHaveText(expected);
    await expect(confirm(page)).toBeEnabled();
  }
  await confirm(page).click();
  await expect(page.locator("[data-payments-json]")).toHaveText(
    JSON.stringify([
      { collector: "local", methodId: "cash", amount: "18900", reference: "" },
    ]),
  );
  await expect(page.locator("[data-cash-json]")).toHaveText(
    JSON.stringify({
      applied: "18900.00",
      received: "50000.00",
      change: "31100.00",
    }),
  );
});

test("dividing preserves cash and receipts while allocations are edited or removed", async ({
  page,
}) => {
  await mount(page, "?example=1");
  await page.getByRole("button", { name: "Efectivo", exact: true }).click();
  const received = page.getByRole("textbox", {
    name: "Efectivo recibido 1",
    exact: true,
  });
  await received.fill("20000");
  await page
    .getByRole("button", { name: "Dividir cobro", exact: true })
    .click();
  const first = page.getByRole("textbox", { name: "Importe 1", exact: true });
  const second = page.getByRole("textbox", { name: "Importe 2", exact: true });
  await first.fill("10000");
  await second.fill("8000");
  await page
    .getByRole("combobox", { name: "Medio de pago 2", exact: true })
    .selectOption("card");
  const receipt = page.getByRole("textbox", {
    name: "Número de comprobante del pago 2",
    exact: true,
  });
  await receipt.fill("00009");
  const balance = (label: string) =>
    page.getByText(label, { exact: true }).locator("..");
  await expect(balance("Falta cubrir")).toHaveText(/900,00/);
  await expect(confirm(page)).toBeDisabled();
  await second.fill("8900,01");
  await expect(balance("Excedente")).toHaveText(/0,01/);
  await expect(confirm(page)).toBeDisabled();
  await second.fill("8900");
  await expect(balance("Falta cubrir")).toHaveText(/0,00/);
  await expect(balance("Asignado")).toHaveText(/18\.900,00/);
  await expect(received).toHaveValue("20000");
  await expect(receipt).toHaveValue("00009");
  await expect(page.getByText(/Vuelto:/)).toHaveText(/10\.000,00/);
  await confirm(page).click();
  await expect(page.locator("[data-payments-json]")).toHaveText(
    JSON.stringify([
      { collector: "local", methodId: "cash", amount: "10000", reference: "" },
      {
        collector: "local",
        methodId: "card",
        amount: "8900",
        reference: "00009",
      },
    ]),
  );
  await expect(page.locator("[data-cash-json]")).toHaveText(
    JSON.stringify({
      applied: "10000.00",
      received: "20000.00",
      change: "10000.00",
    }),
  );
  await page
    .getByRole("button", { name: "Quitar cobro 1", exact: true })
    .click();
  await expect(first).toHaveCount(0);
  await expect(
    page.getByRole("textbox", { name: "Número de comprobante", exact: true }),
  ).toHaveValue("00009");
  await confirm(page).click();
  await expect(page.locator("[data-payments-json]")).toHaveText(
    JSON.stringify([
      {
        collector: "local",
        methodId: "card",
        amount: "18900",
        reference: "00009",
      },
    ]),
  );
});

test("partial allocation proposes the remaining amount when a payment is added", async ({
  page,
}) => {
  await mount(page, "?example=1&partial=1");
  await page.getByRole("button", { name: "Efectivo", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Importe 1", exact: true })
    .fill("10000");
  await page
    .getByRole("button", { name: "Importe exacto", exact: true })
    .click();
  await expect(confirm(page)).toBeEnabled();
  await page
    .getByRole("button", { name: "Dividir cobro", exact: true })
    .click();
  await expect(
    page.getByRole("textbox", { name: "Importe 2", exact: true }),
  ).toHaveValue("8900");
  await expect(confirm(page)).toBeDisabled();
});

test("transfer requires verification of the current details and limits the combined reference", async ({
  page,
}) => {
  await mount(page, "?partial=1");
  await page
    .getByRole("button", { name: "Transferencia", exact: true })
    .click();
  const verified = page.getByRole("checkbox", {
    name: "Acreditación verificada",
    exact: true,
  });
  const holder = page.getByRole("textbox", {
    name: "Titular de la transferencia",
    exact: true,
  });
  const reference = page.getByRole("textbox", {
    name: "Número de operación o referencia",
    exact: true,
  });
  await expect(verified).toBeVisible();
  await expect(confirm(page)).toBeDisabled();
  await verified.check();
  await expect(confirm(page)).toBeEnabled();
  await holder.fill("  Lucía Pérez  ");
  await expect(verified).not.toBeChecked();
  await reference.fill("  000451  ");
  await verified.check();
  await page
    .getByRole("textbox", { name: "Importe 1", exact: true })
    .fill("99");
  await expect(verified).not.toBeChecked();
  await reference.fill("a".repeat(115));
  await verified.check();
  await expect(page.getByText(/hasta 120 caracteres en total/)).toBeVisible();
  await expect(confirm(page)).toBeDisabled();
  await reference.fill("  000451  ");
  await verified.check();
  await confirm(page).click();
  await expect(page.locator("[data-payments-json]")).toHaveText(
    JSON.stringify([
      {
        collector: "local",
        methodId: "transfer",
        amount: "99",
        reference: "Titular: Lucía Pérez · Operación: 000451",
      },
    ]),
  );
  await expect(page.locator("[data-cash-json]")).toHaveText("null");
  await page
    .getByRole("button", { name: "Tarjeta débito", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Transferencia", exact: true })
    .click();
  await expect(verified).not.toBeChecked();
  await expect(confirm(page)).toBeDisabled();
});

test("cancelling checkout does not confirm or retain payment details when reopened", async ({
  page,
}) => {
  await mount(page, "?example=1");
  await page.getByRole("button", { name: "Efectivo", exact: true }).click();
  await page
    .getByRole("button", { name: "Importe exacto", exact: true })
    .click();
  await expect(confirm(page)).toBeEnabled();
  await page.getByRole("button", { name: "Cancelar", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeHidden();
  await expect(page.locator("[data-payments-json]")).toHaveText("null");
  await page.getByRole("button", { name: "Abrir cobro", exact: true }).click();
  await page.getByRole("button", { name: "Efectivo", exact: true }).click();
  await expect(
    page.getByRole("textbox", { name: "Efectivo recibido 1", exact: true }),
  ).toHaveValue("");
  await expect(confirm(page)).toBeDisabled();
});

test("desktop cash checkout fits the approved two-column layout", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await mount(page, "?example=1");
  await page.getByRole("button", { name: "Efectivo", exact: true }).click();
  await page.getByRole("button", { name: "$ 20.000", exact: true }).click();
  const dialog = page.getByRole("dialog");
  const panel = (await dialog.boundingBox())!;
  const method = (await dialog.locator(".pos-payment-choice").boundingBox())!;
  const cash = (await dialog.locator(".pos-payment-cash").boundingBox())!;
  expect(panel.width).toBe(900);
  expect(panel.x).toBe(190);
  expect(cash.x).toBeGreaterThan(method.x + method.width);
  expect(cash.width).toBeCloseTo(method.width, 0);
  expect(cash.y).toBeCloseTo(method.y, 0);
  await expect(confirm(page)).toBeInViewport();
  await page.screenshot({ path: ".next-e2e/payment-cash-desktop.png" });
});

test("cash actions stay visible when the visual viewport shrinks for the keyboard", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => {
    const viewport = window.visualViewport!;
    const fullHeight = viewport.height;
    let height = fullHeight;
    let top = 0;
    Object.defineProperty(viewport, "height", { get: () => height });
    Object.defineProperty(viewport, "offsetTop", { get: () => top });
    document.addEventListener("focusin", (event) => {
      if (
        event.target instanceof HTMLInputElement &&
        event.target.inputMode === "decimal"
      ) {
        height = 370;
        top = 28;
        viewport.dispatchEvent(new Event("resize"));
      }
    });
  });
  await mount(page, "?example=1");
  await page.getByRole("button", { name: "Efectivo", exact: true }).click();
  const received = page.getByRole("textbox", {
    name: "Efectivo recibido 1",
    exact: true,
  });
  await received.fill("20000");
  const dialog = page.getByRole("dialog");
  const dialogBounds = (await dialog.boundingBox())!;
  const actions = (await page.locator("[data-payment-footer]").boundingBox())!;
  expect(dialogBounds.y).toBeGreaterThanOrEqual(28);
  expect(actions.y + actions.height).toBeLessThanOrEqual(398);
  const input = (await received.boundingBox())!;
  const body = (await dialog.locator(".pos-payment-body").boundingBox())!;
  expect(input.y).toBeGreaterThanOrEqual(body.y);
  expect(input.y + input.height).toBeLessThanOrEqual(body.y + body.height);
  await expect(
    page.getByRole("button", { name: "Cancelar", exact: true }),
  ).toBeInViewport();
  await expect(confirm(page)).toBeEnabled();
  await page.screenshot({
    path: ".next-e2e/payment-cash-keyboard-viewport.png",
  });
  await page.setViewportSize({ width: 390, height: 640 });
  await page.reload();
  await page.getByRole("button", { name: "Efectivo", exact: true }).click();
  await page.getByRole("button", { name: "$ 20.000", exact: true }).click();
  await expect(confirm(page)).toBeInViewport();
  await page.screenshot({ path: ".next-e2e/payment-cash-mobile.png" });
});
