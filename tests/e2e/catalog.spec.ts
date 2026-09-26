import { test, expect, type Page, type BrowserContext } from "@playwright/test";

const email = process.env.E2E_EMAIL;
const password = process.env.E2E_PASSWORD;
test.skip(
  !email || !password,
  "Set E2E_EMAIL and E2E_PASSWORD to a temporary admin account",
);

let sharedCookies: Awaited<ReturnType<BrowserContext["cookies"]>> | undefined;
async function signIn(page: Page) {
  if (sharedCookies) {
    await page.context().addCookies(sharedCookies);
    await page.goto("/");
    await expect(page).toHaveURL("/");
    return;
  }
  await page.goto("/login");
  await page.getByLabel("Correo electrónico").fill(email!);
  await page.getByLabel("Contraseña").fill(password!);
  await page.getByRole("button", { name: "Ingresar" }).click();
  await expect(page).toHaveURL("/", { timeout: 20_000 });
  sharedCookies = await page.context().cookies();
}

test("supplier persists through edit, archive, and restore", async ({
  page,
}, testInfo) => {
  test.slow();
  await signIn(page);
  await page.setViewportSize({ width: 1400, height: 950 });
  await page.screenshot({
    path: "/tmp/kybo-preview-desktop.png",
    fullPage: true,
  });
  await page.goto("/suppliers");
  const name = `Proveedor E2E ${Date.now()}`;
  await page.getByRole("button", { name: "Nuevo proveedor" }).click();
  await page.getByRole("textbox", { name: "Nombre", exact: true }).fill(name);
  await page.getByRole("button", { name: "Guardar", exact: true }).click();
  await expect(page.getByRole("cell", { name, exact: true })).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath("suppliers-desktop.png"),
    fullPage: true,
  });
  await page.reload();
  const row = page.getByRole("row", { name: new RegExp(name) });
  await row.getByRole("button", { name: "Editar" }).click();
  await page
    .getByRole("textbox", { name: "Nombre", exact: true })
    .fill(`${name} editado`);
  await page.getByRole("button", { name: "Guardar", exact: true }).click();
  await expect(
    page.getByRole("cell", { name: `${name} editado`, exact: true }),
  ).toBeVisible();
  await page
    .getByRole("row", { name: new RegExp(`${name} editado`) })
    .getByRole("button", { name: "Archivar" })
    .click();
  await page.getByRole("button", { name: "Archivados" }).click();
  await page
    .getByRole("row", { name: new RegExp(`${name} editado`) })
    .getByRole("button", { name: "Restaurar" })
    .click();
  await page.getByRole("button", { name: "Activos" }).click();
  await expect(
    page.getByRole("cell", { name: `${name} editado`, exact: true }),
  ).toBeVisible();
});

test("failed save retains draft, and a stale revision does not overwrite another edit", async ({
  browser,
}) => {
  const context = await browser.newContext();
  const first = await context.newPage();
  await signIn(first);
  await first.goto("/suppliers");
  const name = `Revisión E2E ${Date.now()}`;
  await first.getByRole("button", { name: "Nuevo proveedor" }).click();
  await first.getByRole("textbox", { name: "Nombre", exact: true }).fill(name);
  await first.getByRole("button", { name: "Guardar", exact: true }).click();
  await expect(first.getByRole("cell", { name, exact: true })).toBeVisible();
  const second = await context.newPage();
  await second.goto("/suppliers");
  await first
    .getByRole("row", { name: new RegExp(name) })
    .getByRole("button", { name: "Editar" })
    .click();
  await second
    .getByRole("row", { name: new RegExp(name) })
    .getByRole("button", { name: "Editar" })
    .click();
  await first
    .getByRole("textbox", { name: "Nombre", exact: true })
    .fill(`${name} guardado`);
  await first.getByRole("button", { name: "Guardar", exact: true }).click();
  await second
    .getByRole("textbox", { name: "Nombre", exact: true })
    .fill(`${name} viejo`);
  await second.getByRole("button", { name: "Guardar", exact: true }).click();
  await expect(second.getByRole("alert")).toContainText(
    /otra persona|actualiz|conflicto/i,
  );
  await expect(
    second.getByRole("textbox", { name: "Nombre", exact: true }),
  ).toHaveValue(`${name} viejo`);
  await second.reload();
  await expect(
    second.getByRole("cell", { name: `${name} guardado`, exact: true }),
  ).toBeVisible();
  await second
    .getByRole("row", { name: new RegExp(`${name} guardado`) })
    .getByRole("button", { name: "Editar" })
    .click();
  await second
    .getByRole("textbox", { name: "Nombre", exact: true })
    .fill(`${name} sin red`);
  await second.route("**/api/catalog/suppliers/*", (route) => route.abort());
  await second.getByRole("button", { name: "Guardar", exact: true }).click();
  await expect(second.getByRole("alert")).toContainText(
    /confirmar|conexión|guardar/i,
  );
  await expect(
    second.getByRole("textbox", { name: "Nombre", exact: true }),
  ).toHaveValue(`${name} sin red`);
  await context.close();
});

test("missing cost is pending, and anonymous catalog access is rejected", async ({
  page,
  request,
}) => {
  const direct = await request.get("/api/catalog/suppliers");
  expect(direct.status()).toBe(401);
  await signIn(page);
  await page.goto("/ingredients");
  const name = `Leche E2E ${Date.now()}`;
  await page.getByRole("button", { name: "Nuevo insumo" }).click();
  await page.getByRole("textbox", { name: "Nombre", exact: true }).fill(name);
  await page.getByRole("combobox", { name: "Unidad base" }).selectOption("ml");
  await page.getByRole("button", { name: "Guardar", exact: true }).click();
  await expect(page.getByRole("row", { name: new RegExp(name) })).toContainText(
    "Pendiente",
  );
  await page.reload();
  await expect(page.getByRole("row", { name: new RegExp(name) })).toContainText(
    "Pendiente",
  );
  await page.goto("/customers");
  const customer = `Cliente E2E ${Date.now()}`;
  await page.getByRole("button", { name: "Nuevo cliente" }).click();
  await page
    .getByRole("textbox", { name: "Nombre", exact: true })
    .fill(customer);
  await expect(
    page.getByText("Agregar un cliente no autoriza el envío de promociones."),
  ).toBeVisible();
  await page.getByRole("button", { name: "Guardar", exact: true }).click();
  await expect(
    page.getByRole("cell", { name: customer, exact: true }),
  ).toBeVisible();
  const data = await page.request.get(
    `/api/catalog/customers?q=${encodeURIComponent(customer)}`,
  );
  expect(data.ok()).toBe(true);
  expect((await data.json()).rows[0].marketingOptIn).toBe(false);
});

test("foreign origin cannot write and the catalog fits a narrow phone", async ({
  page,
}, testInfo) => {
  await signIn(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  await expect
    .poll(() =>
      page.locator("aside").evaluate((el) => el.getBoundingClientRect().right),
    )
    .toBeLessThanOrEqual(0);
  await page.screenshot({
    path: "/tmp/kybo-preview-mobile.png",
    fullPage: true,
    animations: "disabled",
  });
  const denied = await page.request.post("/api/catalog/suppliers", {
    headers: { Origin: "https://otro-sitio.example" },
    data: { name: `Origen ajeno ${Date.now()}` },
  });
  expect(denied.status()).toBe(403);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/suppliers");
  await expect(
    page.getByRole("button", { name: "Nuevo proveedor" }),
  ).toBeVisible();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth,
  );
  expect(overflow).toBe(false);
  await page.screenshot({
    path: testInfo.outputPath("suppliers-mobile.png"),
    fullPage: true,
  });
  await page.getByRole("button", { name: "Abrir menú" }).click();
  await expect(
    page
      .getByRole("navigation", { name: "Principal" })
      .getByRole("link", { name: "Insumos" }),
  ).toBeVisible();
});

test("login controls stay disabled before hydration", async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto("/login");
  await expect(page.getByLabel("Correo electrónico")).toBeDisabled();
  await expect(page.getByLabel("Contraseña")).toBeDisabled();
  await expect(page.getByRole("button", { name: "Ingresar" })).toBeDisabled();
  await context.close();
});

test("failed sign-out keeps the session and offers retry", async ({ page }) => {
  await signIn(page);
  await page.route("**/api/auth/sign-out", (route) =>
    route.fulfill({ status: 503, body: "Service unavailable" }),
  );
  await page.getByRole("button", { name: "Cerrar sesión" }).click();
  await expect(page).toHaveURL("/");
  await expect(
    page.getByRole("alert").filter({ hasText: /cerrar sesión/i }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Cerrar sesión" }),
  ).toBeEnabled();
});

test("cancel does not save, while Enter submits a supplier", async ({
  page,
}) => {
  await signIn(page);
  await page.goto("/suppliers");
  const name = `Teclado E2E ${Date.now()}`;
  await page.getByRole("button", { name: "Nuevo proveedor" }).click();
  await page
    .getByRole("textbox", { name: "Nombre", exact: true })
    .fill(`${name} cancelado`);
  await page.getByRole("button", { name: "Cancelar" }).click();
  await page.reload();
  await page.getByRole("button", { name: "Nuevo proveedor" }).click();
  await page.getByRole("textbox", { name: "Nombre", exact: true }).fill(name);
  await page
    .getByRole("textbox", { name: "Nombre", exact: true })
    .press("Enter");
  await expect(page.getByRole("cell", { name, exact: true })).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("cell", { name: `${name} cancelado`, exact: true }),
  ).toHaveCount(0);
  await expect(page.getByRole("cell", { name, exact: true })).toBeVisible();
});
