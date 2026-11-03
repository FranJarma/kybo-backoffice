import { expect, test, type Page } from "@playwright/test";
import type { RecipeList } from "@/modules/recipes/types";

test.setTimeout(90_000);
test.use({ storageState: process.env.KYBO_PRODUCTION_UX_AUTHSTATE });
test.skip(
  process.env.KYBO_PRODUCTION_UX_FIXTURE !== "disposable-only" ||
    !process.env.KYBO_PRODUCTION_UX_AUTHSTATE ||
    new URL(process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost").port !==
      "3042",
  "Solo la instancia descartable de producción, en el puerto de pruebas.",
);

async function openForm(page: Page, mode: "plan" | "record") {
  await page.goto("/kitchen/production");
  const recipes: RecipeList = await (
    await page.request.get("/api/recipes?kind=preparation")
  ).json();
  expect(recipes.rows.length).toBeGreaterThanOrEqual(3);
  if (mode === "plan")
    await page
      .getByRole("button", { name: "Nueva producción", exact: true })
      .click();
  else
    await page
      .getByRole("tab", { name: "Registrar lote", exact: true })
      .click();
  const panel =
    mode === "plan"
      ? page.getByRole("region", { name: "Planificar producción", exact: true })
      : page.getByRole("tabpanel", { name: "Registrar lote", exact: true });
  const picker = panel.getByRole("combobox", {
    name: "Preparación",
    exact: true,
  });
  const amount = panel.getByRole("textbox", {
    name: mode === "plan" ? "Cantidad prevista" : "Producción real",
    exact: true,
  });
  await picker.fill(recipes.rows[0].name);
  await page
    .getByRole("option", { name: recipes.rows[0].name, exact: false })
    .click();
  await expect(amount).toBeEnabled();
  return { recipes: recipes.rows, panel, picker, amount };
}

for (const mode of ["plan", "record"] as const) {
  test(`al cambiar preparación en ${mode}, conserva el formulario visible y lo bloquea hasta cargar la receta`, async ({
    page,
  }) => {
    const { recipes, picker, amount, panel } = await openForm(page, mode);
    await amount.fill("777");
    let release!: () => void;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    let requested = false;
    await page.route(`**/api/recipes/${recipes[1].id}`, async (route) => {
      requested = true;
      const response = await route.fetch();
      await held;
      await route.fulfill({ response });
    });
    try {
      await picker.fill(recipes[1].name);
      await page
        .getByRole("option", { name: recipes[1].name, exact: false })
        .click();
      await expect.poll(() => requested).toBe(true);
      await expect(picker).toHaveValue(recipes[1].name);
      await expect(amount).toBeVisible();
      await expect(amount).toBeDisabled();
      await expect(amount).toHaveValue("777");
      await expect(panel.getByRole("status")).toContainText(
        "Actualizando receta",
      );
    } finally {
      release();
    }
    await expect(amount).toBeEnabled();
    await expect(amount).not.toHaveValue("777");
    await expect(picker).toHaveValue(recipes[1].name);
  });
}

test("una respuesta anterior no reemplaza la última preparación y quitar la selección cancela la carga", async ({
  page,
}) => {
  const { recipes, picker, amount } = await openForm(page, "record");
  let release!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  let requested = false;
  await page.route(`**/api/recipes/${recipes[1].id}`, async (route) => {
    requested = true;
    const response = await route.fetch();
    await held;
    await route.fulfill({ response });
  });
  await picker.fill(recipes[1].name);
  await page
    .getByRole("option", { name: recipes[1].name, exact: false })
    .click();
  await expect.poll(() => requested).toBe(true);
  await picker.fill(recipes[2].name);
  await page
    .getByRole("option", { name: recipes[2].name, exact: false })
    .click();
  await expect(amount).toBeEnabled();
  const lateResponse = page.waitForResponse(`**/api/recipes/${recipes[1].id}`);
  release();
  await lateResponse;
  await expect(picker).toHaveValue(recipes[2].name);
  await expect(amount).toBeEnabled();

  let releaseCleared!: () => void;
  const cleared = new Promise<void>((resolve) => {
    releaseCleared = resolve;
  });
  requested = false;
  await page.unroute(`**/api/recipes/${recipes[1].id}`);
  await page.route(`**/api/recipes/${recipes[1].id}`, async (route) => {
    requested = true;
    const response = await route.fetch();
    await cleared;
    await route.fulfill({ response });
  });
  await picker.fill(recipes[1].name);
  await page
    .getByRole("option", { name: recipes[1].name, exact: false })
    .click();
  await expect.poll(() => requested).toBe(true);
  await page
    .getByRole("button", { name: "Quitar preparación", exact: true })
    .click();
  const clearedResponse = page.waitForResponse(
    `**/api/recipes/${recipes[1].id}`,
  );
  releaseCleared();
  await clearedResponse;
  await expect(amount).toHaveCount(0);
  await expect(picker).toHaveValue("");
  await expect(
    page.getByRole("heading", { name: "Elegí qué preparaste" }),
  ).toBeVisible();
});

test("si falla la nueva receta conserva el formulario bloqueado y permite reintentar", async ({
  page,
}) => {
  const { recipes, picker, amount, panel } = await openForm(page, "record");
  await amount.fill("777");
  await page.route(`**/api/recipes/${recipes[1].id}`, (route) =>
    route.fulfill({
      status: 503,
      json: { error: "Receta no disponible en esta prueba" },
    }),
  );
  await picker.fill(recipes[1].name);
  await page
    .getByRole("option", { name: recipes[1].name, exact: false })
    .click();
  await expect(panel.getByRole("alert")).toContainText("Receta no disponible");
  await expect(amount).toBeVisible();
  await expect(amount).toBeDisabled();
  await expect(
    panel.getByRole("button", { name: "Revisar lote", exact: true }),
  ).toBeDisabled();
  await expect(
    panel.getByRole("button", { name: "Guardar lote", exact: true }),
  ).toBeDisabled();
  await page.unroute(`**/api/recipes/${recipes[1].id}`);
  await panel.getByRole("button", { name: "Reintentar", exact: true }).click();
  await expect(amount).toBeEnabled();
  await expect(amount).not.toHaveValue("777");
  await expect(picker).toHaveValue(recipes[1].name);
  await expect(panel.getByRole("alert")).toHaveCount(0);
});
