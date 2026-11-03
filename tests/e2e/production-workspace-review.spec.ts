import { expect, test, type Page, type BrowserContext } from "@playwright/test";
import type { RecipeDetail } from "@/modules/recipes/types";

test.setTimeout(90_000);
test.use({ storageState: process.env.KYBO_PRODUCTION_UX_AUTHSTATE });
test.skip(
  !process.env.E2E_EMAIL ||
    !process.env.E2E_PASSWORD ||
    process.env.KYBO_PRODUCTION_UX_FIXTURE !== "disposable-only",
  "Solo base descartable de UX de producción.",
);
let cookies: Awaited<ReturnType<BrowserContext["cookies"]>> | undefined;
async function openProduction(page: Page) {
  if (process.env.KYBO_PRODUCTION_UX_AUTHSTATE) {
    await page.goto("/kitchen/production");
    return;
  }
  if (cookies) await page.context().addCookies(cookies);
  else {
    const result = await page.request.post("/api/auth/sign-in/email", {
      headers: { Origin: new URL(process.env.PLAYWRIGHT_BASE_URL!).origin },
      data: {
        email: process.env.E2E_EMAIL,
        password: process.env.E2E_PASSWORD,
      },
    });
    expect(result.status()).toBe(200);
    cookies = await page.context().cookies();
  }
  await page.goto("/kitchen/production");
}

test("un error de historial no muestra órdenes activas y conserva los consumos y notas al volver", async ({
  page,
}) => {
  await openProduction(page);
  const note = `Orden para revisar ${crypto.randomUUID()}`;
  const list = await (
    await page.request.get("/api/recipes?kind=preparation")
  ).json();
  const recipe: RecipeDetail = await (
    await page.request.get(`/api/recipes/${list.rows[0].id}`)
  ).json();
  const people = await (
    await page.request.get("/api/production/assignees")
  ).json();
  const branch = await (await page.request.get("/api/branches/current")).json();
  const origin = new URL(page.url()).origin;
  const plan = await page.request.post("/api/production/orders", {
    headers: { Origin: origin },
    data: {
      requestId: crypto.randomUUID(),
      assignment: {
        assignedTo: people.find((person: { name: string }) =>
          person.name.includes("Constanza"),
        ).id,
        scheduledFor: "2026-11-04T18:00:00-03:00",
        notes: note,
      },
      order: {
        recipeVersionId: recipe.versionId,
        locationId: branch.locations[0].id,
        plannedQuantity: recipe.yieldQuantity,
        selections: recipe.lines.map((line) => ({
          lineId: line.id,
          optionId: line.options[0].id,
        })),
      },
    },
  });
  expect(plan.status()).toBe(200);
  const planned = await (
    await page.request.get("/api/production/orders?scope=active")
  ).json();
  const row = planned.rows.find(
    (order: { notes: string }) => order.notes === note,
  );
  const start = await page.request.post(`/api/production/orders/${row.id}`, {
    headers: { Origin: origin },
    data: {
      requestId: crypto.randomUUID(),
      start: { expectedRevision: row.revision },
    },
  });
  expect(start.status()).toBe(200);
  await page.reload();
  const card = page.getByRole("article").filter({ hasText: note });
  await card
    .getByLabel("Notas de finalización y diferencias")
    .fill("Revisar mi consumo antes de cerrar.");
  await card.getByLabel(/Producción obtenida/).fill("400");
  let fail = true;
  await page.route("**/api/production/orders?**", async (route) => {
    if (
      fail &&
      new URL(route.request().url()).searchParams.get("scope") === "history"
    ) {
      fail = false;
      return route.fulfill({
        status: 503,
        json: { error: "Historial no disponible en esta prueba" },
      });
    }
    await route.continue();
  });
  await page.getByRole("tab", { name: "Historial", exact: true }).click();
  await expect(
    page
      .getByText("Historial no disponible en esta prueba", { exact: true })
      .first(),
  ).toBeVisible();
  await expect(
    page
      .getByRole("region", { name: "Órdenes finalizadas", exact: true })
      .getByRole("button", { name: "Finalizar producción", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("tab", { name: "Órdenes", exact: true }).click();
  await expect(
    card.getByLabel("Notas de finalización y diferencias"),
  ).toHaveValue("Revisar mi consumo antes de cerrar.");
  await expect(card.getByLabel(/Producción obtenida/)).toHaveValue("400");
});

test("las alternativas se pueden tocar y una única alternativa activa se incluye al asignar", async ({
  page,
}) => {
  await openProduction(page);
  await page.route("**/api/recipes/*", async (route) => {
    if (route.request().method() !== "GET") return route.continue();
    const response = await route.fetch();
    const recipe: RecipeDetail = await response.json();
    if (!recipe.lines?.length) return route.fulfill({ response });
    const first = recipe.lines[0].options[0];
    recipe.lines[0].options = [
      {
        ...first,
        id: crypto.randomUUID(),
        name: "Alternativa archivada",
        archived: true,
      },
      first,
    ];
    const last = recipe.lines.at(-1)!;
    last.options = [
      last.options[0],
      {
        ...last.options[0],
        id: crypto.randomUUID(),
        name: "Otra salsa de prueba",
      },
    ];
    await route.fulfill({ response, json: recipe });
  });
  await page
    .getByRole("button", { name: "Nueva producción", exact: true })
    .click();
  await page
    .getByRole("combobox", { name: "Preparación", exact: true })
    .fill("Perlas de tapioca cocidas");
  await page.getByRole("option", { name: /Perlas de tapioca cocidas/ }).click();
  await page
    .getByRole("combobox", { name: "Ingrediente 3", exact: true })
    .click();
  const option = page.getByRole("option", {
    name: "Salsa de caramelo",
    exact: true,
  });
  await expect(option).toBeVisible();
  expect(
    await option.evaluate((element) => {
      const r = element.getBoundingClientRect();
      return element.contains(
        document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2),
      );
    }),
  ).toBe(true);
  await option.click();
  await page
    .getByRole("combobox", { name: "Responsable", exact: true })
    .fill("Constanza");
  await page.getByRole("option", { name: /Constanza/ }).click();
  await page
    .getByRole("region", { name: "Planificar producción", exact: true })
    .getByLabel("Debe estar listo para")
    .fill("2026-11-04T18:00");
  await page
    .getByRole("combobox", { name: "Lugar de preparación", exact: true })
    .selectOption({ label: "Depósito principal" });
  await page
    .getByRole("button", { name: "Asignar producción", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Nueva producción", exact: true }),
  ).not.toBeVisible();
});

test("la paginación del historial no oculta las órdenes pendientes", async ({
  page,
}) => {
  await openProduction(page);
  await page.route("**/api/production/orders?**", async (route) => {
    const query = new URL(route.request().url()).searchParams;
    if (query.get("scope") !== "history") return route.continue();
    const response = await route.fetch();
    const body = await response.json();
    body.hasMore = query.get("offset") === "0";
    await route.fulfill({ response, json: body });
  });
  await page.getByRole("tab", { name: "Historial", exact: true }).click();
  await page
    .getByRole("button", { name: "Página siguiente", exact: true })
    .click();
  await expect(page.getByText(/Página 2 ·/)).toBeVisible();
  const request = page.waitForRequest(
    (request) =>
      request.url().includes("/api/production/orders?") &&
      new URL(request.url()).searchParams.get("scope") === "active",
  );
  await page.getByRole("tab", { name: "Órdenes", exact: true }).click();
  expect(new URL((await request).url()).searchParams.get("offset")).toBe("0");
});

test("reintentar el historial no borra el lote que se está cargando", async ({
  page,
}) => {
  await openProduction(page);
  await page.getByRole("tab", { name: "Registrar lote", exact: true }).click();
  await page
    .getByRole("combobox", { name: "Preparación", exact: true })
    .fill("Perlas de tapioca cocidas");
  await page.getByRole("option", { name: /Perlas de tapioca cocidas/ }).click();
  await page
    .getByRole("textbox", { name: "Producción real", exact: true })
    .fill("410");
  let fail = true;
  await page.route("**/api/production?**", async (route) => {
    if (fail) {
      fail = false;
      return route.fulfill({
        status: 503,
        json: { error: "Lotes no disponibles en esta prueba" },
      });
    }
    await route.continue();
  });
  await page.getByRole("tab", { name: "Historial", exact: true }).click();
  await page
    .getByRole("region", { name: "Lotes registrados", exact: true })
    .getByRole("button", { name: "Reintentar", exact: true })
    .click();
  await page.getByRole("tab", { name: "Registrar lote", exact: true }).click();
  await expect(
    page.getByRole("textbox", { name: "Producción real", exact: true }),
  ).toHaveValue("410");
});

test("recargar una receta en conflicto obtiene la versión nueva y permite registrar el lote", async ({
  page,
}) => {
  await openProduction(page);
  await page.getByRole("tab", { name: "Registrar lote", exact: true }).click();
  await page
    .getByRole("combobox", { name: "Preparación", exact: true })
    .fill("Perlas de tapioca cocidas");
  await page.getByRole("option", { name: /Perlas de tapioca cocidas/ }).click();
  await page
    .getByRole("combobox", { name: "Lugar de preparación", exact: true })
    .selectOption({ label: "Depósito principal" });
  await page.getByRole("button", { name: "Revisar lote", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Guardar lote", exact: true }),
  ).toBeEnabled();
  const list = await (
    await page.request.get(
      "/api/recipes?kind=preparation&q=Perlas%20de%20tapioca%20cocidas",
    )
  ).json();
  const recipe: RecipeDetail = await (
    await page.request.get(`/api/recipes/${list.rows[0].id}`)
  ).json();
  const changed = await page.request.post("/api/recipes", {
    headers: { Origin: new URL(page.url()).origin },
    data: {
      requestId: crypto.randomUUID(),
      id: recipe.id,
      revision: recipe.revision,
      kind: recipe.kind,
      targetId: recipe.targetId,
      yieldQuantity: recipe.yieldQuantity.replace(".", ","),
      lines: recipe.lines.map((line) => ({
        optional: line.optional,
        options: line.options.map((option) => ({
          itemId: option.itemId,
          quantity: option.quantity.replace(".", ","),
          wastePercent: (option.wastePercent ?? "0").replace(".", ","),
        })),
      })),
    },
  });
  expect(changed.status(), (await changed.json()).error).toBe(200);
  await page.getByRole("button", { name: "Guardar lote", exact: true }).click();
  await page
    .getByRole("button", { name: "recargá la receta", exact: true })
    .click();
  await expect(
    page.getByText(`Receta v${recipe.revision + 1}`, { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("combobox", { name: "Lugar de preparación", exact: true })
    .selectOption({ label: "Depósito principal" });
  await page.getByRole("button", { name: "Revisar lote", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Guardar lote", exact: true }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "Guardar lote", exact: true }).click();
  await expect(
    page.getByText("Producción registrada", { exact: true }),
  ).toBeVisible();
});
