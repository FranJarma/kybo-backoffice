import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
test.use({ hasTouch: true });

test("touch register adds directly, preserves uncertain payment and refreshes stock alerts", async ({
  page,
}) => {
  test.setTimeout(240000);
  test.skip(process.env.E2E_MANAGED !== "1", "Disposable database required");
  await page.setViewportSize({ width: 1024, height: 768 });
  await page.goto("/login");
  await page.getByLabel("Usuario o correo").fill(process.env.E2E_EMAIL!);
  await page.getByLabel("Contraseña").fill(process.env.E2E_PASSWORD!);
  await page.getByRole("button", { name: "Ingresar", exact: true }).tap();
  await expect(page).toHaveURL(/\/(?:settings\/branches)?$/, {
    timeout: 45000,
  });
  const headers = { Origin: new URL(page.url()).origin };
  const post = async (url: string, data: unknown) => {
    const response = await page.request.post(url, { headers, data });
    expect(response.ok(), await response.text()).toBe(true);
    return response.json();
  };
  const branches = await (await page.request.get("/api/branches")).json();
  const branchId = branches.rows[0].id;
  await post("/api/branches/select", { branchId });
  const setup = await (await page.request.get("/api/products/setup")).json();
  const locationId = setup.locations[0].id;
  const name = `Gaseosa táctil ${Date.now()}`;
  const product = (
    await post("/api/catalog/products", {
      name,
      priceCounter: "2500",
      pricePedidosYa: "",
      priceUberEats: "",
      setup: {
        mode: "direct",
        branchId,
        dispatchLocationId: locationId,
        quantity: "1",
        source: { newItem: { name, class: "beverage", unitCost: "1200" } },
      },
    })
  ).row;
  const physical = await (
    await page.request.get(`/api/products/${product.id}/fulfillment`)
  ).json();
  await post("/api/inventory/adjustments", {
    requestId: randomUUID(),
    kind: "opening",
    itemId: physical.itemId,
    locationId,
    quantity: "10",
    unitCost: "1200",
    receivedOn: new Date().toISOString().slice(0, 10),
  });
  const method = (
    await post("/api/catalog/payment-methods", {
      name: `Efectivo táctil ${Date.now()}`,
      kind: "cash",
    })
  ).row;
  const extraNames = ["Gaseosa breve A", "Gaseosa breve B", "Gaseosa breve C"];
  for (const extraName of extraNames)
    await post("/api/catalog/products", {
      name: extraName,
      priceCounter: "2000",
      pricePedidosYa: "",
      priceUberEats: "",
      setup: {
        mode: "direct",
        branchId,
        dispatchLocationId: locationId,
        quantity: "1",
        source: {
          newItem: { name: extraName, class: "beverage", unitCost: "1000" },
        },
      },
    });
  await post("/api/inventory/replenishment", {
    requestId: randomUUID(),
    policy: {
      itemId: physical.itemId,
      locationId,
      minimumQuantity: "8",
      targetQuantity: "15",
      preparationMinutes: null,
      enabled: true,
    },
  });
  await page.goto("/sales");
  await expect(
    page.getByRole("heading", { name: "Punto de venta", exact: true }),
  ).toBeVisible();
  await expect(page.getByText(/Al confirmar se reserva el stock/)).toHaveCount(
    0,
  );
  await page.getByRole("button", { name: "Ayuda de stock", exact: true }).tap();
  await expect(
    page.getByRole("dialog").getByText(/Al confirmar se reserva el stock/),
  ).toBeVisible();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Entendido", exact: true })
    .tap();
  await expect(page.getByText(/Al confirmar se reserva el stock/)).toHaveCount(
    0,
  );
  await expect(
    page.getByRole("button", { name: "Cobrar", exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Registrar sin cargo", exact: true }),
  ).toHaveCount(0);
  const add = page.getByRole("button", {
    name: `Agregar ${name}`,
    exact: true,
  });
  await expect(add).toBeVisible({ timeout: 30000 });
  const box = await add.boundingBox();
  expect(box!.y + box!.height).toBeLessThan(768);
  expect(box!.height).toBeGreaterThanOrEqual(48);
  await add.tap();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await add.tap();
  await expect(page.getByTestId("cart-total")).toHaveText(/5\.000/);
  await expect(
    page.getByRole("button", { name: `Aumentar ${name}`, exact: true }),
  ).toHaveCount(1);
  await expect(
    page.getByRole("textbox", { name: `Precio de ${name}`, exact: true }),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: `Editar precio de ${name}`, exact: true })
    .tap();
  const editor = page.getByRole("dialog");
  await editor
    .getByRole("textbox", { name: `Precio de ${name}`, exact: true })
    .fill("2700");
  await expect(
    editor.getByRole("button", { name: "Guardar cambios", exact: true }),
  ).toBeDisabled();
  await editor.getByRole("button", { name: "Cancelar", exact: true }).tap();
  await expect(page.getByTestId("cart-total")).toHaveText(/5\.000/);
  await page
    .getByRole("button", {
      name: `Editar observaciones de ${name}`,
      exact: true,
    })
    .tap();
  await editor
    .getByRole("textbox", { name: `Observaciones de ${name}`, exact: true })
    .fill("Bien fría");
  await editor
    .getByRole("button", { name: "Guardar cambios", exact: true })
    .tap();
  await expect(
    page.getByTestId("cart-line").getByText("Nota: Bien fría", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Agregar nota al pedido", exact: true })
    .tap();
  await editor
    .getByRole("textbox", { name: "Observaciones del pedido", exact: true })
    .fill("Para llevar");
  await editor.getByRole("button", { name: "Guardar nota", exact: true }).tap();
  await expect(
    page.getByRole("button", { name: "Nota: Para llevar", exact: true }),
  ).toBeVisible();
  for (const extraName of extraNames)
    await page
      .getByRole("button", { name: `Agregar ${extraName}`, exact: true })
      .tap();
  await page.setViewportSize({ width: 1906, height: 945 });
  await expect(page.getByTestId("cart-line")).toHaveCount(4);
  const orderBounds = await page.getByTestId("cart-lines").boundingBox();
  const fourthLineBounds = await page
    .getByTestId("cart-line")
    .nth(3)
    .boundingBox();
  expect(fourthLineBounds!.y + fourthLineBounds!.height).toBeLessThanOrEqual(
    orderBounds!.y + orderBounds!.height,
  );
  await expect(page.getByRole("textbox", { name: /^Precio de / })).toHaveCount(
    0,
  );
  await page.screenshot({
    path: "docs/previews/touch-pos-order-compact.png",
    fullPage: true,
  });
  for (const extraName of extraNames)
    await page
      .getByRole("button", { name: `Quitar ${extraName}`, exact: true })
      .tap();
  await page.setViewportSize({ width: 1024, height: 768 });
  await expect(page.getByTestId("cart-total")).toHaveText(/5\.000/);
  let catalogueCalls = 0;
  page.on("request", (request) => {
    if (request.url().includes("/api/sales/lookup?kind=products"))
      catalogueCalls++;
  });
  await page.getByRole("button", { name: "Sin categoría", exact: true }).tap();
  await page
    .getByRole("textbox", { name: "Buscar productos", exact: true })
    .fill("tactil");
  await expect(add).toBeVisible();
  expect(catalogueCalls).toBe(0);
  await page.getByRole("button", { name: "Cobrar", exact: true }).tap();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: method.name, exact: true }).tap();
  await dialog.getByLabel("Efectivo recibido 1").fill("10000");
  await expect(dialog.getByText(/Vuelto:/)).toHaveText(/5\.000/);
  let savedSale: { id: string; number: number } | undefined;
  let intercepted = false;
  await page.route("**/api/sales", async (route) => {
    if (route.request().method() !== "POST" || intercepted)
      return route.continue();
    intercepted = true;
    const response = await route.fetch();
    expect(response.ok(), await response.text()).toBe(true);
    savedSale = await response.json();
    await route.abort("failed");
  });
  await dialog
    .getByRole("button", { name: "Confirmar cobro", exact: true })
    .tap();
  await expect(
    dialog.getByRole("button", { name: "Reintentar mismo envío", exact: true }),
  ).toBeVisible();
  await dialog
    .getByRole("button", { name: "Reintentar mismo envío", exact: true })
    .tap();
  await expect(dialog).toBeHidden();
  await expect(page.getByTestId("cart-total")).toHaveText(/0,00/);
  await expect(
    page.getByRole("button", {
      name: `Última venta #${savedSale!.number}`,
      exact: true,
    }),
  ).toBeVisible();
  const detail = await (
    await page.request.get(`/api/sales/${savedSale!.id}`)
  ).json();
  expect(detail.totalAmount).toBe("5000.00");
  expect(detail.paidAmount).toBe("5000.00");
  expect(detail.orders[0].lines[0].quantity).toBe(2);
  await page.getByRole("button", { name: /^Reposición/ }).tap();
  await expect(
    page.getByRole("dialog").getByRole("heading", { name, exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("dialog").getByText("8 unid.", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Cerrar", exact: true })
    .tap();
  for (const viewport of [
    { width: 1440, height: 900 },
    { width: 768, height: 1024 },
    { width: 390, height: 844 },
  ]) {
    await page.setViewportSize(viewport);
    await expect(page.locator("body")).toHaveJSProperty(
      "scrollWidth",
      viewport.width,
    );
    await expect(
      page.getByRole("button", { name: "Cobrar", exact: true }),
    ).toBeVisible();
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.screenshot({
    path: "docs/previews/touch-pos-desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 768, height: 1024 });
  await page.screenshot({
    path: "docs/previews/touch-pos-tablet.png",
    fullPage: true,
  });
});
