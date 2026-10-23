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
const kitchen = "99999999-9999-4999-8999-999999999999";
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
    ambiguous?: boolean;
    failOnce?: boolean;
    abortOnce?: boolean;
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
      if (url.pathname === "/api/transfers/batch") {
        if (options.abortOnce && posted.length === 1) return r.abort("failed");
        if (options.failOnce && posted.length === 1)
          return r.fulfill({
            status: 409,
            json: { error: "Falta stock para el traslado completo." },
          });
        return r.fulfill({
          json: {
            result: {
              transfers: [
                { id: order, revision: 2, destinationLocationId: bar },
              ],
            },
          },
        });
      }
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
                { id: kitchen, name: "Cocina", code: "COCINA" },
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
            {
              id: kitchen,
              name: "Cocina",
              branchName: "Kybo",
              branchId: branch,
            },
          ],
          destinationPolicies: [
            { itemId: milk, locationId: bar },
            { itemId: ham, locationId: kitchen },
            { itemId: cups, locationId: bar },
            ...(options.ambiguous
              ? [{ itemId: milk, locationId: kitchen }]
              : []),
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
async function addMaterial(
  page: import("@playwright/test").Page,
  name: string,
  unit: string,
  amount: string,
  enter = false,
) {
  await page.getByRole("combobox", { name: "Artículo", exact: true }).click();
  await page.getByRole("option", { name, exact: true }).click();
  const input = page.getByRole("textbox", {
    name: `Cantidad (${unit})`,
    exact: true,
  });
  await input.fill(amount);
  if (enter) await input.press("Enter");
  else
    await page
      .getByRole("button", { name: "Agregar insumo", exact: true })
      .click();
}
const draftRow = (page: import("@playwright/test").Page, name: string) =>
  page.getByRole("group", { name: `Insumo: ${name}`, exact: true });
const confirm = (page: import("@playwright/test").Page) =>
  page.getByRole("button", { name: "Confirmar traslado", exact: true });
async function morning(page: import("@playwright/test").Page) {
  await page
    .getByRole("combobox", { name: "Motivo", exact: true })
    .selectOption("Reposición para turno de la mañana");
}
for (const viewport of [
  { width: 600, height: 960 },
  { width: 1024, height: 768 },
]) {
  test(`drafts multiple materials and destinations before a single confirmation at ${viewport.width}px`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    const posted = await mount(page);
    await expect(
      page.getByRole("group", { name: "Origen seleccionado", exact: true }),
    ).toContainText("Depósito principal");
    await expect(confirm(page)).toBeDisabled();
    await addMaterial(page, "Leche", "litros", "10", true);
    await addMaterial(page, "Jamón cocido", "kilos", "2,5");
    await addMaterial(page, "Vasos descartables", "unidades", "50");
    await addMaterial(page, "Leche", "litros", "2,5");
    expect(posted).toHaveLength(0);
    await expect(draftRow(page, "Leche").getByRole("textbox")).toHaveValue(
      "12,5",
    );
    await expect(draftRow(page, "Leche").getByRole("combobox")).toHaveValue(
      bar,
    );
    await expect(
      draftRow(page, "Jamón cocido").getByRole("combobox"),
    ).toHaveValue(kitchen);
    await draftRow(page, "Leche").getByRole("textbox").fill("11,5");
    await page
      .getByRole("button", { name: "Quitar Vasos descartables", exact: true })
      .click();
    await expect(draftRow(page, "Vasos descartables")).toHaveCount(0);
    await morning(page);
    expect((await confirm(page).boundingBox())!.height).toBeGreaterThanOrEqual(
      48,
    );
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: `.next-e2e/transfers-batch-${viewport.width}.png`,
      fullPage: true,
    });
    await confirm(page).click();
    await expect.poll(() => posted.length).toBe(1);
    expect(posted[0]).toMatchObject({
      url: "/api/transfers/batch",
      body: {
        originLocationId: depot,
        reason: "Reposición para turno de la mañana",
        lines: [
          {
            itemId: milk,
            destinationLocationId: bar,
            quantity: "11500.000000",
          },
          {
            itemId: ham,
            destinationLocationId: kitchen,
            quantity: "2500.000000",
          },
        ],
      },
    });
    await expect(draftRow(page, "Leche")).toHaveCount(0);
    await expect(confirm(page)).toBeDisabled();
    await expect(
      page.getByText("Traslado confirmado.", { exact: true }),
    ).toBeVisible();
  });
}
test("ambiguous minimums require an explicit destination for that material", async ({
  page,
}) => {
  const posted = await mount(page, { ambiguous: true });
  await addMaterial(page, "Leche", "litros", "1");
  const destination = draftRow(page, "Leche").getByRole("combobox");
  await expect(destination).toHaveValue("");
  await morning(page);
  await confirm(page).click();
  await expect(destination).toBeFocused();
  expect(posted).toHaveLength(0);
  await destination.selectOption(kitchen);
  await confirm(page).click();
  await expect.poll(() => posted.length).toBe(1);
  expect(posted[0].body.lines).toEqual([
    { itemId: milk, destinationLocationId: kitchen, quantity: "1000.000000" },
  ]);
});
test("changing origin retains the list and clears a destination equal to the new origin", async ({
  page,
}) => {
  const posted = await mount(page);
  await addMaterial(page, "Leche", "litros", "2");
  await page
    .getByRole("button", { name: "Cambiar origen", exact: true })
    .click();
  await page
    .getByRole("combobox", { name: "Origen", exact: true })
    .selectOption(bar);
  const row = draftRow(page, "Leche");
  await expect(row.getByRole("textbox")).toHaveValue("2");
  await expect(row.getByRole("combobox")).toHaveValue("");
  await row.getByRole("combobox").selectOption(depot);
  await morning(page);
  await confirm(page).click();
  await expect.poll(() => posted.length).toBe(1);
  expect(posted[0].body).toMatchObject({
    originLocationId: bar,
    lines: [
      { itemId: milk, destinationLocationId: depot, quantity: "2000.000000" },
    ],
  });
  await page
    .getByRole("button", { name: "Cambiar origen", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Usar depósito principal", exact: true })
    .click();
  await expect(
    page.getByRole("group", { name: "Origen seleccionado", exact: true }),
  ).toContainText("Depósito principal");
});
test("other reason requires meaningful clarification and presets do not reuse it", async ({
  page,
}) => {
  const posted = await mount(page);
  await addMaterial(page, "Leche", "litros", "1");
  const reason = page.getByRole("combobox", { name: "Motivo", exact: true });
  await reason.selectOption("Otro motivo");
  const detail = page.getByRole("textbox", { name: "Aclaración", exact: true });
  await confirm(page).click();
  await expect(detail).toBeFocused();
  expect(posted).toHaveLength(0);
  await detail.fill("   ");
  await confirm(page).click();
  await expect(
    page.getByText("Escribí la aclaración para el otro motivo.", {
      exact: true,
    }),
  ).toBeVisible();
  expect(posted).toHaveLength(0);
  await detail.fill("  Reposición por rotura de un envase  ");
  await confirm(page).click();
  await expect.poll(() => posted.length).toBe(1);
  expect(posted[0].body.reason).toBe(
    "Otro motivo: Reposición por rotura de un envase",
  );
  for (const preset of [
    "Reposición para turno de la tarde",
    "Reposición atrasada",
    "Reposición extra por mayor demanda",
  ]) {
    await reason.selectOption(preset);
    await expect(detail).toHaveCount(0);
    await addMaterial(page, "Leche", "litros", "1");
    await confirm(page).click();
    await expect.poll(() => posted.at(-1)?.body.reason).toBe(preset);
  }
  await reason.selectOption("Otro motivo");
  await expect(detail).toHaveValue("");
});
test("a stock rejection preserves every row for correction", async ({
  page,
}) => {
  const posted = await mount(page, { failOnce: true });
  await addMaterial(page, "Leche", "litros", "10");
  await morning(page);
  await confirm(page).click();
  await expect(
    page.getByText("Falta stock para el traslado completo.", { exact: true }),
  ).toBeVisible();
  await expect(draftRow(page, "Leche").getByRole("textbox")).toHaveValue("10");
  await draftRow(page, "Leche").getByRole("textbox").fill("2");
  await confirm(page).click();
  await expect.poll(() => posted.length).toBe(2);
  expect(posted[1].body.lines).toEqual([
    { itemId: milk, destinationLocationId: bar, quantity: "2000.000000" },
  ]);
  await expect(draftRow(page, "Leche")).toHaveCount(0);
});
test("a lost response retries exactly the same batch", async ({ page }) => {
  const posted = await mount(page, { abortOnce: true });
  await addMaterial(page, "Leche", "litros", "1");
  await morning(page);
  await confirm(page).click();
  const retry = page.getByRole("button", {
    name: "Reintentar confirmación",
    exact: true,
  });
  await expect(retry).toBeVisible();
  await expect(draftRow(page, "Leche")).toBeVisible();
  await expect(confirm(page)).toBeDisabled();
  await retry.click();
  await expect.poll(() => posted.length).toBe(2);
  expect(posted[1]).toEqual(posted[0]);
  await expect(draftRow(page, "Leche")).toHaveCount(0);
});
test("an unfinished editor cannot be omitted from the confirmation", async ({
  page,
}) => {
  const posted = await mount(page);
  await addMaterial(page, "Leche", "litros", "1");
  await morning(page);
  await page.getByRole("combobox", { name: "Artículo", exact: true }).click();
  await page.getByRole("option", { name: "Jamón cocido", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Cantidad (kilos)", exact: true })
    .fill("2");
  await confirm(page).click();
  await expect(
    page.getByText(
      "Agregá el insumo que estás cargando a la lista antes de confirmar.",
      { exact: true },
    ),
  ).toBeVisible();
  expect(posted).toHaveLength(0);
  await page
    .getByRole("button", { name: "Agregar insumo", exact: true })
    .click();
  await confirm(page).click();
  await expect.poll(() => posted.length).toBe(1);
  expect(posted[0].body.lines).toHaveLength(2);
});
test("acting on an existing reservation does not clear the draft", async ({
  page,
}) => {
  const posted = await mount(page, { paginated: true });
  await addMaterial(page, "Leche", "litros", "1");
  await page
    .getByRole("button", { name: "Anular reserva", exact: true })
    .click();
  await expect.poll(() => posted.length).toBe(1);
  expect(posted[0].url).toBe(`/api/transfers/${order}/cancel`);
  await expect(draftRow(page, "Leche").getByRole("textbox")).toHaveValue("1");
});
test("a branch without a main depot requires an explicit origin", async ({
  page,
}) => {
  await mount(page, { noDepot: true });
  await expect(
    page.getByRole("combobox", { name: "Origen", exact: true }),
  ).toHaveValue("");
  await expect(confirm(page)).toBeDisabled();
  await page
    .getByRole("combobox", { name: "Origen", exact: true })
    .selectOption(bar);
  await expect(
    page.getByRole("group", { name: "Origen seleccionado", exact: true }),
  ).toContainText("Barra");
});
test("existing partial receipt still uses litres and validates the remaining quantity", async ({
  page,
}) => {
  const posted = await mount(page, { transit: true });
  await expect(page.getByText("8 l", { exact: true })).toBeVisible();
  const amount = page.getByRole("textbox", {
    name: "Cantidad recibida (litros)",
    exact: true,
  });
  await amount.fill("9");
  await page
    .getByRole("button", { name: "Registrar recepción", exact: true })
    .click();
  await expect(
    page.getByText("La cantidad supera lo pendiente.", { exact: true }),
  ).toBeVisible();
  expect(posted).toHaveLength(0);
  await amount.fill("2,5");
  await page
    .getByRole("button", { name: "Registrar recepción", exact: true })
    .click();
  await expect.poll(() => posted.length).toBe(1);
  expect(posted[0].body.lines).toEqual([
    { allocationId: milk, quantity: "2500.000000" },
  ]);
});
test("pagination identifies pages and resolved history retains received quantities", async ({
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
});
