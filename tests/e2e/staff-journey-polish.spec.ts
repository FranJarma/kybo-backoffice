import { test, expect, type Page } from "@playwright/test";
import { createRequire } from "node:module";
import { readFile, mkdir } from "node:fs/promises";
const require = createRequire(import.meta.url);
const bundle = ".next-e2e/staff-journey-polish.js";
let css = "";
test.beforeAll(async () => {
  test.setTimeout(120_000);
  await createRequire(require.resolve("tsx"))("esbuild").build({
    entryPoints: ["tests/helpers/staff-journeys-ui.tsx"],
    outfile: bundle,
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
  css += await readFile(bundle.replace(/\.js$/, ".css"), "utf8");
});

const id = "10000000-0000-4000-8000-000000000001";
const order = {
  id,
  revision: 2,
  state: "confirmed",
  name: "Perlas cocidas",
  baseUnit: "g",
  outputItemId: "pearls",
  result: null,
  plannedQuantity: "920.000000",
  actualQuantity: null,
  assignedTo: "employee",
  assignee: "Personal de prueba",
  scheduledFor: null,
  notes: null,
  location: "Depósito principal",
  preparation: null,
  events: [],
  lots: [],
  components: [
    {
      itemId: "raw",
      name: "Perlas crudas",
      baseUnit: "g",
      reserved: "460.000000",
      untracked: false,
    },
  ],
  difference: null as null | {
    actualQuantity: string;
    reason: string;
    revision: number;
    reportedBy: string;
    reportedAt: string;
  },
};
async function fixture(page: Page, view = "production-desktop") {
  let rows = [{ ...order }];
  let fail = false;
  let gets = 0;
  const posted: unknown[] = [];
  await page.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === "/__polish")
      return route.fulfill({
        contentType: "text/html",
        body: `<html lang="es"><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style></head><body><div id="root"></div></body></html>`,
      });
    if (route.request().method() === "POST") {
      posted.push(route.request().postDataJSON());
      return route.fulfill({ json: { result: { id, revision: 4 } } });
    }
    if (url.pathname === "/api/production/orders") {
      gets++;
      return fail
        ? route.fulfill({
            status: 503,
            json: { error: "Sin conexión con Producción" },
          })
        : route.fulfill({ json: { rows, hasMore: false } });
    }
    if (url.pathname === "/api/production/assignees")
      return route.fulfill({
        json: [{ id: "employee", name: "Personal de prueba" }],
      });
    if (url.pathname === "/api/preparation") {
      const now = new Date().toISOString();
      const timing = {
        waitSeconds: 0,
        prepSeconds: 0,
        handoffSeconds: 0,
        totalSeconds: 0,
      };
      return route.fulfill({
        json: {
          rows: [
            {
              id,
              revision: 1,
              orderId: "order",
              saleId: "sale",
              saleNumber: 42,
              sequence: 1,
              locatorNumber: 7,
              origin: "counter",
              channel: "counter",
              tableName: null,
              externalId: null,
              fulfillment: "takeaway",
              customerName: "Ana",
              notes: "Entregar las tres bebidas juntas",
              saleCancelled: false,
              stationId: "bar",
              stationName: "Barra",
              status: "pending",
              assigneeId: null,
              assigneeName: null,
              enqueuedAt: now,
              startedAt: null,
              readyAt: null,
              deliveredAt: null,
              cancelledAt: null,
              siblings: [],
              timing,
              orderTiming: timing,
              lines: [
                {
                  id: "line",
                  name: "Kybo Tea",
                  quantity: 3,
                  notes: "Sin hielo",
                  modifiers: [
                    {
                      groupName: "Extras",
                      optionName: "Perlas explosivas",
                      count: 2,
                      instruction: "Agregar al final",
                    },
                  ],
                },
              ],
            },
          ],
          total: 1,
          offset: 0,
          counts: {
            pending: 1,
            preparing: 0,
            ready: 0,
            delivered: 0,
            cancelled: 0,
          },
          serverNow: now,
          stations: [],
          capabilities: { deliver: false },
        },
      });
    }
    if (url.pathname === "/api/cash/status")
      return route.fulfill({
        json: {
          available: true,
          activated: true,
          open: false,
          canOpen: true,
          actorId: "employee",
        },
      });
    if (url.pathname === "/api/sales/tables")
      return route.fulfill({ json: [] });
    if (url.pathname === "/api/pickup")
      return route.fulfill({
        json: { count: 16, occupied: [], publicPath: "/queue" },
      });
    if (url.pathname === "/api/sales/lookup") {
      const products = [
        "Kybo Tea",
        "Taro Iced Latte",
        "Matcha",
        "Coffee Iced Latte",
        "Tropical Matcha",
        "Red Matcha",
      ];
      return route.fulfill({
        json:
          url.searchParams.get("kind") === "products"
            ? {
                rows: products.map((name, i) => ({
                  id: String(i),
                  name,
                  price: "5000.00",
                  configured: true,
                  vatPending: false,
                  kind: "simple",
                })),
                total: products.length,
                categories: [{ id: "drinks", name: "Bebidas" }],
              }
            : { rows: [], total: 0 },
      });
    }
    return route.abort(); // All services are isolated; no real business operations.
  });
  await page.goto(`/__polish?view=${view}`);
  await page.addScriptTag({ path: bundle });
  return {
    setRows(value: typeof rows) {
      rows = value;
    },
    fail(value: boolean) {
      fail = value;
    },
    gets: () => gets,
    posted,
  };
}

test("la PC recibe asignaciones y diferencias automáticamente sin desmontar un borrador", async ({
  page,
}) => {
  await page.clock.install();
  const data = await fixture(page);
  const actual = page.getByLabel("Producción obtenida (g)");
  await expect(actual).toHaveValue("920");
  await actual.fill("870");
  data.setRows([
    {
      ...order,
      revision: 3,
      difference: {
        actualQuantity: "850.000000",
        reason: "Derrame en depósito",
        revision: 3,
        reportedBy: "employee",
        reportedAt: new Date().toISOString(),
      },
    },
    {
      ...order,
      id: "20000000-0000-4000-8000-000000000002",
      name: "Waffles de chipá",
      state: "planned",
    },
  ]);
  await page.clock.runFor(10_100);
  await expect(
    page.getByRole("heading", { name: /Waffles de chipá/ }),
  ).toBeVisible();
  await expect(actual).toHaveValue("870");
  await expect(
    page.getByText("Derrame en depósito", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Finalizar producción", exact: true }),
  ).toBeDisabled();
  await page
    .getByRole("button", {
      name: "Revisar cambios y descartar este borrador",
      exact: true,
    })
    .click();
  await expect(actual).toHaveValue("850");
  await expect(
    page.getByRole("button", { name: "Finalizar producción", exact: true }),
  ).toBeEnabled();
  expect(data.posted).toHaveLength(0);
  await mkdir(".next-e2e/staff-journey-polish", { recursive: true });
  await page.screenshot({
    path: ".next-e2e/staff-journey-polish/production-desktop.png",
    fullPage: true,
  });
});

test("un fallo de actualización conserva los datos, bloquea el envío y permite recuperar sin perder el borrador", async ({
  page,
}) => {
  await page.clock.install();
  const data = await fixture(page);
  const actual = page.getByLabel("Producción obtenida (g)");
  await expect(actual).toBeEnabled();
  await actual.fill("870");
  data.fail(true);
  await page.clock.runFor(10_100);
  await expect(actual).toHaveValue("870");
  await expect(
    page.getByRole("button", { name: "Finalizar producción", exact: true }),
  ).toBeDisabled();
  data.fail(false);
  await page.getByRole("button", { name: "Actualizar", exact: true }).click();
  await expect(actual).toBeEnabled();
  await expect(actual).toHaveValue("870");
  expect(data.posted).toHaveLength(0);
});

test("una orden que sale de la lista conserva el borrador y no permite enviar cantidades viejas", async ({
  page,
}) => {
  await page.clock.install();
  const data = await fixture(page);
  const actual = page.getByLabel("Producción obtenida (g)");
  await actual.fill("870");
  data.setRows([]);
  await page.clock.runFor(10_100);
  await expect(actual).toHaveValue("870");
  await expect(
    page.getByRole("button", { name: "Finalizar producción", exact: true }),
  ).toBeDisabled();
  await expect(page.getByText(/Ya no está en esta lista/)).toBeVisible();
  expect(data.posted).toHaveLength(0);
});

test("volver a un filtro conserva la orden editada aunque haya salido de esa lista", async ({
  page,
}) => {
  const data = await fixture(page);
  const actual = page.getByLabel("Producción obtenida (g)");
  await actual.fill("870");
  await page.getByLabel("Solo mis tareas", { exact: true }).check();
  await expect.poll(data.gets).toBeGreaterThanOrEqual(2);
  data.setRows([]);
  await page.getByLabel("Solo mis tareas", { exact: true }).uncheck();
  await expect.poll(data.gets).toBeGreaterThanOrEqual(3);
  await expect(actual).toBeVisible();
  await expect(actual).toHaveValue("870");
  await expect(page.getByText(/Ya no está en esta lista/)).toBeVisible();
});

test("pausa las consultas al ocultar la pestaña y actualiza al volver", async ({
  page,
}) => {
  await page.clock.install();
  const data = await fixture(page);
  await expect(page.getByLabel("Producción obtenida (g)")).toBeEnabled();
  const initial = data.gets();
  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", {
      configurable: true,
      get: () => true,
    });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await page.clock.runFor(20_100);
  expect(data.gets()).toBe(initial);
  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", {
      configurable: true,
      get: () => false,
    });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await expect.poll(data.gets).toBe(initial + 1);
});

test("un fallo inicial nunca se presenta como una cola vacía", async ({
  page,
}) => {
  await fixture(page);
  await page.route("**/api/production/orders?**", (route) =>
    route.fulfill({
      status: 503,
      json: { error: "Sin conexión con Producción" },
    }),
  );
  await page.reload();
  await page.addScriptTag({ path: bundle });
  await expect(
    page.getByText("Sin conexión con Producción", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("No hay producciones pendientes", { exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Actualizar", exact: true }),
  ).toBeEnabled();
});

for (const width of [390, 1440])
  test(`la comanda distingue extras por unidad y notas del pedido a ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 950 });
    await fixture(page, "board");
    const card = page.getByTestId(`prep-task-${id}`);
    await expect(
      card.getByText("2 por unidad · 6 en total", { exact: true }),
    ).toBeVisible();
    await expect(
      card.getByText("Nota del pedido", { exact: true }),
    ).toBeVisible();
    await expect(card.getByText("Sin hielo", { exact: true })).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    expect(
      (await card
        .getByRole("button", { name: "Empezar", exact: true })
        .boundingBox())!.height,
    ).toBeGreaterThanOrEqual(48);
    await mkdir(".next-e2e/staff-journey-polish", { recursive: true });
    await page.screenshot({
      path: `.next-e2e/staff-journey-polish/comandas-${width}.png`,
      fullPage: true,
    });
  });

test("el POS de tablet muestra dos filas de productos manteniendo áreas táctiles de 48px", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1024, height: 768 });
  await fixture(page, "pos");
  const first = page.getByRole("button", {
    name: "Agregar Kybo Tea",
    exact: true,
  });
  const secondRow = page.getByRole("button", {
    name: "Agregar Coffee Iced Latte",
    exact: true,
  });
  await expect(first).toBeVisible();
  const box = await secondRow.boundingBox();
  expect(box!.y + box!.height).toBeLessThan(768);
  for (const name of ["Mostrador", "Mesa", "Para llevar", "Herramientas"]) {
    const button = page.getByRole("button", { name, exact: true });
    expect((await button.boundingBox())!.height).toBeGreaterThanOrEqual(48);
  }
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await mkdir(".next-e2e/staff-journey-polish", { recursive: true });
  await page.screenshot({
    path: ".next-e2e/staff-journey-polish/pos-1024.png",
    fullPage: true,
  });
});
