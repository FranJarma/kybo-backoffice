import { test, expect, type Page, type BrowserContext } from "@playwright/test";

const email = process.env.E2E_EMAIL;
const password = process.env.E2E_PASSWORD;
test.skip(!email || !password, "Set E2E_EMAIL and E2E_PASSWORD");

let sharedCookies: Awaited<ReturnType<BrowserContext["cookies"]>> | undefined;
async function signIn(page: Page) {
  if (sharedCookies) {
    await page.context().addCookies(sharedCookies);
    await page.goto("/");
    await expect(page).toHaveURL("/");
    return;
  }
  await page.goto("/login");
  await page.getByLabel("Correo electrónico").fill(email!);
  await page.getByLabel("Contraseña").fill(password!);
  await page.getByRole("button", { name: "Ingresar" }).click();
  await expect(page).toHaveURL("/", { timeout: 20_000 });
  sharedCookies = await page.context().cookies();
}
async function createCatalog(
  page: Page,
  entity: string,
  body: Record<string, unknown>,
) {
  const response = await page.request.post(`/api/catalog/${entity}`, {
    data: body,
    headers: { Origin: new URL(page.url()).origin },
  });
  expect(response.ok(), await response.text()).toBe(true);
  return (await response.json()).row as { id: string };
}

test("receives two packages as base stock, pays separately, then records waste and count", async ({
  page,
}, testInfo) => {
  await signIn(page);
  const suffix = Date.now().toString();
  const supplier = await createCatalog(page, "suppliers", {
    name: `Proveedor ${suffix}`,
  });
  const ingredient = await createCatalog(page, "ingredients", {
    name: `Harina ${suffix}`,
    baseUnit: "g",
    unitCost: "",
  });
  const presentation = await createCatalog(page, "presentations", {
    name: `Bolsa 800 ${suffix}`,
    supplierId: supplier.id,
    ingredientId: ingredient.id,
    baseQuantity: "800",
  });
  const paymentMethod = await createCatalog(page, "payment-methods", {
    name: `Efectivo ${suffix}`,
    kind: "cash",
  });
  await page.goto("/purchases");
  await page.getByRole("button", { name: "Nueva recepción" }).click();
  await page
    .getByRole("combobox", { name: "Proveedor" })
    .selectOption(supplier.id);
  await page
    .getByRole("combobox", { name: "Insumo", exact: true })
    .selectOption(ingredient.id);
  await page
    .getByRole("combobox", { name: "Presentación" })
    .selectOption(presentation.id);
  await page.getByRole("textbox", { name: "Cantidad recibida" }).fill("2");
  await page
    .getByRole("textbox", { name: "Precio por presentación o unidad" })
    .fill("1000");
  await page.getByRole("button", { name: "Revisar recepción" }).click();
  await expect(page.getByText(/1\.600.*g/i)).toBeVisible();
  await page.getByRole("button", { name: "Confirmar recepción" }).click();
  await expect(page.getByText(/2\.000,00/).first()).toBeVisible();
  await page.getByRole("button", { name: "Registrar pago" }).click();
  await page
    .getByRole("combobox", { name: "Medio de pago" })
    .selectOption(paymentMethod.id);
  await page.getByRole("textbox", { name: "Importe pagado" }).fill("500");
  await page.getByRole("button", { name: "Confirmar pago" }).click();
  await expect(page.getByText(/1\.500,00/).first()).toBeVisible();
  await page.goto("/inventory");
  await page
    .getByRole("searchbox", { name: "Buscar insumo" })
    .fill(`Harina ${suffix}`);
  await expect(page.getByText(`Harina ${suffix}`).first()).toBeVisible();
  await expect(page.getByText(/1\.600.*g/).first()).toBeVisible();
  await page.reload();
  await page
    .getByRole("searchbox", { name: "Buscar insumo" })
    .fill(`Harina ${suffix}`);
  await page
    .getByRole("button", { name: new RegExp(`Ver lotes de Harina ${suffix}`) })
    .click();
  await page.getByRole("button", { name: "Registrar merma" }).click();
  await page.getByRole("textbox", { name: "Cantidad a descartar" }).fill("100");
  await page.getByRole("textbox", { name: "Motivo" }).fill("Envase dañado");
  await page.getByRole("button", { name: "Confirmar merma" }).click();
  await expect(page.getByText(/1\.500.*g/).first()).toBeVisible();
  await page.getByRole("button", { name: "Registrar conteo" }).click();
  await page.getByRole("textbox", { name: "Cantidad contada" }).fill("1400");
  await page.getByRole("textbox", { name: "Motivo" }).fill("Conteo físico");
  await page.getByRole("button", { name: "Confirmar conteo" }).click();
  await expect(page.getByText(/1\.400.*g/).first()).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath("inventory-desktop.png"),
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  await page
    .getByRole("searchbox", { name: "Buscar insumo" })
    .fill(`Harina ${suffix}`);
  await expect(page.getByText(/1\.400.*g/).first()).toBeVisible();
  await page
    .getByRole("button", { name: new RegExp(`Ver lotes de Harina ${suffix}`) })
    .click();
  await expect(
    page.getByRole("heading", { name: "Lotes", exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Envase dañado")).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
  ).toBe(false);
  await page.screenshot({
    path: testInfo.outputPath("inventory-mobile.png"),
    fullPage: true,
  });
});

test("an uncertain reception retains the identical operation for retry", async ({
  page,
}) => {
  await signIn(page);
  const suffix = Date.now().toString();
  const supplier = await createCatalog(page, "suppliers", {
    name: `Proveedor reintento ${suffix}`,
  });
  const ingredient = await createCatalog(page, "ingredients", {
    name: `Cacao ${suffix}`,
    baseUnit: "g",
    unitCost: "",
  });
  await page.goto("/purchases");
  await page.getByRole("button", { name: "Nueva recepción" }).click();
  await page
    .getByRole("combobox", { name: "Proveedor" })
    .selectOption(supplier.id);
  await page
    .getByRole("combobox", { name: "Insumo", exact: true })
    .selectOption(ingredient.id);
  await page.getByRole("textbox", { name: "Cantidad recibida" }).fill("4");
  await page.getByRole("button", { name: "Revisar recepción" }).click();
  let submitted: unknown;
  await page.route("**/api/purchases", async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    const payload = route.request().postDataJSON();
    if (!submitted) {
      submitted = payload;
      await route.fetch();
      return route.abort();
    }
    expect(payload).toEqual(submitted);
    return route.continue();
  });
  await page.getByRole("button", { name: "Confirmar recepción" }).click();
  await expect(
    page.getByText("Operación pendiente de confirmar"),
  ).toContainText(/reintent|confirmar/i);
  await page.reload();
  await expect(
    page.getByText("Operación pendiente de confirmar"),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Nueva recepción" }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Reintentar el mismo envío" }).click();
  await expect(page.getByText(`Cacao ${suffix}`).first()).toBeVisible();
  await expect(page.getByText("Pendiente").first()).toBeVisible();
  const result = await page.request.get(
    `/api/purchases?q=${encodeURIComponent(suffix)}`,
  );
  expect(result.ok()).toBe(true);
  const data = await result.json();
  expect(
    data.rows.filter(
      (row: { supplierId: string }) => row.supplierId === supplier.id,
    ),
  ).toHaveLength(1);
});

test("review converts Argentine grouped decimals exactly before confirmation", async ({
  page,
}) => {
  await signIn(page);
  const suffix = Date.now().toString();
  const supplier = await createCatalog(page, "suppliers", {
    name: `Proveedor decimal ${suffix}`,
  });
  const ingredient = await createCatalog(page, "ingredients", {
    name: `Azúcar ${suffix}`,
    baseUnit: "g",
    unitCost: "",
  });
  const presentation = await createCatalog(page, "presentations", {
    name: `Bolsa 800 ${suffix}`,
    supplierId: supplier.id,
    ingredientId: ingredient.id,
    baseQuantity: "800",
  });
  await page.goto("/purchases");
  await page.getByRole("button", { name: "Nueva recepción" }).click();
  await page
    .getByRole("combobox", { name: "Proveedor" })
    .selectOption(supplier.id);
  await page
    .getByRole("combobox", { name: "Insumo", exact: true })
    .selectOption(ingredient.id);
  await page
    .getByRole("combobox", { name: "Presentación" })
    .selectOption(presentation.id);
  await page
    .getByRole("textbox", { name: "Cantidad recibida" })
    .fill("1.000,5");
  await page.getByRole("button", { name: "Revisar recepción" }).click();
  await expect(page.getByText(/800\.400 g/)).toBeVisible();
});

test("opening another receipt clears the previous receipt payment draft", async ({
  page,
}) => {
  await signIn(page);
  const suffix = Date.now().toString();
  const supplier = await createCatalog(page, "suppliers", {
    name: `Proveedor cambio ${suffix}`,
  });
  const ingredient = await createCatalog(page, "ingredients", {
    name: `Insumo cambio ${suffix}`,
    baseUnit: "unit",
    unitCost: "",
  });
  const method = await createCatalog(page, "payment-methods", {
    name: `Caja ${suffix}`,
    kind: "cash",
  });
  const origin = new URL(page.url()).origin;
  const receive = async (reference: string) => {
    const response = await page.request.post("/api/purchases", {
      headers: { Origin: origin },
      data: {
        requestId: crypto.randomUUID(),
        supplierId: supplier.id,
        receivedOn: new Intl.DateTimeFormat("en-CA", {
          timeZone: "America/Argentina/Salta",
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
        }).format(new Date()),
        documentNumber: reference,
        lines: [
          {
            ingredientId: ingredient.id,
            quantity: "1",
            unitPrice: "100",
            discount: "0",
          },
        ],
      },
    });
    expect(response.ok(), await response.text()).toBe(true);
    return (await response.json()).receipt.id as string;
  };
  const first = await receive(`A-${suffix}`);
  const second = await receive(`B-${suffix}`);
  await page.goto("/purchases");
  await page.getByRole("button", { name: "Ver detalle" }).nth(1).click();
  await expect(page.getByText(`A-${suffix}`)).toBeVisible();
  await page.getByRole("button", { name: "Registrar pago" }).click();
  await page
    .getByRole("combobox", { name: "Medio de pago" })
    .selectOption(method.id);
  await page.getByRole("textbox", { name: "Importe pagado" }).fill("35");
  await page.getByRole("button", { name: "Volver al listado" }).click();
  await page.getByRole("button", { name: "Ver detalle" }).first().click();
  await expect(page.getByText(`B-${suffix}`)).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Confirmar pago" }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Registrar pago" }).click();
  await expect(
    page.getByRole("textbox", { name: "Importe pagado" }),
  ).toHaveValue("");
  await page
    .getByRole("combobox", { name: "Medio de pago" })
    .selectOption(method.id);
  await page.getByRole("textbox", { name: "Importe pagado" }).fill("47");
  await page.getByRole("textbox", { name: "Referencia" }).fill("Borrador de B");
  await page.getByRole("button", { name: "Volver al listado" }).click();
  await page.getByRole("button", { name: "Nueva recepción" }).click();
  await page
    .getByRole("combobox", { name: "Proveedor" })
    .selectOption(supplier.id);
  await page
    .getByRole("combobox", { name: "Insumo", exact: true })
    .selectOption(ingredient.id);
  await page.getByRole("textbox", { name: "Cantidad recibida" }).fill("1");
  await page
    .getByRole("textbox", { name: "Precio por presentación o unidad" })
    .fill("100");
  await page.getByRole("button", { name: "Revisar recepción" }).click();
  await page.getByRole("button", { name: "Confirmar recepción" }).click();
  await page.getByRole("button", { name: "Registrar pago" }).click();
  await expect(
    page.getByRole("textbox", { name: "Importe pagado" }),
  ).toHaveValue("");
  const firstReceipt = await page.request.get(`/api/purchases/${first}`);
  const secondReceipt = await page.request.get(`/api/purchases/${second}`);
  expect((await firstReceipt.json()).receipt.payments).toHaveLength(0);
  expect((await secondReceipt.json()).receipt.payments).toHaveLength(0);
});
