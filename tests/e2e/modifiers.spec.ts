import { test, expect } from "@playwright/test";
import {
  restoreAdminSession,
  saveAdminSession,
} from "../helpers/browser-session";
test("manages reusable modifier groups from recipes", async ({ page }) => {
  test.setTimeout(90000);
  test.skip(!process.env.E2E_EMAIL, "Temporary credentials required");
  if (!(await restoreAdminSession(page))) {
    await page.goto("/login");
    await page.getByLabel("Correo electrónico").fill(process.env.E2E_EMAIL!);
    await page.getByLabel("Contraseña").fill(process.env.E2E_PASSWORD!);
    await page.getByRole("button", { name: "Ingresar" }).click();
    await expect(page).toHaveURL("/", { timeout: 25000 });
    await saveAdminSession(page);
  }
  await page.goto("/products/recipes");
  await page.getByRole("main").getByRole("link", { name: "Modificadores" }).click();
  await page.getByRole("button", { name: "Nuevo grupo" }).click();
  await page.getByLabel("Nombre del grupo").fill("Cocción de prueba");
  await page.getByLabel("Nombre de opción 1").fill("Bien cocido");
  await page.getByLabel("Tipo de opción 1").selectOption("instruction");
  await page.getByRole("button", { name: "Publicar grupo" }).click();
  await expect(
    page.getByRole("button", { name: "Editar Cocción de prueba" }),
  ).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator("body")).toHaveJSProperty("scrollWidth", 390);
});

test("costs configurations, sells separate rows and retains kitchen history", async ({
  page,
}) => {
  test.setTimeout(120000);
  test.skip(!process.env.E2E_EMAIL, "Temporary credentials required");
  if (!(await restoreAdminSession(page))) {
    await page.goto("/login");
    await page.getByLabel("Correo electrónico").fill(process.env.E2E_EMAIL!);
    await page.getByLabel("Contraseña").fill(process.env.E2E_PASSWORD!);
    await page.getByRole("button", { name: "Ingresar" }).click();
    await expect(page).toHaveURL("/", { timeout: 25000 });
    await saveAdminSession(page);
  }
  await page.goto("/products/recipes");
  const post = async (url: string, data: unknown) => {
    const r = await page.request.post(url, {
      data,
      headers: { Origin: new URL(page.url()).origin },
    });
    expect(r.ok(), await r.text()).toBe(true);
    return r.json();
  };
  const item = (
    await post("/api/catalog/items", {
      name: "Perlas E2E",
      baseUnit: "g",
      unitCost: "2",
    })
  ).row;
  const product = (
    await post("/api/catalog/products", {
      name: "Tea configurable E2E",
      priceCounter: "7000",
      pricePedidosYa: "",
      priceUberEats: "",
    })
  ).row;
  const method = (
    await post("/api/catalog/payment-methods", {
      name: "Efectivo modificadores",
      kind: "cash",
    })
  ).row;
  const groupInput = {
    requestId: crypto.randomUUID(),
    name: "Perlas E2E",
    options: [
      {
        key: "t",
        name: "Tapioca E2E",
        kind: "composition",
        components: [{ itemId: item.id, quantity: "10" }],
      },
      {
        key: "e",
        name: "Explosivas E2E",
        kind: "composition",
        components: [{ itemId: item.id, quantity: "20" }],
      },
    ],
  };
  const group = await post("/api/modifier-groups", groupInput);
  const recipe = await post("/api/recipes", {
    requestId: crypto.randomUUID(),
    kind: "product",
    targetId: product.id,
    yieldQuantity: "1",
    compositionModel: "configurable",
    lines: [],
    groups: [
      {
        groupVersionId: group.versionId,
        name: "Perlas",
        min: 1,
        max: 1,
        factor: "1",
        options: group.options.map((o: { id: string }, i: number) => ({
          optionId: o.id,
          enabled: true,
          defaultCount: i === 0 ? 1 : 0,
          maxCount: 1,
          mode: "inherit",
          prices: { counter: i === 0 ? "0" : "500" },
        })),
      },
    ],
  });
  await page.reload();
  await page.getByRole("textbox", { name: "Buscar receta" }).fill(product.name);
  await page
    .getByRole("button", { name: `Ver receta de ${product.name}`, exact: true })
    .first()
    .click();
  await expect(page.getByText("Comparar combinaciones")).toBeVisible();
  await page.getByLabel("Comparar Tapioca E2E").fill("0");
  const response = page.waitForResponse(
    (r) =>
      r.url().includes(`/api/recipes/${recipe.id}/cost`) &&
      r
        .request()
        .postDataJSON()
        ?.modifiers?.some((s: { count: number }) => s.count === 1),
  );
  await page.getByLabel("Comparar Explosivas E2E").fill("1");
  expect((await (await response).json()).totalCost).toBe("40.000000");
  await page.goto("/sales");
  await page.getByLabel("Buscar productos").fill(product.name);
  await page
    .getByRole("button", { name: `Agregar ${product.name}`, exact: true })
    .click();
  await page
    .getByRole("button", { name: "Agregar al pedido", exact: true })
    .click();
  await page
    .getByRole("button", { name: `Agregar ${product.name}`, exact: true })
    .click();
  await page.getByRole("radio", { name: /Explosivas E2E/ }).check();
  await page
    .getByRole("button", { name: "Agregar al pedido", exact: true })
    .click();
  await expect(page.getByTestId("cart-total")).toContainText("14.500");
  await expect(
    page.getByRole("button", { name: "Editar opciones" }),
  ).toHaveCount(2);
  await page.getByRole("button", { name: "Editar opciones" }).nth(1).click();
  await page.getByRole("radio", { name: /Explosivas E2E/ }).check();
  await page
    .getByRole("button", { name: "Agregar al pedido", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Editar opciones" }),
  ).toHaveCount(2);
  await page
    .getByRole("button", { name: "Cobrar y registrar", exact: true })
    .click();
  await page
    .getByRole("combobox", { name: "Medio de pago 1" })
    .selectOption(method.id);
  const saleResponse = page.waitForResponse(
    (r) => r.url().endsWith("/api/sales") && r.request().method() === "POST",
  );
  await page
    .getByRole("button", { name: "Confirmar cobro", exact: true })
    .click();
  const result = await saleResponse;
  const sale = await result.json();
  expect(sale.orders[0].lines).toHaveLength(2);
  await post("/api/modifier-groups", {
    ...groupInput,
    requestId: crypto.randomUUID(),
    id: group.id,
    revision: 1,
    options: groupInput.options.map((o) => ({ ...o, name: "Nombre cambiado" })),
  });
  const replay = await post("/api/sales", result.request().postDataJSON());
  expect(replay.id).toBe(sale.id);
  expect(replay.orders[0].lines[1].modifiers[0].optionName).toBe(
    "Explosivas E2E",
  );
  await page.goto("/kitchen");
  await expect(page.getByText(/Explosivas E2E/).first()).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator("body")).toHaveJSProperty("scrollWidth", 390);
});
