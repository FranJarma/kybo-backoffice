import { test, expect } from "@playwright/test";
test("combo selection, switching products and editing retain the right modifiers", async ({
  page,
}) => {
  test.setTimeout(120000);
  test.skip(
    process.env.E2E_MANAGED !== "1",
    "Disposable managed environment required",
  );
  const option = (id: string, name: string) => ({
    id,
    productId: id,
    name,
    archived: false,
    counter: "0.00",
    pedidosya: "0.00",
    ubereats: "0.00",
  });
  await page.route("**/api/sales/lookup?**", async (route) => {
    if (new URL(route.request().url()).searchParams.get("kind") !== "products")
      return route.continue();
    await route.fulfill({
      json: {
        rows: [
          {
            id: "combo",
            name: "Combo waffle",
            kind: "combo",
            price: "10000.00",
          },
        ],
        total: 1,
        categories: [],
        offset: 0,
      },
    });
  });
  await page.route("**/api/sales/products/combo/combo?**", (route) =>
    route.fulfill({
      json: {
        basePrice: "10000.00",
        definition: {
          id: "combo-v1",
          groups: [
            {
              id: "waffles",
              name: "Waffle",
              quantity: 1,
              options: [option("classic", "Classic"), option("salah", "Salah")],
            },
            {
              id: "drinks",
              name: "Bebida",
              quantity: 1,
              options: [option("soda", "Gaseosa")],
            },
          ],
        },
      },
    }),
  );
  const calls: Record<string, number> = {};
  await page.route("**/api/sales/products/*/configuration?**", (route) => {
    const id = new URL(route.request().url()).pathname.split("/")[4];
    calls[id] = (calls[id] ?? 0) + 1;
    return route.fulfill({
      json: {
        basePrice: "8000.00",
        fulfillmentVersionId: id + "-fv",
        recipeVersionId: id === "soda" ? null : id + "-rv",
        model: "configurable",
        groups:
          id === "soda"
            ? []
            : [
                {
                  id: id + "-masa",
                  name: "Masa",
                  min: 1,
                  max: 1,
                  options: [
                    {
                      id: id + "-chipa",
                      name: "Masa chipá",
                      price: "300.00",
                      available: true,
                      maxCount: 1,
                      defaultCount: 0,
                    },
                    {
                      id: id + "-comun",
                      name: "Masa común",
                      price: "0.00",
                      available: true,
                      maxCount: 1,
                      defaultCount: 0,
                    },
                  ],
                },
              ],
      },
    });
  });
  await page.goto("/login");
  await page.getByLabel("Usuario o correo").fill(process.env.E2E_EMAIL!);
  await page.getByLabel("Contraseña").fill(process.env.E2E_PASSWORD!);
  await page.getByRole("button", { name: "Ingresar", exact: true }).click();
  await expect(page).toHaveURL(/\/(?:settings\/branches)?$/, {
    timeout: 45000,
  });
  const branches = await (await page.request.get("/api/branches")).json();
  const selected = await page.request.post("/api/branches/select", {
    data: { branchId: branches.rows[0].id },
    headers: { Origin: new URL(page.url()).origin },
  });
  expect(selected.ok(), await selected.text()).toBe(true);
  await page.goto("/sales");
  await page
    .getByRole("button", { name: "Agregar Combo waffle", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "Classic", exact: true }).click();
  await expect(
    dialog.getByRole("button", { name: "Confirmar opción" }),
  ).toBeDisabled();
  await dialog.getByRole("radio", { name: "Masa chipá" }).check();
  await dialog.getByRole("button", { name: "Confirmar opción" }).click();
  await dialog.getByRole("button", { name: "Salah", exact: true }).click();
  await expect(
    dialog.getByRole("radio", { name: "Masa chipá" }),
  ).not.toBeChecked();
  await expect(
    dialog.getByRole("button", { name: "Agregar combo", exact: true }),
  ).toBeDisabled();
  await dialog.getByRole("radio", { name: "Masa común" }).check();
  await dialog.getByRole("button", { name: "Confirmar opción" }).click();
  await dialog.getByRole("button", { name: "Gaseosa", exact: true }).click();
  await expect(
    dialog.getByRole("button", { name: "Confirmar opción" }),
  ).toHaveCount(0);
  await dialog
    .getByRole("button", { name: "Agregar combo", exact: true })
    .click();
  await page
    .getByRole("button", {
      name: "Editar opciones de Combo waffle",
      exact: true,
    })
    .click();
  await expect(
    dialog.getByRole("button", { name: "Agregar combo", exact: true }),
  ).toBeEnabled();
  await dialog.getByRole("button", { name: "Salah", exact: true }).click();
  await expect(dialog.getByRole("radio", { name: "Masa común" })).toBeChecked();
  expect(calls.salah).toBe(2); // Once initially and once to validate restored versions; reopening uses the modal cache.
  await dialog.getByRole("button", { name: "Confirmar opción" }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(
    dialog.getByRole("button", { name: "Agregar combo", exact: true }),
  ).toBeVisible();
  await page.screenshot({ path: ".local/combos/mobile.png", fullPage: true });
  await dialog
    .getByRole("button", { name: "Agregar combo", exact: true })
    .click();
  await expect(
    page.getByTestId("cart-line").getByText(/1 × Salah \(incluido\)/),
  ).toBeVisible();
});
