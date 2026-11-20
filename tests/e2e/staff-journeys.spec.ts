import { test, expect, type Page } from "@playwright/test";
import { createRequire } from "node:module";
import { readFile, mkdir } from "node:fs/promises";
import type { PrepTask } from "@/modules/preparation/types";
const require = createRequire(import.meta.url);
const bundle = ".next-e2e/staff-journeys-ui.js";
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
  css += await readFile("src/components/cash/cash.css", "utf8");
});

const taskId = "10000000-0000-4000-8000-000000000001";
function task(status: PrepTask["status"], id = taskId): PrepTask {
  return {
    id,
    revision: 1,
    orderId: "order",
    saleId: "sale",
    saleNumber: 1,
    sequence: 1,
    locatorNumber: 3,
    origin: "counter",
    channel: "counter",
    tableName: null,
    externalId: null,
    fulfillment: "takeaway",
    customerName: "Cliente de prueba",
    notes: null,
    saleCancelled: false,
    stationId: "bar",
    stationName: "Barra",
    status,
    assigneeId: status === "pending" ? null : "employee",
    assigneeName: status === "pending" ? null : "Personal de prueba",
    enqueuedAt: new Date().toISOString(),
    startedAt: null,
    readyAt: null,
    deliveredAt: null,
    cancelledAt: null,
    lines: [
      {
        id: "line",
        name: "Kybo Tea",
        quantity: 1,
        modifiers: [],
        notes: "Sin hielo",
      },
    ],
    siblings: [],
    timing: {
      waitSeconds: 0,
      prepSeconds: 0,
      handoffSeconds: 0,
      totalSeconds: 0,
    },
    orderTiming: {
      waitSeconds: 0,
      prepSeconds: 0,
      handoffSeconds: 0,
      totalSeconds: 0,
    },
  };
}
async function fixture(
  page: Page,
  view = "board",
  rejection = 403,
  rejectReplay = false,
  control?: { revision: number },
) {
  const posted: Record<string, unknown>[] = [];
  let currentTask = task("pending");
  let difference: Record<string, unknown> | null = null;
  let revision = 2;
  await page.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === "/__staff-journeys")
      return route.fulfill({
        contentType: "text/html",
        body: `<html lang="es"><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style></head><body><div id="root"></div></body></html>`,
      });
    if (route.request().method() === "POST") {
      const body = route.request().postDataJSON();
      posted.push(body);
      if (view === "production" || view === "production-tabs") {
        difference = {
          ...body.report,
          revision: ++revision,
          reportedBy: "employee",
          reportedAt: new Date().toISOString(),
        };
        return route.fulfill({
          json: { result: { id: taskId, revision }, replayed: false },
        });
      }
      if (posted.length === 1)
        return route.fulfill({
          status: rejection,
          json: { error: "No tenés permiso para registrar este cambio." },
        });
      if (rejectReplay)
        return route.fulfill({
          status: 403,
          json: { error: "El acceso cambió después del primer intento." },
        });
      currentTask = {
        ...currentTask,
        status: "preparing",
        revision: 2,
        assigneeId: "employee",
      };
      return route.fulfill({ json: { task: currentTask, events: [] } });
    }
    if (url.pathname === "/api/preparation")
      return route.fulfill({
        json: {
          capabilities: { deliver: false },
          rows: [
            currentTask,
            task("ready", "20000000-0000-4000-8000-000000000002"),
          ],
          total: 2,
          offset: 0,
          counts: {
            pending: 1,
            preparing: 0,
            ready: 1,
            delivered: 0,
            cancelled: 0,
          },
          serverNow: new Date().toISOString(),
          stations: [],
        },
      });
    if (url.pathname === "/api/staff/work")
      return route.fulfill({
        json: {
          ready: true,
          actorId: "employee",
          branch: {
            id: "branch",
            name: "Sucursal de prueba",
            timeZone: "America/Argentina/Buenos_Aires",
          },
          serverNow: new Date().toISOString(),
          assignments: [],
          preparation: { rows: [], hasMore: false },
          production: {
            hasMore: false,
            rows: [
              {
                id: taskId,
                revision: control?.revision ?? revision,
                state: "confirmed",
                name: "Perlas cocidas",
                baseUnit: "g",
                plannedQuantity: "920.000000",
                difference,
                scheduledFor: null,
                notes: null,
                locationId: "depot",
                locationName: "Depósito principal",
                preparation: null,
                components: [],
              },
            ],
          },
        },
      });
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
    if (url.pathname === "/api/cash")
      return route.fulfill({
        json: {
          available: true,
          activated: true,
          branchId: "branch",
          branchName: "Sucursal de prueba",
          timeZone: "America/Argentina/Buenos_Aires",
          businessDate: "2026-11-03",
          capabilities: { open: true },
          settings: { closeTime: "23:00", targetFund: null, revision: 0 },
          current: null,
          selected: null,
          lastClosed: null,
          sessions: [],
          movements: [],
          pendingReviews: 0,
          totals: {
            expectedCash: "0.00",
            opening: "0.00",
            cashCollections: "0.00",
            cashRefunds: "0.00",
            expenses: "0.00",
            supplierPayments: "0.00",
            withdrawals: "0.00",
            cardTotal: "0.00",
            cardOperations: 0,
            transferTotal: "0.00",
            otherTotal: "0.00",
          },
        },
      });
    return route.abort(); // No request from these fixtures can reach a real service.
  });
  await page.goto(`/__staff-journeys?view=${view}`);
  await page.addScriptTag({ path: bundle });
  return posted;
}

test("personal preparation never offers delivery and a rejected action can be explicitly discarded", async ({
  page,
}) => {
  await fixture(page);
  await expect(
    page.getByRole("button", { name: "Empezar", exact: true }),
  ).toBeEnabled();
  await expect(
    page.getByRole("button", { name: "Entregar", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByText("La entrega se registra desde el puesto del local.", {
      exact: true,
    }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Empezar", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Empezar", exact: true }),
  ).toBeDisabled();
  await page
    .getByRole("button", { name: "Descartar envío rechazado", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Empezar", exact: true }),
  ).toBeEnabled();
});

test("an unconfirmed result survives reload and only retries the original request", async ({
  page,
}) => {
  const posted = await fixture(page, "board", 503);
  await page.getByRole("button", { name: "Empezar", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Reintentar mismo envío", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", {
      name: "Descartar envío rechazado",
      exact: true,
    }),
  ).toHaveCount(0);
  await page.reload();
  await page.addScriptTag({ path: bundle });
  await page
    .getByRole("button", { name: "Reintentar mismo envío", exact: true })
    .click();
  await expect.poll(() => posted.length).toBe(2);
  expect(posted[1]).toEqual(posted[0]);
  await expect(
    page.getByRole("button", { name: "Marcar listo", exact: true }),
  ).toBeEnabled();
});

test("opening cash stays in the current POS workspace and returns focus without losing the draft", async ({
  page,
}) => {
  await fixture(page, "opening");
  await page.getByLabel("Pedido en curso").fill("2 Kybo Tea · Cliente Ana");
  await page.getByRole("button", { name: "Abrir caja", exact: true }).click();
  await expect(
    page.getByLabel("Fondo inicial contado", { exact: true }),
  ).toBeFocused();
  await page.getByRole("button", { name: "Cancelar", exact: true }).click();
  await expect(page.getByLabel("Pedido en curso")).toHaveValue(
    "2 Kybo Tea · Cliente Ana",
  );
  await expect(
    page.getByRole("button", { name: "Abrir caja", exact: true }),
  ).toBeFocused();
  await expect(page).toHaveURL(/__staff-journeys\?view=opening$/);
});

test("a permission rejection after an uncertain replay never enables discarding the original operation", async ({
  page,
}) => {
  const posted = await fixture(page, "board", 503, true);
  await page.getByRole("button", { name: "Empezar", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Reintentar mismo envío", exact: true }),
  ).toBeVisible();
  await page.reload();
  await page.addScriptTag({ path: bundle });
  await page
    .getByRole("button", { name: "Reintentar mismo envío", exact: true })
    .click();
  await expect(
    page.getByText("El acceso cambió después del primer intento.", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", {
      name: "Descartar envío rechazado",
      exact: true,
    }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Empezar", exact: true }),
  ).toBeDisabled();
  expect(posted[1]).toEqual(posted[0]);
});

test("the payment diagnosis remains available after its notification expires", async ({
  page,
}) => {
  await page.clock.install();
  await fixture(page, "error");
  await page.clock.runFor(8500);
  await expect(page.getByRole("alert")).toHaveText(
    "El medio de pago cambió. Volvé a seleccionarlo.",
  );
});

for (const interruption of ["tab", "revision"] as const)
  test(`a production difference draft survives a ${interruption} change`, async ({
    page,
  }) => {
    const control = { revision: 2 };
    const posted = await fixture(page, "production-tabs", 403, false, control);
    await page
      .getByRole("button", { name: "Informar diferencia", exact: true })
      .click();
    await page.getByLabel("Cantidad obtenida (g)").fill("850");
    await page.getByLabel("Qué pasó").fill("Se derramó parte del preparado");
    if (interruption === "tab") {
      await page.getByRole("button", { name: /^Mis tareas/ }).click();
      await expect(page.getByLabel("Qué pasó")).not.toBeVisible();
      await page.getByRole("button", { name: /^Producción/ }).click();
    } else {
      control.revision = 3;
      const refreshed = page.waitForResponse("**/api/staff/work");
      await page.getByRole("button", { name: "Actualizar mis tareas" }).click();
      await refreshed;
      await expect(
        page.getByRole("button", { name: "Enviar al encargado" }),
      ).toBeDisabled();
      await expect(
        page.getByText(/La producción cambió mientras escribías/),
      ).toBeVisible();
    }
    await expect(page.getByLabel("Cantidad obtenida (g)")).toHaveValue("850");
    await expect(page.getByLabel("Qué pasó")).toHaveValue(
      "Se derramó parte del preparado",
    );
    expect(posted).toHaveLength(0);
    if (interruption === "revision") {
      await page.getByRole("button", { name: "Cancelar", exact: true }).click();
      await page
        .getByRole("button", { name: "Informar diferencia", exact: true })
        .click();
      await expect(page.getByLabel("Cantidad obtenida (g)")).toHaveValue("850");
      await expect(page.getByLabel("Qué pasó")).toHaveValue(
        "Se derramó parte del preparado",
      );
      await page
        .getByRole("button", { name: "Enviar al encargado", exact: true })
        .click();
      await expect.poll(() => posted.length).toBe(1);
      expect(posted[0]).toMatchObject({
        report: { expectedRevision: 3, actualQuantity: "850.000000" },
      });
    }
  });

for (const width of [390, 1024])
  test(`production reports a difference inline and waits for review at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 844 });
    const posted = await fixture(page, "production");
    await expect(
      page.getByRole("button", {
        name: "Terminar según lo previsto",
        exact: true,
      }),
    ).toBeEnabled();
    await page
      .getByRole("button", { name: "Informar diferencia", exact: true })
      .click();
    await page.getByLabel("Cantidad obtenida (g)").fill("850");
    await page.getByLabel("Qué pasó").fill("Se derramó parte del preparado");
    await page
      .getByRole("button", { name: "Enviar al encargado", exact: true })
      .click();
    await expect(
      page.getByText("Aviso enviado al encargado", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", {
        name: "Terminar según lo previsto",
        exact: true,
      }),
    ).toHaveCount(0);
    expect(posted).toHaveLength(1);
    expect(posted[0]).toMatchObject({
      report: {
        expectedRevision: 2,
        actualQuantity: "850.000000",
        reason: "Se derramó parte del preparado",
      },
    });
    expect(posted[0]).not.toHaveProperty("completion");
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await mkdir(".next-e2e/staff-journeys", { recursive: true });
    await page.screenshot({
      path: `.next-e2e/staff-journeys/production-review-${width}.png`,
      fullPage: true,
    });
  });
