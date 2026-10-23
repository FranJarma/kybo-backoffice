import { test, expect, type Page } from "@playwright/test";
import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
const require = createRequire(import.meta.url);
let css = "";
const milk = "11111111-1111-4111-8111-111111111111";
const bar = "22222222-2222-4222-8222-222222222222";
const rule = "33333333-3333-4333-8333-333333333333";
test.beforeAll(async () => {
  const { build } = createRequire(require.resolve("tsx"))("esbuild");
  await build({
    entryPoints: ["tests/helpers/replenishment-ui.tsx"],
    outfile: ".next-e2e/replenishment-ui.js",
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
test.use({ hasTouch: true, actionTimeout: 10_000 });
async function mount(
  page: Page,
  options: {
    view?: string;
    role?: string;
    existing?: boolean;
    failSave?: boolean;
    failLoad?: boolean;
  } = {},
) {
  const posted: Record<string, unknown>[] = [];
  let policies = options.existing
    ? [
        {
          id: rule,
          revision: 1,
          itemId: milk,
          itemName: "Leche",
          baseUnit: "ml",
          locationId: bar,
          locationName: "Barra",
          minimumQuantity: "1000.000000",
          targetQuantity: "3000.000000",
          preparationMinutes: null,
          enabled: true,
        },
      ]
    : [];
  await page.route("**/__replenishment-fixture?**", (r) =>
    r.fulfill({
      contentType: "text/html",
      body: `<html lang="es"><head><meta name="viewport" content="width=device-width, initial-scale=1"><style>${css}</style></head><body></body></html>`,
    }),
  );
  await page.route("**/api/**", async (r) => {
    if (r.request().method() === "POST") {
      const body = r.request().postDataJSON();
      posted.push(body);
      if (options.failSave)
        return r.fulfill({
          status: 409,
          json: { error: "La regla cambió. Actualizá e intentá de nuevo." },
        });
      policies = [
        {
          id: rule,
          revision: 2,
          itemName: "Leche",
          baseUnit: "ml",
          locationName: "Barra",
          ...body.policy,
        },
      ];
      return r.fulfill({ json: { result: { id: rule, revision: 2 } } });
    }
    if (options.failLoad)
      return r.fulfill({
        status: 503,
        json: { error: "No se pudieron consultar los mínimos." },
      });
    return r.fulfill({
      json: {
        asOf: "2026-10-23T12:00:00.000Z",
        policies,
        alerts: [],
        items: [{ id: milk, name: "Leche", baseUnit: "ml" }],
        locations: [{ id: bar, name: "Barra" }],
      },
    });
  });
  await page.goto(
    `/__replenishment-fixture?view=${options.view ?? "settings"}&role=${options.role ?? "manager"}`,
  );
  await page.addScriptTag({ path: ".next-e2e/replenishment-ui.js" });
  return posted;
}
async function fillRule(page: Page) {
  await page
    .getByRole("button", { name: "Agregar mínimo", exact: true })
    .click();
  await page.getByRole("combobox", { name: "Artículo", exact: true }).click();
  await page.getByRole("option", { name: "Leche", exact: true }).click();
  await page
    .getByRole("combobox", { name: "Ubicación", exact: true })
    .selectOption(bar);
  await page.getByRole("textbox", { name: "Mínimo (ml)" }).fill("1000");
  await page.getByRole("textbox", { name: "Objetivo (ml)" }).fill("3000");
}
test("crea una regla desde inventario y permite editarla y desactivarla en tablet", async ({
  page,
}) => {
  await page.setViewportSize({ width: 768, height: 1024 });
  const posted = await mount(page);
  await expect(
    page.getByRole("heading", { name: "Mínimos de reposición", exact: true }),
  ).toBeVisible();
  await fillRule(page);
  await page
    .getByRole("button", { name: "Guardar mínimo", exact: true })
    .click();
  await expect(
    page.getByText("Mínimo guardado.", { exact: true }),
  ).toBeVisible();
  expect(posted[0]).toMatchObject({
    requestId: expect.any(String),
    policy: {
      itemId: milk,
      locationId: bar,
      minimumQuantity: "1000",
      targetQuantity: "3000",
      enabled: true,
      preparationMinutes: null,
    },
  });
  await page
    .getByRole("button", { name: "Editar Leche en Barra", exact: true })
    .click();
  await expect(
    page.getByRole("combobox", { name: "Ubicación", exact: true }),
  ).toBeDisabled();
  await page.getByLabel("Regla activa").uncheck();
  await page
    .getByRole("button", { name: "Guardar mínimo", exact: true })
    .click();
  await expect(page.getByText("Desactivada", { exact: true })).toBeVisible();
  expect(posted[1]).toMatchObject({
    policy: { id: rule, revision: 2, enabled: false },
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await expect(
    page.getByRole("button", { name: "Agregar mínimo", exact: true }),
  ).toBeEnabled();
  await page.screenshot({
    path: ".next-e2e/replenishment-inventory-768.png",
    fullPage: true,
  });
});
test("valida el objetivo y conserva el editor si no se puede guardar", async ({
  page,
}) => {
  const posted = await mount(page, { failSave: true });
  await fillRule(page);
  await page.getByRole("textbox", { name: "Objetivo (ml)" }).fill("500");
  await page
    .getByRole("button", { name: "Guardar mínimo", exact: true })
    .click();
  await expect(
    page
      .getByRole("region", { name: /Notificaciones/ })
      .getByText(/objetivo mayor al mínimo/),
  ).toBeVisible();
  expect(posted).toHaveLength(0);
  await page.getByRole("textbox", { name: "Objetivo (ml)" }).fill("3000");
  await page
    .getByRole("button", { name: "Guardar mínimo", exact: true })
    .click();
  await expect(
    page.getByText("La regla cambió. Actualizá e intentá de nuevo.", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Mínimo (ml)" })).toHaveValue(
    "1000",
  );
  expect(posted).toHaveLength(1);
});
for (const role of ["manager", "staff"]) {
  test(`el punto de venta muestra avisos sin editor de mínimos para ${role}`, async ({
    page,
  }) => {
    const posted = await mount(page, { view: "alerts", role, existing: true });
    await page.getByRole("button", { name: /^Reposición/ }).click();
    await expect(
      page.getByText(/Dentro de los mínimos configurados/),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Configurar mínimos", exact: true }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Agregar mínimo", exact: true }),
    ).toHaveCount(0);
    await expect(page.getByRole("textbox", { name: /Mínimo/ })).toHaveCount(0);
    expect(posted).toHaveLength(0);
  });
}
test("una lectura fallida no se presenta como ausencia de reglas", async ({
  page,
}) => {
  await mount(page, { failLoad: true });
  await expect(
    page.getByText("No se pudieron consultar los mínimos.", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Todavía no hay mínimos configurados.", { exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Agregar mínimo", exact: true }),
  ).toBeDisabled();
});
