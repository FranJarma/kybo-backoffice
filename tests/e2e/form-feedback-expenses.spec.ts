import { test, expect } from "@playwright/test";

test("keeps actual expenses optional, identifies invalid fields and shows floating notifications", async ({
  page,
}) => {
  test.setTimeout(180000);
  test.skip(process.env.E2E_MANAGED !== "1", "Disposable database required");
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/login");
  await page.getByLabel("Usuario o correo").fill(process.env.E2E_EMAIL!);
  await page.getByLabel("Contraseña").fill(process.env.E2E_PASSWORD!);
  await page.getByRole("button", { name: "Ingresar", exact: true }).click();
  await expect(page).toHaveURL(/\/(?:settings\/branches)?$/, {
    timeout: 45000,
  });
  const branches = await (await page.request.get("/api/branches")).json();
  const selected = await page.request.post("/api/branches/select", {
    headers: { Origin: new URL(page.url()).origin },
    data: { branchId: branches.rows[0].id },
  });
  expect(selected.ok()).toBe(true);
  await page.goto("/finance/expenses");
  await expect(
    page.getByRole("button", { name: "Agregar gasto" }),
  ).toBeEnabled();
  await page.getByLabel("Mes de gastos").fill("2026-10");
  await expect(page.getByText("Sin gastos cargados")).toBeVisible();
  await page.getByLabel("Unidades previstas del mes").fill("4000");
  await page.getByRole("button", { name: "Agregar gasto" }).click();
  await page
    .getByLabel("Tipo de gasto 1", { exact: true })
    .selectOption("other");
  await expect(
    page.getByLabel("Descripción 1", { exact: true }),
  ).toHaveAttribute("required", "");
  await expect(
    page.getByLabel("Observaciones 1", { exact: true }),
  ).not.toHaveAttribute("required", "");
  await page.getByLabel("Presupuesto 1", { exact: true }).fill("2.000.000");
  let writes = 0;
  page.on("request", (request) => {
    if (
      request.method() === "POST" &&
      request.url().includes("/api/finance/expenses")
    )
      writes++;
  });
  await page.getByRole("button", { name: "Guardar mes", exact: true }).click();
  await expect(
    page.getByText(
      "Descripción del gasto 1: Describí el gasto al elegir «Otros».",
      {
        exact: true,
      },
    ),
  ).toBeVisible();
  await expect(page.getByLabel("Descripción 1", { exact: true })).toBeFocused();
  await expect(
    page.getByLabel("Descripción 1", { exact: true }),
  ).toHaveAttribute("aria-invalid", "true");
  await expect(page.locator('p[role="alert"]')).toHaveCount(0);
  expect(writes).toBe(0);
  await page.getByRole("button", { name: "Cerrar notificación" }).click();
  await expect(
    page.getByText(
      "Descripción del gasto 1: Describí el gasto al elegir «Otros».",
      {
        exact: true,
      },
    ),
  ).toBeHidden();
  await page.getByRole("button", { name: "Guardar mes", exact: true }).click();
  await expect(
    page.getByText(
      "Descripción del gasto 1: Describí el gasto al elegir «Otros».",
      {
        exact: true,
      },
    ),
  ).toBeVisible();
  expect(writes).toBe(0);
  await page
    .getByLabel("Descripción 1", { exact: true })
    .fill("Seguro del local");
  await expect(page.getByLabel("Real 1", { exact: true })).toHaveValue("");
  await expect(page.getByLabel("Real 1", { exact: true })).not.toHaveAttribute(
    "required",
    "",
  );
  await page.getByRole("button", { name: "Guardar mes", exact: true }).click();
  await expect(page.getByText("Mes guardado.", { exact: true })).toBeVisible();
  await expect(page.getByTestId("budget-rate")).toHaveText(/500,00/);
  const saved = await (
    await page.request.get("/api/finance/expenses?month=2026-10", {
      maxRetries: 2,
    })
  ).json();
  expect(saved.period.entries[0]).toMatchObject({
    category: "other",
    concept: "Seguro del local",
    budget: "2000000.00",
    actual: null,
    notes: "",
  });
  expect(saved.summary.actualPending).toBe(1);
  await expect(
    page.getByRole("button", { name: "Cerrar mes", exact: true }),
  ).toBeDisabled();
  await page
    .getByLabel("Tipo de gasto 1", { exact: true })
    .selectOption("rent");
  await expect(page.getByLabel("Descripción 1", { exact: true })).toHaveCount(
    0,
  );
  await expect(page.getByLabel("Concepto 1", { exact: true })).toHaveCount(0);
  const standardSave = page.waitForResponse(
    (response) =>
      response.url().includes("/api/finance/expenses") &&
      response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Guardar mes", exact: true }).click();
  expect((await standardSave).ok()).toBe(true);
  await expect(
    page.getByLabel("Tipo de gasto 1", { exact: true }),
  ).toBeEnabled();
  const standard = await (
    await page.request.get("/api/finance/expenses?month=2026-10", {
      maxRetries: 2,
    })
  ).json();
  expect(standard.period.entries[0]).toMatchObject({
    category: "rent",
    concept: "Alquiler",
    actual: null,
    notes: "",
  });
  await page.getByLabel("Presupuesto 1", { exact: true }).fill("2,000,000");
  await page.getByRole("button", { name: "Guardar mes", exact: true }).click();
  await expect(
    page.getByText(
      "Presupuesto del gasto 1: Usá coma decimal y punto para miles.",
      { exact: true },
    ),
  ).toBeVisible();
  await expect(page.getByLabel("Presupuesto 1", { exact: true })).toBeFocused();
  expect(writes).toBe(2);
  await page.getByLabel("Presupuesto 1", { exact: true }).fill("2.100.000,00");
  await page.route("**/api/finance/expenses", async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    await route.fulfill({
      status: 503,
      json: { error: "No se pudo conectar. Probá de nuevo." },
    });
  });
  await page.getByRole("button", { name: "Guardar mes", exact: true }).click();
  await expect(
    page.getByText("No se pudo conectar. Probá de nuevo.", { exact: true }),
  ).toBeVisible();
  await expect(page.locator('p[role="alert"]')).toHaveCount(0);
  await expect(page.getByLabel("Presupuesto 1", { exact: true })).toHaveValue(
    "2.100.000,00",
  );
  await page.screenshot({
    path: "docs/previews/expenses-field-feedback.png",
    fullPage: true,
  });
});

test("marks required login fields and reports native validation with a toast", async ({
  page,
}) => {
  test.skip(process.env.E2E_MANAGED !== "1", "Disposable database required");
  await page.goto("/login");
  await expect(
    page.getByRole("button", { name: "Ingresar", exact: true }),
  ).toBeEnabled();
  await expect(
    page.locator('label[for="email"] [aria-hidden="true"]'),
  ).toHaveText("*");
  await page.getByRole("button", { name: "Ingresar", exact: true }).click();
  await expect(
    page.getByText("Revisá el formulario", { exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel("Usuario o correo")).toBeFocused();
});
