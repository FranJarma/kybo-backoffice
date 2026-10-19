import { test, expect } from "@playwright/test";
test.use({ hasTouch: true });

test("payment dialog distinguishes empty methods, retries, cash and split payments", async ({
  page,
}) => {
  test.setTimeout(120000);
  test.skip(process.env.E2E_MANAGED !== "1", "Disposable database required");
  await page.setViewportSize({ width: 1024, height: 768 });
  let methods: "empty" | "error" | "loaded" = "empty";
  let release!: () => void;
  let hold = false;
  await page.route("**/api/sales/lookup?**", async (route) => {
    const kind = new URL(route.request().url()).searchParams.get("kind");
    if (kind === "products")
      return route.fulfill({
        json: {
          rows: [{ id: "tea", name: "Tea", price: "10500.00" }],
          total: 1,
          categories: [],
          offset: 0,
        },
      });
    if (kind !== "payment-methods") return route.continue();
    if (hold)
      await new Promise<void>((resolve) => {
        release = resolve;
      });
    if (methods === "error")
      return route.fulfill({
        status: 500,
        json: { message: "No pudimos consultar los medios" },
      });
    return route.fulfill({
      json: {
        rows:
          methods === "loaded"
            ? [
                { id: "cash", name: "Efectivo", kind: "cash" },
                {
                  id: "transfer",
                  name: "Transferencia bancaria",
                  kind: "transfer",
                },
              ]
            : [],
        total: methods === "loaded" ? 2 : 0,
      },
    });
  });
  await page.route("**/api/sales/products/tea/configuration?**", (route) =>
    route.fulfill({
      json: {
        basePrice: "10500.00",
        recipeVersionId: null,
        fulfillmentVersionId: "tea-v1",
        model: "unavailable",
        groups: [],
      },
    }),
  );
  await page.goto("/login");
  await page.getByLabel("Usuario o correo").fill(process.env.E2E_EMAIL!);
  await page.getByLabel("Contraseña").fill(process.env.E2E_PASSWORD!);
  await page.getByRole("button", { name: "Ingresar", exact: true }).tap();
  await expect(page).toHaveURL(/\/(?:settings\/branches)?$/, {
    timeout: 45000,
  });
  const branches = await (await page.request.get("/api/branches")).json();
  expect(
    (
      await page.request.post("/api/branches/select", {
        data: { branchId: branches.rows[0].id },
        headers: { Origin: new URL(page.url()).origin },
      })
    ).ok(),
  ).toBe(true);
  await page.goto("/sales");
  await page.getByRole("button", { name: "Agregar Tea", exact: true }).tap();
  await page.getByRole("button", { name: "Cobrar", exact: true }).tap();
  const dialog = page.getByRole("dialog");
  await expect(
    dialog.getByText("No hay medios de pago configurados.", { exact: true }),
  ).toBeVisible();
  await expect(dialog.getByText(/Cargando medios/)).toHaveCount(0);
  await expect(
    dialog.getByRole("button", { name: "Confirmar cobro", exact: true }),
  ).toBeDisabled();
  await expect(
    dialog.getByRole("link", {
      name: "Configurar medios de pago",
      exact: true,
    }),
  ).toHaveAttribute("href", "/settings/payment-methods");
  methods = "error";
  await dialog.getByRole("button", { name: "Actualizar", exact: true }).tap();
  await expect(
    dialog.getByText("No pudimos cargar los medios de pago.", { exact: true }),
  ).toBeVisible();
  methods = "loaded";
  hold = true;
  await dialog.getByRole("button", { name: "Actualizar", exact: true }).tap();
  await expect(
    dialog.getByText("Cargando medios de pago…", { exact: true }),
  ).toBeVisible();
  release();
  hold = false;
  const cash = dialog.getByRole("button", { name: "Efectivo", exact: true });
  await cash.tap();
  await expect(cash).toHaveAttribute("aria-pressed", "true");
  await expect(dialog.getByLabel("Importe 1", { exact: true })).toHaveCount(0);
  await dialog.getByLabel("Efectivo recibido 1", { exact: true }).fill("20000");
  await expect(dialog.getByText(/Vuelto:/)).toHaveText(/9\.500/);
  await expect(
    dialog.getByRole("button", { name: "Confirmar cobro", exact: true }),
  ).toBeEnabled();
  await expect(
    dialog.getByRole("button", { name: "Confirmar cobro", exact: true }),
  ).toBeInViewport();
  expect(
    (await dialog
      .getByRole("button", { name: "Confirmar cobro", exact: true })
      .boundingBox())!.height,
  ).toBeGreaterThanOrEqual(56);
  expect(
    (await dialog
      .getByLabel("Efectivo recibido 1", { exact: true })
      .boundingBox())!.height,
  ).toBeGreaterThanOrEqual(48);
  await page.screenshot({ path: "docs/previews/payment-dialog-desktop.png" });
  await dialog
    .getByRole("button", { name: "Dividir cobro", exact: true })
    .tap();
  await dialog.getByLabel("Importe 1", { exact: true }).fill("5000");
  await dialog.getByLabel("Importe 2", { exact: true }).fill("5500");
  await dialog
    .getByRole("group", { name: "Medio de pago 2", exact: true })
    .getByRole("button", { name: "Transferencia bancaria", exact: true })
    .tap();
  await expect(
    dialog.getByRole("button", { name: "Confirmar cobro", exact: true }),
  ).toBeEnabled();
  await dialog
    .getByRole("button", { name: "Quitar cobro 2", exact: true })
    .tap();
  await expect(dialog.getByLabel("Importe 1", { exact: true })).toHaveCount(0);
  await expect(
    dialog.getByRole("button", { name: "Confirmar cobro", exact: true }),
  ).toBeEnabled();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator("body")).toHaveJSProperty("scrollWidth", 390);
  await expect(
    dialog.getByRole("button", { name: "Confirmar cobro", exact: true }),
  ).toBeInViewport();
  await page.screenshot({ path: "docs/previews/payment-dialog-mobile.png" });
  await dialog.getByRole("button", { name: "Cancelar", exact: true }).tap();
  await expect(dialog).toBeHidden();
  await expect(page.getByTestId("cart-total")).toHaveText(/10\.500/);
});
