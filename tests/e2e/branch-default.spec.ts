import { expect, test } from "@playwright/test";

test("assigned managers enter their branch automatically and cannot configure locations", async ({
  page,
  browser,
}) => {
  test.setTimeout(180000);
  page.setDefaultTimeout(15000);
  test.skip(process.env.E2E_MANAGED !== "1", "Disposable database required");
  const login = async (
    target: typeof page,
    identifier: string,
    password: string,
  ) => {
    await target.goto(new URL("/login", page.url()).href);
    await target.getByLabel("Usuario o correo").fill(identifier);
    await target.getByLabel("Contraseña").fill(password);
    await target.getByRole("button", { name: "Ingresar", exact: true }).click();
    await expect(target).toHaveURL(/\/$/, { timeout: 45000 });
  };
  await page.goto("/login");
  await login(page, process.env.E2E_EMAIL!, process.env.E2E_PASSWORD!);
  const origin = new URL(page.url()).origin;
  const headers = { Origin: origin };
  const initial = await (
    await page.request.get("/api/branches/current")
  ).json();
  expect(initial.branch.id).toBeTruthy();
  const addBranch = async (code: string, name: string) => {
    const response = await page.request.post("/api/branches", {
      headers,
      data: {
        code,
        name,
        timeZone: "America/Argentina/Buenos_Aires",
        locations: [{ name: "Barra" }],
      },
    });
    expect(response.status(), await response.text()).toBe(201);
    return (await response.json()).id as string;
  };
  const second = await addBranch("DEFAULT_Z", "Z segundo local");
  const foreign = await addBranch("DEFAULT_FOREIGN", "Local sin asignar");
  const created = await page.request.post("/api/settings/users", {
    headers,
    data: {
      requestId: crypto.randomUUID(),
      name: "Encargado de prueba",
      username: "manager_default",
      email: "",
      password: "ManagerTest-123!",
      role: "manager",
      disabled: false,
      catalogManager: true,
      memberships: [
        { branchId: initial.branch.id, role: "manager" },
        { branchId: second, role: "manager" },
      ],
    },
  });
  expect(created.ok(), await created.text()).toBe(true);
  const managerId = (await created.json()).id;
  const paymentResponse = await page.request.post(
    "/api/catalog/payment-methods",
    { headers, data: { name: "Efectivo del administrador", kind: "cash" } },
  );
  expect(paymentResponse.status(), await paymentResponse.text()).toBe(201);
  const payment = (await paymentResponse.json()).row;
  const managerContext = await browser.newContext();
  const manager = await managerContext.newPage();
  manager.setDefaultTimeout(15000);
  try {
    await manager.goto(origin + "/login");
    await login(manager, "manager_default", "ManagerTest-123!");
    await expect(manager.getByLabel("Sucursal", { exact: true })).toHaveValue(
      initial.branch.id,
    );
    await expect(
      manager.getByRole("link", {
        name: "Sucursales y ubicaciones",
        exact: true,
      }),
    ).toHaveCount(0);
    await expect(
      manager.getByRole("link", { name: "Medios de pago", exact: true }),
    ).toHaveCount(0);
    await expect
      .poll(
        async () =>
          (await managerContext.cookies()).find(
            (cookie) => cookie.name === "kybo-branch",
          )?.value,
        { timeout: 15000 },
      )
      .toBe(initial.branch.id);
    await manager.screenshot({ path: ".local/branch-manager-default.png" });
    await manager.goto(origin + "/settings/branches");
    await expect(manager).toHaveURL(origin + "/");
    await expect(
      manager.getByRole("button", { name: "Agregar ubicación" }),
    ).toHaveCount(0);
    await manager.goto(origin + "/settings/payment-methods");
    await expect(manager).toHaveURL(origin + "/");
    expect(
      (
        await manager.request.post(origin + "/api/catalog/payment-methods", {
          headers,
          data: { name: "No autorizado", kind: "cash" },
        })
      ).status(),
    ).toBe(403);
    expect(
      (
        await manager.request.patch(
          origin + `/api/catalog/payment-methods/${payment.id}`,
          { headers, data: { revision: payment.revision, archived: true } },
        )
      ).status(),
    ).toBe(403);
    const availableMethods = await manager.request.get(
      origin + "/api/sales/lookup?kind=payment-methods",
    );
    expect(availableMethods.ok(), await availableMethods.text()).toBe(true);
    expect(
      (await availableMethods.json()).rows.some(
        (row: { id: string }) => row.id === payment.id,
      ),
    ).toBe(true);
    const url = origin + `/api/branches/${initial.branch.id}/locations`;
    const before = await (await manager.request.get(url)).json();
    expect(
      (
        await manager.request.post(url, {
          headers,
          data: { name: "No autorizada" },
        })
      ).status(),
    ).toBe(403);
    const existing = before.rows[0];
    expect(
      (
        await manager.request.delete(url, {
          headers,
          data: { locationId: existing.id, revision: existing.revision },
        })
      ).status(),
    ).toBe(403);
    expect((await (await manager.request.get(url)).json()).rows).toEqual(
      before.rows,
    );
    const switchResponse = manager.waitForResponse(
      (response) =>
        response.url().endsWith("/api/branches/select") &&
        response.request().method() === "POST",
    );
    await manager.getByLabel("Sucursal", { exact: true }).selectOption(second);
    expect((await switchResponse).ok()).toBe(true);
    await expect(manager.getByLabel("Sucursal", { exact: true })).toHaveValue(
      second,
    );
    await manager.reload();
    await expect(manager.getByLabel("Sucursal", { exact: true })).toHaveValue(
      second,
    );
    expect(
      (
        await (
          await manager.request.get(origin + "/api/branches/current")
        ).json()
      ).branch.id,
    ).toBe(second);
    await managerContext.addCookies([
      { name: "kybo-branch", value: foreign, url: origin },
    ]);
    await manager.goto(origin + "/");
    await expect(manager.getByLabel("Sucursal", { exact: true })).toHaveValue(
      initial.branch.id,
    );
    await expect
      .poll(
        async () =>
          (await managerContext.cookies()).find(
            (cookie) => cookie.name === "kybo-branch",
          )?.value,
        { timeout: 15000 },
      )
      .toBe(initial.branch.id);
    expect(
      (
        await manager.request.get(origin + "/api/branches/current", {
          headers: { "X-Kybo-Branch-Id": foreign },
        })
      ).status(),
    ).toBe(403);
    for (const branchId of [initial.branch.id, second]) {
      expect(
        (
          await page.request.put(`/api/branches/${branchId}/members`, {
            headers,
            data: { userId: managerId, role: "manager", revoked: true },
          })
        ).ok(),
      ).toBe(true);
    }
    await manager.goto(origin + "/");
    await expect(manager).toHaveURL(origin + "/branch-assignment");
    await expect(
      manager.getByRole("heading", { name: "Falta asignar tu sucursal" }),
    ).toBeVisible();
  } finally {
    await managerContext.close();
  }
});
