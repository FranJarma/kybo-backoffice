import { expect, test } from "@playwright/test";

test("administers employees, branches and permissions and preserves private account access", async ({
  page,
  browser,
}) => {
  test.setTimeout(180000);
  page.setDefaultTimeout(15000);
  test.skip(process.env.E2E_MANAGED !== "1", "Disposable database required");
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/login");
  await page.getByLabel("Usuario o correo").fill(process.env.E2E_EMAIL!);
  await page.getByLabel("Contraseña").fill(process.env.E2E_PASSWORD!);
  await page.getByRole("button", { name: "Ingresar", exact: true }).click();
  await expect(page).toHaveURL(/\/(?:settings\/branches)?$/, {
    timeout: 45000,
  });
  await page.goto("/settings/users");
  await expect(
    page.getByRole("heading", { name: "Usuarios", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Usuarios", exact: true }),
  ).toBeVisible();
  const snapshotResponse = await page.request.get("/api/settings/users");
  expect(snapshotResponse.headers()["cache-control"]).toContain("no-store");
  const snapshot = await snapshotResponse.json();
  const branch = snapshot.branches[0];
  expect(JSON.stringify(snapshot)).not.toMatch(/password|token|users\.invalid/);

  await page
    .getByRole("button", { name: "Nuevo usuario", exact: true })
    .click();
  let dialog = page.getByRole("dialog");
  await dialog.getByLabel("Nombre").fill("Empleado del panel");
  await dialog.getByLabel("Usuario").fill("empleado_panel");
  await dialog.getByLabel("Contraseña inicial").fill("PanelPassword-123!");
  await dialog
    .getByRole("button", { name: "Crear usuario", exact: true })
    .click();
  await expect(
    page.getByText("Asigná al menos una sucursal.", { exact: true }).last(),
  ).toBeVisible();
  await dialog
    .getByRole("checkbox", { name: branch.name, exact: true })
    .check();
  await page.screenshot({ path: ".local/users-create-desktop.png" });
  await dialog
    .getByRole("button", { name: "Crear usuario", exact: true })
    .click();
  await expect(dialog).toBeHidden({ timeout: 15000 });
  await expect(
    page.getByText(
      "La cuenta quedó creada. Ya puede ingresar con su usuario y contraseña.",
      { exact: true },
    ),
  ).toBeVisible();
  const row = page.locator("article").filter({
    has: page.getByRole("heading", {
      name: "Empleado del panel",
      exact: true,
    }),
  });
  await expect(row).toContainText(branch.name);
  let reads = 0;
  page.on("request", (request) => {
    if (
      request.method() === "GET" &&
      request.url().endsWith("/api/settings/users")
    )
      reads++;
  });
  await page
    .getByRole("textbox", { name: "Buscar usuarios" })
    .fill("empleado_panel");
  await expect(page.locator("article")).toHaveCount(1);
  await page.getByRole("textbox", { name: "Buscar usuarios" }).clear();
  expect(reads).toBe(0);
  await page.screenshot({ path: ".local/users-list-desktop.png" });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect
    .poll(() =>
      page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    )
    .toBe(true);
  await row
    .getByRole("button", { name: "Editar a Empleado del panel" })
    .click();
  dialog = page.getByRole("dialog");
  await expect(dialog.getByLabel("Usuario")).toHaveValue("empleado_panel");
  await expect(dialog.getByLabel("Nueva contraseña")).toHaveValue("");
  await expect
    .poll(() =>
      dialog.evaluate((node) => node.scrollWidth <= node.clientWidth + 1),
    )
    .toBe(true);
  await page.screenshot({ path: ".local/users-edit-mobile.png" });
  await dialog.getByRole("button", { name: "Cancelar", exact: true }).click();
  await page.setViewportSize({ width: 1440, height: 1000 });

  const employeeContext = await browser.newContext();
  const employee = await employeeContext.newPage();
  try {
    await employee.goto(new URL("/login", page.url()).href);
    await employee.getByLabel("Usuario o correo").fill("empleado_panel");
    await employee.getByLabel("Contraseña").fill("PanelPassword-123!");
    await employee
      .getByRole("button", { name: "Ingresar", exact: true })
      .click();
    await expect(employee).toHaveURL(/\/sales$/, { timeout: 45000 });
    expect(
      (
        await employee.request.get(
          new URL("/api/settings/users", page.url()).href,
        )
      ).status(),
    ).toBe(403);
    const assignment = await (
      await employee.request.get(
        new URL("/api/branches/current", page.url()).href,
      )
    ).json();
    expect(assignment.branchId ?? assignment.branch?.id ?? assignment.id).toBe(
      branch.id,
    );
    await row
      .getByRole("button", { name: "Editar a Empleado del panel" })
      .click();
    dialog = page.getByRole("dialog");
    await dialog.getByLabel("Rol de la cuenta").selectOption("manager");
    await dialog
      .getByRole("checkbox", { name: "Gestionar catálogo compartido" })
      .check();
    await dialog
      .getByRole("button", { name: "Guardar cambios", exact: true })
      .click();
    await expect(dialog).toBeHidden({ timeout: 15000 });
    await expect(row).toContainText("Encargado");
    await expect(row).toContainText("También gestiona catálogo compartido");
    await row
      .getByRole("button", { name: "Editar a Empleado del panel" })
      .click();
    dialog = page.getByRole("dialog");
    await dialog.getByRole("checkbox", { name: "Cuenta activa" }).uncheck();
    await dialog
      .getByRole("button", { name: "Guardar cambios", exact: true })
      .click();
    await expect(dialog).toBeHidden({ timeout: 15000 });
    await expect(row).toContainText("Desactivado");
    expect(
      (
        await employee.request.get(
          new URL("/api/settings/users", page.url()).href,
        )
      ).status(),
    ).toBe(401);
    const final = await (await page.request.get("/api/settings/users")).json();
    expect(
      final.rows.find(
        (item: { username: string }) => item.username === "empleado_panel",
      ),
    ).toMatchObject({ disabled: true, role: "manager", catalogManager: true });
  } finally {
    await employeeContext.close();
  }
});
