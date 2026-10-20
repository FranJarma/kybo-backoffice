import { test, expect } from "@playwright/test";
test("creates and edits resale products with inventory and branch setup entirely in the product form", async ({
  page,
}) => {
  test.setTimeout(120000);
  test.skip(
    process.env.E2E_MANAGED !== "1",
    "Managed disposable environment required",
  );
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/login");
  await page.getByLabel("Usuario o correo").fill(process.env.E2E_EMAIL!);
  await page.getByLabel("Contraseña").fill(process.env.E2E_PASSWORD!);
  await page.getByRole("button", { name: "Ingresar", exact: true }).click();
  await expect(page).toHaveURL("/", { timeout: 45000 });
  const branches = await (await page.request.get("/api/branches")).json();
  const branchId = branches.rows[0].id;
  const selected = await page.request.post("/api/branches/select", {
    data: { branchId },
    headers: { Origin: new URL(page.url()).origin },
  });
  expect(selected.ok(), await selected.text()).toBe(true);
  await page.goto("/products");
  const name = `Pepsi integrada ${Date.now()}`;
  await page
    .getByRole("button", { name: "Nuevo producto", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("textbox", { name: "Nombre", exact: true }).fill(name);
  await dialog
    .getByRole("combobox", { name: "Tipo de producto", exact: true })
    .selectOption("direct");
  await expect(
    dialog.getByRole("tab", { name: "Receta", exact: true }),
  ).toHaveCount(0);
  await dialog
    .getByRole("combobox", { name: "Artículo de inventario", exact: true })
    .selectOption("new");
  await dialog
    .getByRole("textbox", { name: /^Costo de compra por unidad/ })
    .fill("1000");
  await dialog.getByLabel("Precio mostrador", { exact: false }).fill("2500");
  await expect(
    dialog.getByLabel("Unidades de inventario por venta", { exact: false }),
  ).toHaveValue("1");
  await page.screenshot({
    path: ".local/combos/onboarding-desktop.png",
    fullPage: true,
  });
  await dialog.getByRole("button", { name: "Guardar", exact: true }).click();
  await expect(dialog).toBeHidden();
  const createdList = await (
    await page.request.get(
      "/api/catalog/products?q=" + encodeURIComponent(name),
    )
  ).json();
  const product = createdList.rows.find(
    (row: { name: string }) => row.name === name,
  );
  expect(product).toBeTruthy();
  const physical = await (
    await page.request.get(`/api/products/${product.id}/fulfillment`)
  ).json();
  expect(physical).toMatchObject({ mode: "direct", quantity: "1.000000" });
  const local = await (
    await page.request.get(`/api/branches/${branchId}/products/${product.id}`)
  ).json();
  expect(local.enabled).toBe(true);
  expect(local.dispatchLocationId).toBeTruthy();
  const cost = await page.request.post("/api/products/costs", {
    data: { ids: [product.id] },
    headers: { Origin: new URL(page.url()).origin },
  });
  expect((await cost.json()).products[0]).toMatchObject({
    status: "ready",
    min: "1000.000000",
  });
  await page
    .getByRole("row", { name: new RegExp(name) })
    .getByRole("button", { name: "Editar", exact: true })
    .click();
  await expect(
    dialog.getByRole("combobox", { name: "Tipo de producto", exact: true }),
  ).toHaveValue("direct");
  await expect(
    dialog.getByRole("combobox", { name: "Buscar artículo", exact: true }),
  ).toHaveValue(name);
  await dialog.getByLabel("Precio mostrador", { exact: false }).fill("2800");
  await dialog.getByRole("button", { name: "Guardar", exact: true }).click();
  await expect(dialog).toBeHidden();
  const unchanged = await (
    await page.request.get(`/api/products/${product.id}/fulfillment`)
  ).json();
  expect(unchanged.id).toBe(physical.id);
  await page
    .getByRole("button", { name: "Nuevo producto", exact: true })
    .click();
  await dialog
    .getByRole("textbox", { name: "Nombre", exact: true })
    .fill(`${name} alternativa`);
  await dialog
    .getByRole("combobox", { name: "Tipo de producto", exact: true })
    .selectOption("direct");
  await dialog
    .getByRole("combobox", { name: "Buscar artículo", exact: true })
    .fill(name);
  await dialog.getByRole("option", { name, exact: true }).click();
  await dialog.getByLabel("Precio mostrador", { exact: false }).fill("2700");
  await page.setViewportSize({ width: 390, height: 844 });
  await dialog
    .getByRole("button", { name: "Guardar", exact: true })
    .scrollIntoViewIfNeeded();
  await page.screenshot({
    path: ".local/combos/onboarding-mobile.png",
    fullPage: true,
  });
  await dialog.getByRole("button", { name: "Guardar", exact: true }).click();
  await expect(dialog).toBeHidden();
  const alternatives = await (
    await page.request.get(
      "/api/catalog/products?q=" + encodeURIComponent(name),
    )
  ).json();
  const alternative = alternatives.rows.find(
    (row: { name: string }) => row.name === name + " alternativa",
  );
  expect(alternative).toBeTruthy();
  const sameItem = await (
    await page.request.get(`/api/products/${alternative.id}/fulfillment`)
  ).json();
  expect(sameItem.itemId).toBe(physical.itemId);
  const listed = await (
    await page.request.get(
      `/api/sales/lookup?kind=products&channel=counter&q=${encodeURIComponent(name)}`,
    )
  ).json();
  expect(listed.rows.map((r: { id: string }) => r.id)).toEqual(
    expect.arrayContaining([product.id, alternative.id]),
  );
});
