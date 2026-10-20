import { test, expect } from "@playwright/test";

test("loads product costs and authenticates after changing the local server port", async ({
  page,
}) => {
  test.setTimeout(180000);
  test.skip(
    process.env.E2E_MANAGED !== "1" || process.env.E2E_ORIGIN_MISMATCH !== "1",
    "Requires a disposable database and different configured/runtime ports",
  );
  await page.goto("/login");
  const actualOrigin = new URL(page.url()).origin;
  expect(new URL(process.env.BETTER_AUTH_URL!).origin).not.toBe(actualOrigin);
  await page.getByLabel("Usuario o correo").fill(process.env.E2E_EMAIL!);
  await page.getByLabel("Contraseña").fill(process.env.E2E_PASSWORD!);
  await page.getByRole("button", { name: "Ingresar", exact: true }).click();
  await expect(page).toHaveURL(/\/(?:settings\/branches)?$/, {
    timeout: 45000,
  });
  const post = async (path: string, data: unknown) => {
    const response = await page.request.post(path, {
      headers: { Origin: actualOrigin },
      data,
    });
    expect(response.ok(), await response.text()).toBe(true);
    return response.json();
  };
  const branches = await (await page.request.get("/api/branches")).json();
  await post("/api/branches/select", { branchId: branches.rows[0].id });
  const setup = await (await page.request.get("/api/products/setup")).json();
  const name = `Gaseosa puerto local ${Date.now()}`;
  const { row: product } = await post("/api/catalog/products", {
    name,
    vatRate: "21",
    priceCounter: "3000",
    pricePedidosYa: "",
    priceUberEats: "",
    setup: {
      mode: "direct",
      branchId: setup.branch.id,
      dispatchLocationId: setup.locations[0].id,
      quantity: "1",
      source: { newItem: { name, class: "beverage", unitCost: "1200" } },
    },
  });
  await page.goto("/products");
  const row = page.getByRole("row").filter({ hasText: name });
  await expect(row).toContainText("1.200,00");
  await expect(row).not.toContainText("No disponible");
  await expect(
    page.getByText("El origen de la solicitud no está autorizado.", {
      exact: true,
    }),
  ).toHaveCount(0);
  await row.getByRole("button", { name: "Editar", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("tab", { name: "Costeo", exact: true }).click();
  await expect(dialog.getByTestId("costing-direct")).toContainText("1.200,00");
  await expect(dialog.getByTestId("costing-price")).toContainText("3.000,00");
  const denied = await page.request.post("/api/products/costs", {
    headers: { Origin: "https://attacker.example" },
    data: { ids: [product.id] },
  });
  expect(denied.status()).toBe(403);
  expect(await denied.json()).toMatchObject({ code: "FORBIDDEN" });
});
