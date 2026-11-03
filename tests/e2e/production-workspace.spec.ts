import { expect, test, type Page, type BrowserContext } from "@playwright/test";

test.setTimeout(90_000);
test.use({ storageState: process.env.KYBO_PRODUCTION_UX_AUTHSTATE });
test.skip(
  !process.env.E2E_EMAIL ||
    !process.env.E2E_PASSWORD ||
    process.env.KYBO_PRODUCTION_UX_FIXTURE !== "disposable-only",
  "Usar una cuenta de pruebas y una base descartable.",
);
let cookies: Awaited<ReturnType<BrowserContext["cookies"]>> | undefined;

async function openProduction(page: Page) {
  if (process.env.KYBO_PRODUCTION_UX_AUTHSTATE) {
    await page.goto("/kitchen/production");
    return;
  }
  if (cookies) {
    await page.context().addCookies(cookies);
    await page.goto("/kitchen/production");
    return;
  }
  const login = await page.request.post("/api/auth/sign-in/email", {
    headers: {
      Origin: new URL(
        process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000",
      ).origin,
    },
    data: { email: process.env.E2E_EMAIL, password: process.env.E2E_PASSWORD },
  });
  expect(login.status()).toBe(200);
  await page.goto("/kitchen/production");
  await expect(
    page.getByRole("heading", { name: "Registro de producción", exact: true }),
  ).toBeVisible();
  cookies = await page.context().cookies();
}

test("conserva la planificación y el lote al cambiar de pestaña, y exige revisar el lote antes de guardar", async ({
  page,
}) => {
  await openProduction(page);
  await expect(
    page.getByRole("button", { name: "Nueva producción", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Nueva producción", exact: true })
    .click();
  const preparation = page.getByRole("combobox", {
    name: "Preparación",
    exact: true,
  });
  await preparation.fill("Perlas de tapioca cocidas");
  await page.getByRole("option", { name: /Perlas de tapioca cocidas/ }).click();
  const assignee = page.getByRole("combobox", {
    name: "Responsable",
    exact: true,
  });
  await assignee.fill("Constanza");
  await page.getByRole("option", { name: /Constanza/ }).click();
  await page
    .getByRole("textbox", { name: "Cantidad prevista", exact: true })
    .fill("920");
  await page.getByRole("tab", { name: "Registrar lote", exact: true }).click();
  await page
    .getByRole("combobox", { name: "Preparación", exact: true })
    .fill("Perlas de tapioca cocidas");
  await page.getByRole("option", { name: /Perlas de tapioca cocidas/ }).click();
  await page
    .getByRole("textbox", { name: "Producción real", exact: true })
    .fill("450");
  await expect(
    page.getByRole("button", { name: "Guardar lote", exact: true }),
  ).toBeDisabled();
  await page.getByRole("tab", { name: "Historial", exact: true }).click();
  await page.getByRole("tab", { name: "Órdenes", exact: true }).click();
  await expect(
    page.getByRole("textbox", { name: "Cantidad prevista", exact: true }),
  ).toHaveValue("920");
  await expect(
    page.getByRole("combobox", { name: "Responsable", exact: true }),
  ).toHaveValue(/Constanza/);
  await page.getByRole("tab", { name: "Registrar lote", exact: true }).click();
  await expect(
    page.getByRole("textbox", { name: "Producción real", exact: true }),
  ).toHaveValue("450");
});

test("el enlace con receta abre la planificación y el formulario se adapta al celular", async ({
  page,
}) => {
  await openProduction(page);
  const recipes = await (
    await page.request.get("/api/recipes?kind=preparation")
  ).json();
  await page.goto(`/kitchen/production?recipe=${recipes.rows[0].id}`);
  await expect(
    page.getByRole("heading", { name: "Nueva producción", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("combobox", { name: "Preparación", exact: true }),
  ).toHaveValue(recipes.rows[0].name);
  for (const width of [1440, 1024, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 950 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
  }
});

test("asigna una sola vez, bloquea la navegación durante el envío y muestra la producción finalizada en Historial", async ({
  page,
}) => {
  await openProduction(page);
  const note = `Preparación de prueba ${crypto.randomUUID()}`;
  await page
    .getByRole("button", { name: "Nueva producción", exact: true })
    .click();
  await page
    .getByRole("combobox", { name: "Preparación", exact: true })
    .fill("Perlas de tapioca cocidas");
  await page.getByRole("option", { name: /Perlas de tapioca cocidas/ }).click();
  await page
    .getByRole("combobox", { name: "Responsable", exact: true })
    .fill("Constanza");
  await page.getByRole("option", { name: /Constanza/ }).click();
  await page
    .getByRole("region", { name: "Planificar producción", exact: true })
    .getByLabel("Debe estar listo para")
    .fill("2026-11-04T10:00");
  await page
    .getByRole("combobox", { name: "Lugar de preparación", exact: true })
    .selectOption({ label: "Depósito principal" });
  await page.getByLabel("Indicaciones para el responsable").fill(note);
  let release!: () => void;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/api/production/orders", async (route) => {
    if (route.request().method() === "POST") await pending;
    await route.continue();
  });
  await page
    .getByRole("button", { name: "Asignar producción", exact: true })
    .click();
  try {
    await expect(
      page.getByRole("tab", { name: "Registrar lote", exact: true }),
    ).toBeDisabled();
    await expect(
      page.getByRole("button", { name: "Asignando…", exact: true }),
    ).toBeDisabled();
  } finally {
    release();
  }
  await expect(
    page.getByRole("heading", { name: "Nueva producción", exact: true }),
  ).not.toBeVisible();
  const assignedCard = page.getByRole("article").filter({ hasText: note });
  await assignedCard
    .getByRole("button", { name: "Iniciar preparación", exact: true })
    .click();
  await assignedCard
    .getByLabel("Notas de finalización y diferencias")
    .fill("Producción de prueba completada según receta.");
  await assignedCard
    .getByRole("button", { name: "Finalizar producción", exact: true })
    .click();
  await expect(
    assignedCard.getByRole("button", {
      name: "Finalizar producción",
      exact: true,
    }),
  ).not.toBeVisible();
  await page.getByRole("tab", { name: "Historial", exact: true }).click();
  await expect(
    page
      .getByRole("region", { name: "Órdenes finalizadas", exact: true })
      .getByRole("article")
      .filter({ hasText: note })
      .getByRole("heading", { name: /Perlas de tapioca cocidas/ }),
  ).toBeVisible();
});

test("recupera una asignación con respuesta perdida después de recargar sin duplicarla ni bloquear las pestañas", async ({
  page,
}) => {
  await openProduction(page);
  const before = await (
    await page.request.get("/api/production/orders?scope=active")
  ).json();
  const previous = before.rows.filter(
    (row: { name: string }) => row.name === "Tapas de waffle de chipá",
  ).length;
  await page
    .getByRole("button", { name: "Nueva producción", exact: true })
    .click();
  await page
    .getByRole("combobox", { name: "Preparación", exact: true })
    .fill("Tapas de waffle de chipá");
  await page.getByRole("option", { name: /Tapas de waffle de chipá/ }).click();
  await page
    .getByRole("combobox", { name: "Responsable", exact: true })
    .fill("Constanza");
  await page.getByRole("option", { name: /Constanza/ }).click();
  await page
    .getByRole("region", { name: "Planificar producción", exact: true })
    .getByLabel("Debe estar listo para")
    .fill("2026-11-04T17:00");
  await page
    .getByRole("combobox", { name: "Lugar de preparación", exact: true })
    .selectOption({ label: "Depósito principal" });
  let drop = true;
  const requests: string[] = [];
  await page.route("**/api/production/orders", async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    requests.push(route.request().postDataJSON().requestId);
    if (drop) {
      drop = false;
      await route.fetch();
      await route.abort("failed");
    } else await route.continue();
  });
  await page
    .getByRole("button", { name: "Asignar producción", exact: true })
    .click();
  await expect(
    page.getByRole("button", {
      name: "Reintentar el mismo envío",
      exact: true,
    }),
  ).toBeVisible();
  await page.reload();
  await page
    .getByRole("button", { name: "Reintentar el mismo envío", exact: true })
    .click();
  await expect(
    page.getByRole("tab", { name: "Registrar lote", exact: true }),
  ).toBeEnabled();
  expect(requests).toHaveLength(2);
  expect(requests[1]).toBe(requests[0]);
  const after = await (
    await page.request.get("/api/production/orders?scope=active")
  ).json();
  expect(
    after.rows.filter(
      (row: { name: string }) => row.name === "Tapas de waffle de chipá",
    ),
  ).toHaveLength(previous + 1);
});
