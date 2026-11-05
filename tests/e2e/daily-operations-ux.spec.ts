import { expect, test, type Page } from "@playwright/test";
import { createRequire } from "node:module";
import { readFile, mkdir } from "node:fs/promises";
import type { DailySnapshot, TaskRow } from "@/modules/daily-operations/types";
const require = createRequire(import.meta.url);
const bundle = ".next-e2e/daily-ux.js";
let css = "";
test.beforeAll(async () => {
  test.setTimeout(120_000);
  await createRequire(require.resolve("tsx"))("esbuild").build({
    entryPoints: ["tests/helpers/daily-operations-ui.tsx"],
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
});
const task: TaskRow = {
  id: "11111111-1111-4111-8111-111111111111",
  revision: 1,
  kind: "transfer",
  state: "pending",
  urgency: "critical",
  title: "Reponer vasos descartables",
  reason: "El disponible en Barra está por debajo del mínimo.",
  quantity: "100.000000",
  unit: "unit",
  itemId: "cups",
  locationId: "bar",
  locationName: "Barra",
  originLocationId: "depot",
  originName: "Depósito principal",
  assignedTo: null,
  assignedToName: null,
  assigneeUnavailable: false,
  materials: [],
  dueAt: "2026-11-02T20:00:00Z",
  documentId: null,
  documentRevision: null,
  createdAt: "2026-11-02T12:00:00Z",
  updatedAt: "2026-11-02T12:00:00Z",
  dependencyIds: [],
};
function snapshot(rows: TaskRow[]): DailySnapshot {
  return {
    asOf: new Date().toISOString(),
    businessDate: "2026-11-03",
    timeZone: "America/Argentina/Buenos_Aires",
    canManage: true,
    tasks: rows,
    total: rows.length,
    configurationWarnings: [],
    summary: {
      critical: rows.filter((t) => t.urgency === "critical").length,
      high: rows.filter((t) => t.urgency === "high").length,
      scheduled: rows.filter((t) => t.urgency === "scheduled").length,
    },
    people: [
      { id: "employee", name: "Verónica Ramos" },
      { id: "ana", name: "Ana" },
    ],
    locations: [
      { id: "bar", name: "Barra" },
      { id: "kitchen", name: "Cocina" },
      { id: "depot", name: "Depósito principal" },
    ],
    stock: [],
  };
}
async function fixture(page: Page) {
  let rows = [
    task,
    {
      ...task,
      id: "22222222-2222-4222-8222-222222222222",
      kind: "production" as const,
      urgency: "high" as const,
      title: "Preparar perlas de tapioca",
      locationId: "depot",
      locationName: "Depósito principal",
      originName: null,
      assignedTo: "employee",
      assignedToName: "Verónica Ramos",
      quantity: "920.000000",
      unit: "g",
      documentId: "production",
      state: "in_progress" as const,
    },
  ];
  let held: Promise<void> | null = null;
  let fail = false;
  let reconciles = 0;
  const reads: string[] = [];
  const posts: Record<string, unknown>[] = [];
  await page.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === "/__daily-ux")
      return route.fulfill({
        contentType: "text/html",
        body: `<html lang="es"><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style></head><body></body></html>`,
      });
    if (url.pathname.endsWith("/reconcile")) {
      reconciles++;
      return route.fulfill({ json: { result: { created: 0 } } });
    }
    if (route.request().method() === "POST") {
      const body = route.request().postDataJSON();
      posts.push(body);
      if (body.action === "assign")
        rows = rows.map((t) =>
          t.id === task.id
            ? {
                ...t,
                assignedTo: String(body.assignedTo),
                assignedToName: "Ana",
                revision: t.revision + 1,
              }
            : t,
        );
      return route.fulfill({ json: { result: { revision: 2 } } });
    }
    if (url.pathname === "/api/operations/day") {
      reads.push(url.search);
      const captured = rows.filter(
        (t) =>
          !url.searchParams.get("locationId") ||
          t.locationId === url.searchParams.get("locationId"),
      );
      if (held) await held;
      return fail
        ? route.fulfill({
            status: 503,
            json: { error: "No pudimos consultar las tareas." },
          })
        : route.fulfill({ json: snapshot(captured) });
    }
    return route.abort(); // No request can reach the real application or database.
  });
  await page.goto("/__daily-ux");
  await page.addScriptTag({ path: bundle });
  await expect(page.getByText(task.title, { exact: true })).toBeVisible();
  await expect.poll(() => reconciles).toBe(1);
  return {
    reads,
    posts,
    reconciles: () => reconciles,
    setRows(value: TaskRow[]) {
      rows = value;
    },
    fail(value: boolean) {
      fail = value;
    },
    hold() {
      let release!: () => void;
      held = new Promise<void>((resolve) => {
        release = resolve;
      });
      return () => {
        held = null;
        release();
      };
    },
  };
}

test("filtrar muestra carga propia, oculta la lista anterior y no vuelve a generar tareas", async ({
  page,
}) => {
  const data = await fixture(page);
  const release = data.hold();
  await page.getByLabel("Ubicación", { exact: true }).selectOption("kitchen");
  await expect(
    page.getByText("Actualizando la vista…", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText(task.title, { exact: true })).not.toBeVisible();
  expect(data.reconciles()).toBe(1);
  release();
  await expect(
    page.getByText("No hay tareas con estos filtros", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Limpiar filtros", exact: true })
    .click();
  await expect(page.getByText(task.title, { exact: true })).toBeVisible();
  expect(data.reconciles()).toBe(1);
});

test("el error actual pausa las acciones y una consulta exitosa recupera la vista", async ({
  page,
}) => {
  const data = await fixture(page);
  data.fail(true);
  await page.getByRole("button", { name: "Actualizar", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText(
    "No pudimos consultar las tareas.",
  );
  await expect(
    page.getByRole("button").filter({ hasText: task.title }),
  ).toBeDisabled();
  data.fail(false);
  await page.getByRole("button", { name: "Actualizar", exact: true }).click();
  await expect(page.getByRole("alert")).toHaveCount(0);
  await expect(
    page.getByRole("button").filter({ hasText: task.title }),
  ).toBeEnabled();
});

test("usa Autocomplete para asignar y no conserva un responsable oculto al ver mis tareas", async ({
  page,
}) => {
  const data = await fixture(page);
  await page.getByText(task.title, { exact: true }).click();
  const input = page
    .getByRole("dialog")
    .getByRole("combobox", { name: "Responsable", exact: true });
  await input.fill("Ana");
  await page.getByRole("option", { name: "Ana", exact: true }).click();
  await page.getByRole("button", { name: "Asignar", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(data.posts).toEqual([
    expect.objectContaining({
      action: "assign",
      assignedTo: "ana",
      expectedRevision: 1,
    }),
  ]);
  const filter = page.getByRole("combobox", {
    name: "Responsable de la tarea",
    exact: true,
  });
  await filter.fill("Verónica");
  await page
    .getByRole("option", { name: "Verónica Ramos", exact: true })
    .click();
  await expect.poll(() => data.reads.at(-1)).toContain("assignedTo=employee");
  await page
    .getByLabel("Vista de tareas", { exact: true })
    .selectOption("mine");
  await expect.poll(() => data.reads.at(-1)).toContain("mine=true");
  expect(data.reads.at(-1)).not.toContain("assignedTo=");
});

test("una actualización externa no borra el impedimento y bloquea el envío antiguo", async ({
  page,
}) => {
  await page.clock.install();
  const data = await fixture(page);
  await page.getByText(task.title, { exact: true }).click();
  await page.getByText("Informar un impedimento", { exact: true }).click();
  await page
    .getByLabel("Motivo o impedimento")
    .fill("Falta un paquete de vasos");
  data.setRows([
    {
      ...task,
      revision: 2,
      assignedTo: "employee",
      assignedToName: "Verónica Ramos",
    },
  ]);
  await page.clock.runFor(60_100);
  await expect(
    page.getByText("La tarea cambió. Conservamos lo que escribiste.", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.getByLabel("Motivo o impedimento")).toHaveValue(
    "Falta un paquete de vasos",
  );
  await expect(
    page.getByRole("button", { name: "Informar bloqueo", exact: true }),
  ).toBeDisabled();
  expect(data.posts).toHaveLength(0);
});

test("el historial presenta resultados sin marcar tareas cerradas como vencidas", async ({
  page,
}) => {
  const data = await fixture(page);
  data.setRows([{ ...task, state: "done" }]);
  await page.getByRole("tab", { name: "Historial", exact: true }).click();
  await expect(page.getByText("Terminada", { exact: true })).toBeVisible();
  await expect(page.getByText("Vencida", { exact: true })).toHaveCount(0);
  await expect(
    page.getByText("Consultar resultado", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText(/Pendiente desde/)).toHaveCount(0);
});

test("si una tarea abierta desaparece de la consulta se conserva el borrador y se pausa su ejecución", async ({
  page,
}) => {
  await page.clock.install();
  const data = await fixture(page);
  await page.getByText(task.title, { exact: true }).click();
  await page.getByText("Informar un impedimento", { exact: true }).click();
  await page
    .getByLabel("Motivo o impedimento")
    .fill("Estoy revisando los paquetes");
  data.setRows([]);
  await page.clock.runFor(60_100);
  await expect(page.getByRole("dialog")).toContainText(
    "La tarea ya no aparece en esta vista",
  );
  await expect(page.getByLabel("Motivo o impedimento")).toHaveValue(
    "Estoy revisando los paquetes",
  );
  await expect(
    page.getByRole("button", { name: "Informar bloqueo", exact: true }),
  ).toBeDisabled();
  expect(data.posts).toHaveLength(0);
});

test("una respuesta vieja de un filtro no reemplaza la vista más reciente", async ({
  page,
}) => {
  await fixture(page);
  let release!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route(
    "**/api/operations/day?**locationId=bar**",
    async (route) => {
      await held;
      await route.fulfill({
        status: 503,
        json: { error: "Error de una vista anterior" },
      });
    },
  );
  await page.getByLabel("Ubicación", { exact: true }).selectOption("bar");
  await page.getByLabel("Ubicación", { exact: true }).selectOption("kitchen");
  await expect(
    page.getByText("No hay tareas con estos filtros", { exact: true }),
  ).toBeVisible();
  release();
  await expect(
    page.getByText("Error de una vista anterior", { exact: true }),
  ).toHaveCount(0);
  await expect(page.getByRole("alert")).toHaveCount(0);
});

test("la actualización de necesidades conserva el mismo envío mientras su resultado siga incierto", async ({
  page,
}) => {
  await fixture(page);
  const ids: string[] = [];
  await page.route("**/api/operations/day/reconcile", async (route) => {
    ids.push(route.request().postDataJSON().requestId);
    await route.fulfill(
      ids.length < 3
        ? {
            status: ids.length === 1 ? 503 : 403,
            json: { error: "No se confirmó la actualización" },
          }
        : { json: { result: { created: 0 } } },
    );
  });
  for (let attempt = 1; attempt <= 3; attempt++) {
    await page.getByRole("button", { name: "Actualizar", exact: true }).click();
    await expect.poll(() => ids.length).toBe(attempt);
    await expect(
      page.getByRole("button", { name: "Actualizar", exact: true }),
    ).toBeEnabled();
  }
  expect(new Set(ids).size).toBe(1);
  await expect(page.getByRole("alert")).toHaveCount(0);
});

test("un reintento sin resultado confirmado no se descarta si después se rechaza el permiso", async ({
  page,
}) => {
  const data = await fixture(page);
  let attempts = 0;
  const payloads: unknown[] = [];
  await page.route("**/api/operations/tasks/*", async (route) => {
    payloads.push(route.request().postDataJSON());
    await route.fulfill({
      status: ++attempts === 1 ? 503 : 403,
      json: { error: "No pudimos confirmar este cambio" },
    });
  });
  await page.getByText(task.title, { exact: true }).click();
  const input = page
    .getByRole("dialog")
    .getByRole("combobox", { name: "Responsable", exact: true });
  await input.fill("Ana");
  await page.getByRole("option", { name: "Ana", exact: true }).click();
  await page.getByRole("button", { name: "Asignar", exact: true }).click();
  await page
    .getByRole("button", { name: "Reintentar la misma operación", exact: true })
    .click();
  await expect(
    page.getByRole("button", {
      name: "Reintentar la misma operación",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Cerrar", exact: true }),
  ).toBeDisabled();
  expect(payloads).toHaveLength(2);
  expect(payloads[1]).toEqual(payloads[0]);
  expect(data.posts).toHaveLength(0);
});

for (const width of [390, 768, 1440])
  test(`prioridad, responsable y próximo paso legibles a ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 1000 });
    await fixture(page);
    await expect(
      page.getByText("Asignar responsable", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText("Registrar resultado de producción", { exact: true }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    const first = await page
      .getByRole("button")
      .filter({ hasText: task.title })
      .boundingBox();
    expect(first!.height).toBeGreaterThanOrEqual(48);
    await mkdir(".next-e2e/daily-ux", { recursive: true });
    await page.screenshot({
      path: `.next-e2e/daily-ux/board-${width}.png`,
      fullPage: true,
    });
  });
