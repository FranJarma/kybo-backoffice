import { test, expect } from "@playwright/test";

test("preloads beyond the first eight products and reuses options when editing", async ({
  page,
}) => {
  test.setTimeout(120000);
  test.skip(process.env.E2E_MANAGED !== "1", "Disposable database required");
  const calls = new Map<string, number>();
  const rows = Array.from({ length: 12 }, (_, i) => ({
    id: `tea-${i}`,
    name: `Tea ${i}`,
    price: "5000.00",
    fulfillmentVersionId: `physical-${i}`,
  }));
  await page.route("**/api/sales/lookup?**", (route) => {
    if (new URL(route.request().url()).searchParams.get("kind") !== "products")
      return route.continue();
    return route.fulfill({
      json: { rows, total: rows.length, categories: [], offset: 0 },
    });
  });
  await page.route("**/api/sales/products/*/configuration?**", (route) => {
    const id = new URL(route.request().url()).pathname.split("/")[4];
    calls.set(id, (calls.get(id) ?? 0) + 1);
    return route.fulfill({
      json: {
        basePrice: "5000.00",
        fulfillmentVersionId: `physical-${id.split("-")[1]}`,
        recipeVersionId: `recipe-${id}`,
        model: "configurable",
        groups: [
          {
            id: "pearls",
            name: "Perlas",
            min: 1,
            max: 1,
            options: [
              {
                id: "mango",
                name: "Mango",
                defaultCount: 1,
                maxCount: 1,
                price: "300.00",
                available: true,
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
  expect(selected.ok()).toBe(true);
  await page.goto("/sales");
  await expect.poll(() => calls.get("tea-11"), { timeout: 10000 }).toBe(1);
  await page
    .getByRole("button", { name: "Agregar Tea 11", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("radio", { name: "Mango" })).toBeChecked();
  await dialog
    .getByRole("button", { name: "Agregar al pedido", exact: true })
    .click();
  await expect(page.getByTestId("cart-total")).toHaveText(/5\.300/);
  await page
    .getByRole("button", { name: "Editar opciones de Tea 11", exact: true })
    .click();
  await expect(dialog.getByRole("radio", { name: "Mango" })).toBeChecked();
  expect(calls.get("tea-11")).toBe(1);
  await dialog.getByRole("button", { name: "Cancelar", exact: true }).click();
  await page
    .getByRole("button", { name: "Actualizar carta", exact: true })
    .click();
  await expect.poll(() => calls.get("tea-11"), { timeout: 10000 }).toBe(2);
});
