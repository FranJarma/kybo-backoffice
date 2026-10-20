import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";

test("shows completed cost batches, keeps failures visible and reuses costs through UI changes", async ({
  page,
}) => {
  test.setTimeout(180000);
  test.skip(process.env.E2E_MANAGED !== "1", "Disposable database required");
  await page.goto("/login");
  await page.getByLabel("Usuario o correo").fill(process.env.E2E_EMAIL!);
  await page.getByLabel("Contraseña").fill(process.env.E2E_PASSWORD!);
  await page.getByRole("button", { name: "Ingresar", exact: true }).click();
  await expect(page).toHaveURL(/\/(?:settings\/branches)?$/, {
    timeout: 45000,
  });
  const productIds = Array.from({ length: 60 }, () => randomUUID()).sort();
  const products = productIds.map((id, i) => ({
    id,
    name: `Artículo ${String(i).padStart(2, "0")}`,
    revision: 1,
    archivedAt: null,
    categoryName: null,
    kind: "individual",
    priceCounter: "5000",
    pricePedidosYa: "0",
    priceUberEats: null,
    vatRate: "21",
    enabledCounter: true,
    enabledPedidosYa: true,
    enabledUberEats: true,
  }));
  await page.route("**/api/catalog/products?*", async (route) => {
    const q = new URL(route.request().url()).searchParams.get("q") ?? "";
    const rows = products.filter((p) => p.name.includes(q));
    await route.fulfill({ json: { rows, total: rows.length } });
  });
  let release!: () => void;
  const firstBatch = new Promise<void>((resolve) => {
    release = resolve;
  });
  let fail = true;
  let fresh = false;
  let requests = 0;
  await page.route("**/api/products/costs", async (route) => {
    requests++;
    const ids = route.request().postDataJSON().ids as string[];
    expect(ids.length).toBeLessThanOrEqual(50);
    if (ids.length === 50) await firstBatch;
    if (ids.length === 10 && fail) {
      await route.fulfill({
        status: 503,
        json: { error: "Fallo transitorio" },
      });
      return;
    }
    await route.fulfill({
      json: {
        branchName: "Prueba de carga",
        products: ids.map((productId) => ({
          productId,
          status: "ready",
          min: fresh ? "200.000000" : "100.000000",
          max: fresh ? "200.000000" : "100.000000",
          fixed: fresh ? "200.000000" : "100.000000",
          defaultCost: fresh ? "200.000000" : "100.000000",
          groups: [],
          referenceItems: [],
        })),
      },
    });
  });
  await page.goto("/products");
  const first = page.getByRole("row").filter({ hasText: "Artículo 00" });
  const last = page.getByRole("row").filter({ hasText: "Artículo 59" });
  await expect(last.getByText("No disponible", { exact: true })).toBeVisible();
  release();
  await expect(first).toContainText("100,00");
  await expect(last.getByText("No disponible", { exact: true })).toBeVisible();
  await expect(first.getByText(/^\$\s*0,00$/)).toBeVisible();
  await expect(first.getByText("Sin precio", { exact: true })).toBeVisible();
  const search = page.getByRole("textbox", {
    name: "Buscar catálogo y precios",
    exact: true,
  });
  await search.fill("Artículo 00");
  await expect(last).toHaveCount(0);
  await expect(first).toContainText("100,00");
  expect(requests).toBe(2);
  fail = false;
  await search.clear();
  await expect(last).toContainText("100,00");
  expect(requests).toBe(3);
  fresh = true;
  await page
    .getByRole("button", { name: "Actualizar lista", exact: true })
    .click();
  await expect(first).toContainText("200,00");
  await expect(last).toContainText("200,00");
  expect(requests).toBe(5);
});
