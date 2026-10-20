import { test, expect } from "@playwright/test";
test("opens recipe and costing panels without duplicate React keys", async ({
  page,
}) => {
  test.setTimeout(180000);
  test.skip(process.env.E2E_MANAGED !== "1", "Disposable database required");
  const keyWarnings: string[] = [];
  page.on("console", (message) => {
    if (
      /Encountered two children with the same key|Each child in a list should have a unique/i.test(
        message.text(),
      )
    )
      keyWarnings.push(message.text());
  });
  await page.goto("/login");
  await page.getByLabel("Usuario o correo").fill(process.env.E2E_EMAIL!);
  await page.getByLabel("Contraseña").fill(process.env.E2E_PASSWORD!);
  await page.getByRole("button", { name: "Ingresar", exact: true }).click();
  await expect(page).toHaveURL(/\/(?:settings\/branches)?$/, {
    timeout: 45000,
  });
  const headers = { Origin: new URL(page.url()).origin };
  const branches = await (await page.request.get("/api/branches")).json();
  const selection = await page.request.post("/api/branches/select", {
    headers,
    data: { branchId: branches.rows[0].id },
  });
  expect(selection.ok(), await selection.text()).toBe(true);
  const name = `Producto con receta ${Date.now()}`;
  const created = await page.request.post("/api/catalog/products", {
    headers,
    data: {
      name,
      vatRate: "21",
      priceCounter: "6000",
      pricePedidosYa: "",
      priceUberEats: "",
    },
  });
  expect(created.ok(), await created.text()).toBe(true);
  await page.goto("/products");
  await page
    .getByRole("row")
    .filter({ hasText: name })
    .getByRole("button", { name: "Editar", exact: true })
    .click();
  const modal = page.getByRole("dialog");
  await modal.getByRole("tab", { name: "Receta", exact: true }).click();
  await modal
    .getByRole("button", {
      name: "Agregar ingrediente o descartable",
      exact: true,
    })
    .click();
  await modal
    .getByRole("textbox", { name: "Cantidad de componente 1", exact: true })
    .fill("125");
  await modal.getByRole("tab", { name: "Costeo", exact: true }).click();
  await expect(
    modal.getByRole("region", {
      name: "Rentabilidad por medio de pago",
      exact: true,
    }),
  ).toBeVisible();
  const detail = modal.getByRole("button", {
    name: "Ingredientes y variantes",
    exact: true,
  });
  await expect(detail).toHaveAttribute("aria-expanded", "false");
  await detail.click();
  await expect(detail).toHaveAttribute("aria-expanded", "true");
  await expect(
    modal.getByRole("region", {
      name: "Costo estimado de la receta",
      exact: true,
    }),
  ).toBeVisible();
  await detail.click();
  await modal.getByRole("tab", { name: "Receta", exact: true }).click();
  await expect(
    modal.getByRole("textbox", {
      name: "Cantidad de componente 1",
      exact: true,
    }),
  ).toHaveValue("125");
  await modal.getByRole("tab", { name: "Costeo", exact: true }).click();
  expect(keyWarnings).toEqual([]);
});
