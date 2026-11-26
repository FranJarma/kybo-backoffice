import { test, expect } from "@playwright/test";

test("preloads beyond the first eight products and reuses options when editing", async ({
  page,
}) => {
  test.setTimeout(120000);
  test.skip(process.env.E2E_MANAGED !== "1", "Disposable database required");
  await page.setViewportSize({ width: 1280, height: 800 });
  const calls = new Map<string, number>();
  const mediaSizes: (string | null)[] = [];
  let catalogueCalls = 0;
  const rows = Array.from({ length: 12 }, (_, i) => ({
    id: `tea-${i}`,
    name: `Tea ${i}`,
    price: "5000.00",
    categoryId: "tea",
    imageAssetId: i === 11 ? "90000000-0000-4000-8000-000000000011" : null,
    fulfillmentVersionId: `physical-${i}`,
  }));
  await page.route(
    "**/api/media/90000000-0000-4000-8000-000000000011?**",
    (route) => {
      mediaSizes.push(new URL(route.request().url()).searchParams.get("size"));
      return route.fulfill({ status: 404, body: "Missing fixture photo" });
    },
  );
  await page.route("**/api/sales/lookup?**", (route) => {
    if (new URL(route.request().url()).searchParams.get("kind") !== "products")
      return route.continue();
    catalogueCalls++;
    return route.fulfill({
      json: {
        rows,
        total: rows.length,
        categories: [{ id: "tea", name: "Tés" }],
        offset: 0,
      },
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
  await page
    .getByLabel("Usuario", { exact: true })
    .fill(process.env.E2E_USERNAME!);
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
  const { activeFamily, posFamily, loaded } = await page
    .locator("[data-pos]")
    .evaluate(async (surface) => {
      const firstFamily = (value: string) =>
        value
          .split(",")[0]
          .trim()
          .replace(/^['"]|['"]$/g, "");
      const style = getComputedStyle(surface);
      const activeFamily = firstFamily(style.fontFamily);
      const posFamily = firstFamily(style.getPropertyValue("--font-pos"));
      await document.fonts.ready;
      const loaded = Array.from(document.fonts).some(
        (face) =>
          firstFamily(face.family) === activeFamily && face.status === "loaded",
      );
      return { activeFamily, posFamily, loaded };
    });
  expect(posFamily).toBeTruthy();
  expect(activeFamily).toBe(posFamily);
  expect(loaded).toBe(true);
  await expect.poll(() => calls.get("tea-11"), { timeout: 10000 }).toBe(1);
  const photoProduct = page.getByRole("button", {
    name: "Agregar Tea 11",
    exact: true,
  });
  await photoProduct.scrollIntoViewIfNeeded();
  await expect(
    photoProduct.getByLabel("Sin foto", { exact: true }),
  ).toBeVisible();
  expect(mediaSizes).toContain("thumbnail");
  expect(mediaSizes.every((size) => size === "thumbnail")).toBe(true);
  await page
    .getByRole("button", { name: "Agregar Tea 11", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("radio", { name: "Mango" })).toBeChecked();
  await dialog
    .getByRole("button", { name: "Agregar al pedido", exact: true })
    .click();
  await expect(page.getByTestId("cart-total")).toHaveText(/5\.300/);
  const beforeResize = Object.fromEntries(calls);
  expect(catalogueCalls).toBe(1);
  expect(calls.size).toBe(rows.length);
  expect([...calls.values()]).toEqual(Array(rows.length).fill(1));
  const selectedProduct = page.getByRole("button", {
    name: "Agregar Tea 11",
    exact: true,
  });
  for (const viewport of [
    { width: 768, height: 1024 },
    { width: 390, height: 844 },
    { width: 1280, height: 800 },
  ]) {
    await page.setViewportSize(viewport);
    await expect(
      selectedProduct.getByText("1 en pedido", { exact: true }),
    ).toBeVisible();
    await expect(page.getByTestId("cart-line")).toHaveCount(1);
    await expect(page.getByTestId("cart-total")).toHaveText(/5\.300/);
    await page
      .getByRole("textbox", { name: "Buscar productos", exact: true })
      .fill("Tea 11");
    await expect(
      selectedProduct.getByText("1 en pedido", { exact: true }),
    ).toBeVisible();
    await page
      .getByRole("textbox", { name: "Buscar productos", exact: true })
      .fill("");
    await page.getByRole("button", { name: "Tés", exact: true }).click();
    await expect(
      selectedProduct.getByText("1 en pedido", { exact: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Todas", exact: true }).click();
    expect(catalogueCalls).toBe(1);
    expect(Object.fromEntries(calls)).toEqual(beforeResize);
  }
  await page
    .getByRole("button", { name: "Editar opciones de Tea 11", exact: true })
    .click();
  await expect(dialog.getByRole("radio", { name: "Mango" })).toBeChecked();
  expect(calls.get("tea-11")).toBe(1);
  expect(catalogueCalls).toBe(1);
  await dialog.getByRole("button", { name: "Cancelar", exact: true }).click();
  await page.getByRole("button", { name: "Herramientas", exact: true }).click();
  await page
    .getByRole("button", { name: "Actualizar carta", exact: true })
    .click();
  await expect.poll(() => calls.get("tea-11"), { timeout: 10000 }).toBe(2);
  expect(catalogueCalls).toBe(2);
});
