import { test, expect } from "@playwright/test";
import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
const require = createRequire(import.meta.url);
let css = "";
const branch = "11111111-1111-4111-8111-111111111111",
  depot = "22222222-2222-4222-8222-222222222222",
  bar = "33333333-3333-4333-8333-333333333333",
  foreign = "44444444-4444-4444-8444-444444444444",
  order = "55555555-5555-4555-8555-555555555555";
const milk = "66666666-6666-4666-8666-666666666666",
  ham = "77777777-7777-4777-8777-777777777777",
  cups = "88888888-8888-4888-8888-888888888888";
test.beforeAll(async () => {
  const { build } = createRequire(require.resolve("tsx"))("esbuild");
  await build({
    entryPoints: ["tests/helpers/transfers-ui.tsx"],
    outfile: ".next-e2e/transfers-ui.js",
    bundle: true,
    platform: "browser",
    jsx: "automatic",
    define: {
      "process.env.NODE_ENV": '"production"',
      "process.env": '{"NODE_ENV":"production"}',
    },
  });
  const postcss = createRequire(require.resolve("@tailwindcss/postcss"))(
    "postcss",
  );
  css = (
    await postcss([require("@tailwindcss/postcss")()]).process(
      await readFile("src/app/globals.css", "utf8"),
      { from: "src/app/globals.css" },
    )
  ).css;
});
test.use({ hasTouch: true });
async function mount(
  page: import("@playwright/test").Page,
  options: {
    transit?: boolean;
    paginated?: boolean;
    tiny?: boolean;
    resolved?: boolean;
    noDepot?: boolean;
  } = {},
) {
  const posted: { url: string; body: Record<string, unknown> }[] = [];
  const catalog = [
    { id: milk, name: "Leche", baseUnit: "ml" },
    { id: ham, name: "Jamón cocido", baseUnit: "g" },
    { id: cups, name: "Vasos descartables", baseUnit: "unit" },
  ].map((row) => ({
    ...row,
    revision: 1,
    stockTracked: true,
    archivedAt: null,
  }));
  await page.route("**/__transfers-fixture", (r) =>
    r.fulfill({
      contentType: "text/html",
      body: `<html lang="es"><head><meta name="viewport" content="width=device-width, initial-scale=1"><style>${css}</style></head><body></body></html>`,
    }),
  );
  await page.route("**/api/**", async (r) => {
    const url = new URL(r.request().url());
    if (r.request().method() === "POST") {
      posted.push({ url: url.pathname, body: r.request().postDataJSON() });
      return r.fulfill({ json: { result: { id: order, revision: 2 } } });
    }
    if (url.pathname === "/api/catalog/items")
      return r.fulfill({ json: { rows: catalog, total: catalog.length } });
    if (url.pathname === "/api/branches/current")
      return r.fulfill({
        json: {
          locations: options.noDepot
            ? [{ id: bar, name: "Barra", code: "BARRA" }]
            : [
                { id: depot, name: "Depósito principal", code: "DEPOSITO" },
                { id: bar, name: "Barra", code: "BARRA" },
              ],
        },
      });
    if (url.pathname === "/api/transfers")
      return r.fulfill({
        json: {
          branchId: branch,
          hasMore:
            !!options.paginated && url.searchParams.get("offset") === "0",
          destinations: [
            {
              id: depot,
              name: "Depósito principal",
              branchName: "Kybo",
              branchId: branch,
            },
            { id: bar, name: "Barra", branchName: "Kybo", branchId: branch },
          ],
          rows:
            options.transit ||
            options.paginated ||
            options.resolved ||
            options.tiny
              ? [
                  {
                    id: order,
                    originBranchId:
                      options.transit || options.tiny || options.resolved
                        ? foreign
                        : branch,
                    destinationBranchId: branch,
                    originLocationId: depot,
                    destinationLocationId: bar,
                    state: options.resolved
                      ? "resolved"
                      : options.transit || options.tiny
                        ? "in_transit"
                        : "confirmed",
                    reason: "Reposición del turno",
                    revision: 1,
                    allocations: [
                      {
                        id: milk,
                        itemName: "Leche",
                        baseUnit: "ml",
                        quantity: options.tiny ? "0.000001" : "10000.000000",
                        received: options.tiny
                          ? "0.000000"
                          : options.resolved
                            ? "6000.000000"
                            : "2000.000000",
                        resolved: options.resolved ? "4000.000000" : "0.000000",
                      },
                    ],
                  },
                ]
              : [],
        },
      });
    return r.fulfill({ json: {} });
  });
  await page.goto("/__transfers-fixture");
  await page.addScriptTag({ path: ".next-e2e/transfers-ui.js" });
  await expect(
    page.getByRole("heading", { name: "Traslados", exact: true }),
  ).toBeVisible();
  return posted;
}
for (const viewport of [
  { width: 600, height: 960 },
  { width: 1024, height: 768 },
])
  test(`clear units and form at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    const posted = await mount(page);
    await expect(
      page.getByText("No hay traslados pendientes", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Página siguiente" }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("group", { name: "Origen seleccionado", exact: true }),
    ).toContainText("Depósito principal");
    await expect(
      page.getByRole("combobox", { name: "Origen", exact: true }),
    ).toHaveCount(0);
    await page
      .getByRole("combobox", { name: "Destino", exact: true })
      .selectOption(bar);
    await page.getByRole("combobox", { name: "Artículo", exact: true }).click();
    await page.getByRole("option", { name: "Leche", exact: true }).click();
    await page
      .getByRole("textbox", { name: "Cantidad (litros)", exact: true })
      .fill("10");
    await page
      .getByRole("textbox", { name: "Motivo", exact: true })
      .fill("Reposición de la mañana");
    const submit = page.getByRole("button", {
      name: "Reservar traslado",
      exact: true,
    });
    const [amountBox, motiveBox, buttonBox] = await Promise.all([
      page
        .getByRole("textbox", { name: "Cantidad (litros)", exact: true })
        .boundingBox(),
      page.getByRole("textbox", { name: "Motivo", exact: true }).boundingBox(),
      submit.boundingBox(),
    ]);
    expect(amountBox?.height).toBeGreaterThanOrEqual(48);
    expect(buttonBox?.height).toBeGreaterThanOrEqual(48);
    expect(buttonBox!.y).toBeGreaterThanOrEqual(
      motiveBox!.y + motiveBox!.height,
    );
    if (viewport.width >= 640) {
      const from = await page
        .getByRole("group", { name: "Origen seleccionado", exact: true })
        .boundingBox();
      const to = await page
        .getByRole("combobox", { name: "Destino", exact: true })
        .boundingBox();
      expect(from!.y).toBe(to!.y);
    }
    await page.screenshot({
      path: `.next-e2e/transfers-milk-${viewport.width}.png`,
      fullPage: true,
    });
    await submit.click();
    await expect.poll(() => posted.length).toBe(1);
    expect(posted[0].body.originLocationId).toBe(depot);
    expect(posted[0].body.demands).toEqual([
      { itemId: milk, quantity: "10000.000000" },
    ]);
    await page.getByRole("combobox", { name: "Artículo", exact: true }).click();
    await page
      .getByRole("option", { name: "Jamón cocido", exact: true })
      .click();
    await expect(
      page.getByRole("textbox", { name: "Cantidad (kilos)", exact: true }),
    ).toHaveValue("");
    await page
      .getByRole("textbox", { name: "Cantidad (kilos)", exact: true })
      .fill("2,5");
    await submit.click();
    await expect.poll(() => posted.length).toBe(2);
    expect(posted[1].body.demands).toEqual([
      { itemId: ham, quantity: "2500.000000" },
    ]);
    await page.getByRole("combobox", { name: "Artículo", exact: true }).click();
    await page
      .getByRole("option", { name: "Vasos descartables", exact: true })
      .click();
    await expect(
      page.getByRole("textbox", { name: "Cantidad (unidades)", exact: true }),
    ).toHaveValue("");
    await page
      .getByRole("textbox", { name: "Cantidad (unidades)", exact: true })
      .fill("50");
    await submit.click();
    await expect.poll(() => posted.length).toBe(3);
    expect(posted[2].body.demands).toEqual([
      { itemId: cups, quantity: "50.000000" },
    ]);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: `.next-e2e/transfers-${viewport.width}.png`,
      fullPage: true,
    });
  });
test("partial receipt uses litres and rejects more than remaining before submitting", async ({
  page,
}) => {
  const posted = await mount(page, { transit: true });
  await expect(page.getByText("8 l", { exact: true })).toBeVisible();
  await page
    .getByRole("textbox", { name: "Cantidad recibida (litros)", exact: true })
    .fill("9");
  await page
    .getByRole("button", { name: "Registrar recepción", exact: true })
    .click();
  await expect(
    page.getByText("La cantidad supera lo pendiente.", { exact: true }),
  ).toBeVisible();
  expect(posted).toHaveLength(0);
  await page
    .getByRole("textbox", { name: "Cantidad recibida (litros)", exact: true })
    .fill("2,5");
  await page
    .getByRole("button", { name: "Registrar recepción", exact: true })
    .click();
  await expect.poll(() => posted.length).toBe(1);
  expect(posted[0].body.lines).toEqual([
    { allocationId: milk, quantity: "2500.000000" },
  ]);
});
test("custom origin clears an identical destination and can return to the main depot", async ({
  page,
}) => {
  const posted = await mount(page);
  await expect(
    page.getByRole("group", { name: "Origen seleccionado", exact: true }),
  ).toContainText("Depósito principal");
  await page
    .getByRole("combobox", { name: "Destino", exact: true })
    .selectOption(bar);
  await page
    .getByRole("button", { name: "Cambiar origen", exact: true })
    .click();
  await page
    .getByRole("combobox", { name: "Origen", exact: true })
    .selectOption(bar);
  await expect(
    page.getByRole("combobox", { name: "Destino", exact: true }),
  ).toHaveValue("");
  await expect(
    page.getByRole("group", { name: "Origen seleccionado", exact: true }),
  ).toContainText("Barra");
  await page
    .getByRole("combobox", { name: "Destino", exact: true })
    .selectOption(depot);
  await page.getByRole("combobox", { name: "Artículo", exact: true }).click();
  await page.getByRole("option", { name: "Leche", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Cantidad (litros)", exact: true })
    .fill("2");
  await page
    .getByRole("textbox", { name: "Motivo", exact: true })
    .fill("Devolución a depósito");
  await page
    .getByRole("button", { name: "Reservar traslado", exact: true })
    .click();
  await expect.poll(() => posted.length).toBe(1);
  expect(posted[0].body).toMatchObject({
    originLocationId: bar,
    destinationLocationId: depot,
  });
  await expect(
    page.getByRole("group", { name: "Origen seleccionado", exact: true }),
  ).toContainText("Barra");
  await page
    .getByRole("button", { name: "Cambiar origen", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Usar depósito principal", exact: true })
    .click();
  await expect(
    page.getByRole("group", { name: "Origen seleccionado", exact: true }),
  ).toContainText("Depósito principal");
  await expect(
    page.getByRole("combobox", { name: "Destino", exact: true }),
  ).toHaveValue("");
});
test("a branch without a main depot requires an explicit origin", async ({
  page,
}) => {
  await mount(page, { noDepot: true });
  await expect(
    page.getByRole("combobox", { name: "Origen", exact: true }),
  ).toHaveValue("");
  await expect(
    page.getByRole("button", { name: "Reservar traslado", exact: true }),
  ).toBeDisabled();
  await page
    .getByRole("combobox", { name: "Origen", exact: true })
    .selectOption(bar);
  await expect(
    page.getByRole("group", { name: "Origen seleccionado", exact: true }),
  ).toContainText("Barra");
});
test("pagination identifies the page and pending transfers", async ({
  page,
}) => {
  await mount(page, { paginated: true });
  await expect(page.getByText("Página 1", { exact: true })).toBeVisible();
  await page
    .getByRole("button", { name: "Página siguiente", exact: true })
    .click();
  await expect(page.getByText("Página 2", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Página anterior", exact: true }),
  ).toBeEnabled();
});
test("fractional canonical remainder can be fully received in litres", async ({
  page,
}) => {
  const posted = await mount(page, { tiny: true });
  await expect(
    page.getByText("0,000000001 l", { exact: true }).first(),
  ).toBeVisible();
  await page
    .getByRole("textbox", { name: "Cantidad recibida (litros)", exact: true })
    .fill("0,000000001");
  await page
    .getByRole("button", { name: "Registrar recepción", exact: true })
    .click();
  await expect.poll(() => posted.length).toBe(1);
  expect(posted[0].body.lines).toEqual([
    { allocationId: milk, quantity: "0.000001" },
  ]);
});
test("resolved history retains received quantities and resolved differences", async ({
  page,
}) => {
  await mount(page, { resolved: true });
  await page
    .getByRole("combobox", { name: "Ver traslados" })
    .selectOption("history");
  await expect(page.getByText("6 l", { exact: true })).toBeVisible();
  await expect(page.getByText("4 l", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Registrar recepción", exact: true }),
  ).toHaveCount(0);
});
