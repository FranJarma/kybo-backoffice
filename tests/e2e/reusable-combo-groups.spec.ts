import { test, expect } from "@playwright/test";

test("reusable product groups can be shared and reviewed independently in real combo forms", async ({
  page,
}) => {
  test.setTimeout(240000);
  test.skip(
    process.env.E2E_MANAGED !== "1",
    "Disposable managed database required",
  );
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/login");
  await page.getByLabel("Usuario o correo").fill(process.env.E2E_EMAIL!);
  await page.getByLabel("Contraseña").fill(process.env.E2E_PASSWORD!);
  await page.getByRole("button", { name: "Ingresar", exact: true }).click();
  await expect(page).toHaveURL("/", { timeout: 45000 });
  const origin = new URL(page.url()).origin;
  const headers = { Origin: origin };
  const branches = await (await page.request.get("/api/branches")).json();
  const branchId = branches.rows[0].id;
  expect(
    (
      await page.request.post("/api/branches/select", {
        data: { branchId },
        headers,
      })
    ).ok(),
  ).toBe(true);
  const setup = await (await page.request.get("/api/products/setup")).json();
  const suffix = Date.now();
  const names = [
    `Pepsi grupo ${suffix}`,
    `7up grupo ${suffix}`,
    `Max grupo ${suffix}`,
  ];
  const productIds: string[] = [];
  for (const name of names) {
    const response = await page.request.post("/api/catalog/products", {
      headers,
      data: {
        name,
        priceCounter: "3000",
        pricePedidosYa: "",
        priceUberEats: "",
        setup: {
          mode: "direct",
          branchId,
          dispatchLocationId: setup.locations[0].id,
          quantity: "1",
          source: { newItem: { name, class: "beverage", unitCost: "1200" } },
        },
      },
    });
    expect(response.ok(), await response.text()).toBe(true);
    productIds.push((await response.json()).row.id);
  }
  const comboNames = [
    `Combo A ${suffix}`,
    `Combo B ${suffix}`,
    `Combo propio ${suffix}`,
  ];
  const comboIds: string[] = [];
  for (const name of comboNames) {
    const response = await page.request.post("/api/catalog/products", {
      headers,
      data: {
        name,
        kind: "combo",
        priceCounter: "5000",
        pricePedidosYa: "",
        priceUberEats: "",
        setup: { mode: "combo", branchId },
      },
    });
    expect(response.ok(), await response.text()).toBe(true);
    comboIds.push((await response.json()).row.id);
  }
  const groupName = `Gaseosas compartidas ${suffix}`;
  await page.goto("/products/combo-groups");
  await expect(
    page
      .getByRole("navigation", { name: "Principal" })
      .getByRole("link", { name: "Grupos de opciones" }),
  ).toHaveAttribute("aria-current", "page");
  await page
    .getByRole("button", { name: "Nuevo grupo de productos", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  await dialog
    .getByRole("textbox", { name: "Nombre del grupo", exact: true })
    .fill(groupName);
  for (const name of names.slice(0, 2)) {
    await dialog
      .getByRole("combobox", { name: "Buscar producto para el grupo" })
      .fill(name);
    await dialog.getByRole("option", { name, exact: true }).click();
  }
  await dialog
    .getByRole("button", { name: "Guardar grupo", exact: true })
    .click();
  await expect(dialog).toBeHidden();
  const allGroups = await (
    await page.request.get("/api/product-option-groups")
  ).json();
  const shared = allGroups.find((g: { name: string }) => g.name === groupName);
  expect(shared).toMatchObject({ revision: 1, productCount: 2 });
  const openCombo = async (name: string) => {
    await page.goto("/products");
    await page
      .getByRole("row", { name: new RegExp(name) })
      .getByRole("button", { name: "Editar", exact: true })
      .click();
    await dialog.getByRole("tab", { name: "Componentes", exact: true }).click();
  };
  const readCombo = async (index: number) =>
    (await page.request.get(`/api/products/${comboIds[index]}/combo`)).json();
  for (const index of [0, 1]) {
    await openCombo(comboNames[index]);
    await dialog
      .getByRole("button", { name: "Usar grupo existente", exact: true })
      .click();
    await dialog
      .getByRole("combobox", { name: "Elegir grupo existente" })
      .fill(groupName);
    await dialog.getByRole("option", { name: groupName, exact: true }).click();
    await expect(
      dialog.getByText("Grupo compartido · Versión 1", { exact: true }),
    ).toBeVisible();
    await dialog
      .getByLabel("Unidades por combo", { exact: true })
      .fill(String(index + 1));
    if (!index)
      await dialog
        .getByLabel("Adicional Mostrador", { exact: true })
        .first()
        .fill("100");
    await dialog
      .getByRole("button", { name: "Publicar componentes", exact: true })
      .click();
    await expect(
      page.getByText("Los componentes del combo están publicados.", {
        exact: true,
      }),
    ).toBeVisible();
    await expect.poll(async () => (await readCombo(index))?.revision).toBe(1);
    await dialog
      .getByRole("button", { name: "Cerrar formulario", exact: true })
      .click();
  }
  await page.goto("/products/combo-groups");
  await page
    .getByRole("button", { name: `Editar ${groupName}`, exact: true })
    .click();
  await dialog
    .getByRole("button", { name: `Quitar ${names[1]}`, exact: true })
    .click();
  await dialog
    .getByRole("combobox", { name: "Buscar producto para el grupo" })
    .fill(names[2]);
  await dialog.getByRole("option", { name: names[2], exact: true }).click();
  await dialog
    .getByRole("button", { name: "Publicar nueva versión", exact: true })
    .click();
  await expect(dialog).toBeHidden();
  for (const index of [0, 1])
    expect(
      (await readCombo(index)).groups[0].options.map(
        (o: { productId: string }) => o.productId,
      ),
    ).toEqual(productIds.slice(0, 2));
  await openCombo(comboNames[0]);
  await expect(
    dialog.getByText("Hay una actualización disponible", { exact: true }),
  ).toBeVisible();
  await dialog
    .getByRole("button", { name: "Revisar cambios", exact: true })
    .click();
  await expect(
    dialog.getByRole("region", { name: "Revisión del grupo" }),
  ).toContainText(`Se agregan: ${names[2]}`);
  await dialog
    .getByRole("button", { name: "Cancelar revisión", exact: true })
    .click();
  expect((await readCombo(0)).revision).toBe(1);
  await dialog
    .getByRole("button", { name: "Revisar cambios", exact: true })
    .click();
  await page.screenshot({
    path: ".local/reusable-groups/review-desktop.png",
    fullPage: true,
  });
  await dialog
    .getByRole("button", { name: "Aplicar al borrador", exact: true })
    .click();
  expect((await readCombo(0)).revision).toBe(1);
  await expect(
    dialog.getByLabel("Adicional Mostrador", { exact: true }).first(),
  ).toHaveValue("100.00");
  await expect(
    dialog.getByLabel("Adicional Mostrador", { exact: true }).last(),
  ).toHaveValue("0");
  await page.setViewportSize({ width: 390, height: 844 });
  await dialog
    .getByRole("button", { name: "Publicar componentes", exact: true })
    .scrollIntoViewIfNeeded();
  await page.screenshot({
    path: ".local/reusable-groups/editor-mobile.png",
    fullPage: true,
  });
  await dialog
    .getByRole("button", { name: "Publicar componentes", exact: true })
    .click();
  await expect.poll(async () => (await readCombo(0)).revision).toBe(2);
  expect(
    (await readCombo(0)).groups[0].options.map(
      (o: { productId: string }) => o.productId,
    ),
  ).toEqual([productIds[0], productIds[2]]);
  expect((await readCombo(1)).groups[0]).toMatchObject({
    quantity: 2,
    source: { revision: 1, latestRevision: 2 },
  });
  await dialog
    .getByRole("button", { name: "Cerrar formulario", exact: true })
    .click();
  await page.setViewportSize({ width: 1440, height: 1000 });
  const own = await page.request.post(`/api/products/${comboIds[2]}/combo`, {
    headers,
    data: {
      requestId: crypto.randomUUID(),
      revision: 0,
      groups: [
        {
          name: `Propio ${suffix}`,
          quantity: 2,
          options: [{ productId: productIds[0], counter: "50" }],
        },
        {
          name: `Propio ${suffix}`,
          quantity: 3,
          options: [{ productId: productIds[0], counter: "75" }],
        },
      ],
    },
  });
  expect(own.ok(), await own.text()).toBe(true);
  await openCombo(comboNames[2]);
  await dialog
    .getByRole("button", {
      name: "Guardar como grupo reutilizable",
      exact: true,
    })
    .first()
    .click();
  await expect(
    dialog.getByText("Grupo compartido · Versión 1", { exact: true }),
  ).toBeVisible();
  expect((await readCombo(2)).groups[0].source).toBeNull();
  await dialog
    .getByRole("button", {
      name: "Guardar como grupo reutilizable",
      exact: true,
    })
    .click();
  await dialog
    .getByRole("button", { name: "Publicar componentes", exact: true })
    .click();
  await expect.poll(async () => (await readCombo(2)).revision).toBe(2);
  expect((await readCombo(2)).groups[0]).toMatchObject({
    quantity: 2,
    source: { revision: 1 },
    options: [{ counter: "50.00" }],
  });
  const converted = (await readCombo(2)).groups;
  expect(converted[0].source.groupId).not.toBe(converted[1].source.groupId);
  expect(converted[1]).toMatchObject({
    quantity: 3,
    options: [{ counter: "75.00" }],
  });
  await dialog
    .getByRole("button", { name: "Cerrar formulario", exact: true })
    .click();
  await page.goto("/products/combo-groups");
  await page
    .getByRole("button", { name: `Archivar ${groupName}`, exact: true })
    .click();
  let responseLost = false;
  await page.route(
    `**/api/product-option-groups/${shared.id}`,
    async (route) => {
      if (route.request().method() === "PATCH" && !responseLost) {
        responseLost = true;
        const response = await route.fetch();
        expect(response.ok()).toBe(true);
        await route.abort("failed");
      } else await route.continue();
    },
  );
  await dialog
    .getByRole("button", { name: "Archivar grupo", exact: true })
    .click();
  await expect.poll(() => responseLost).toBe(true);
  await expect(
    dialog.getByRole("button", { name: "Archivar grupo", exact: true }),
  ).toBeEnabled();
  await dialog
    .getByRole("button", { name: "Archivar grupo", exact: true })
    .click();
  await expect(dialog).toBeHidden();
  const afterArchive = await readCombo(1);
  expect(afterArchive.groups[0].source).toMatchObject({
    archived: true,
    revision: 1,
  });
});
