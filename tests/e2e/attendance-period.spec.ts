import { expect, test, type Page } from "@playwright/test";

test.setTimeout(90_000);
test.use({
  storageState: process.env.KYBO_ATTENDANCE_PERIOD_AUTHSTATE,
  actionTimeout: 15000,
});
test.skip(
  process.env.KYBO_ATTENDANCE_PERIOD_FIXTURE !== "disposable-only" ||
    !process.env.KYBO_ATTENDANCE_PERIOD_AUTHSTATE ||
    new URL(process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost").port !==
      "3042",
  "Solo la instancia descartable de horarios, en el puerto de pruebas.",
);
async function openPeriod(page: Page, from: string, to: string) {
  // Pin only the fixture's displayed current week; the requests still query
  // the disposable database and the real scheduling API for those dates.
  await page.route("**/api/attendance**", async (route) => {
    if (
      new URL(route.request().url()).pathname !== "/api/attendance" ||
      route.request().method() !== "GET"
    )
      return route.continue();
    const response = await route.fetch();
    const data = await response.json();
    await route.fulfill({ response, json: { ...data, today: "2026-11-03" } });
  });
  await page.goto("/staff/schedule");
  await page
    .getByRole("button", { name: "Asignar varios días", exact: true })
    .click();
  const drawer = page.getByRole("dialog", {
    name: "Asignar varios días",
    exact: true,
  });
  await drawer
    .getByRole("combobox", { name: "Empleado", exact: true })
    .fill("Constanza");
  await page.getByRole("option", { name: /Constanza/ }).click();
  await drawer
    .getByRole("combobox", { name: "Turno habitual", exact: true })
    .fill("Turno mañana");
  await page.getByRole("option", { name: /Turno mañana/ }).click();
  await drawer.getByLabel(/^Desde/).fill(from);
  await drawer.getByLabel(/^Hasta/).fill(to);
  return drawer;
}

test("asigna una semana, informa el franco omitido y conserva la edición individual", async ({
  page,
}) => {
  const drawer = await openPeriod(page, "2026-11-02", "2026-11-08");
  await drawer
    .getByRole("button", { name: "Revisar fechas", exact: true })
    .click();
  await expect(
    drawer.getByText("6 por agregar", { exact: true }),
  ).toBeVisible();
  await expect(
    drawer.getByText("Franco ya asignado", { exact: true }),
  ).toBeVisible();
  await drawer
    .getByRole("button", { name: "Confirmar 6 horarios", exact: true })
    .click();
  await expect(
    drawer.getByRole("heading", { name: "Horarios asignados", exact: true }),
  ).toBeVisible();
  await expect(
    drawer.getByText("6 horarios agregados", { exact: true }),
  ).toBeVisible();
  await expect(
    drawer.getByText("Franco ya asignado", { exact: true }),
  ).toBeVisible();
  await expect(drawer.getByRole("button", { name: /Confirmar/ })).toHaveCount(
    0,
  );
  await drawer.getByRole("button", { name: "Listo", exact: true }).click();
  const response = await page.request.get(
    "/api/attendance?from=2026-11-02&to=2026-11-08",
  );
  const data = await response.json();
  const employee = data.people.find((p: { name: string }) =>
    p.name.includes("Constanza"),
  );
  const assignments = data.assignments.filter(
    (a: { userId: string }) => a.userId === employee.id,
  );
  expect(assignments).toHaveLength(7);
  expect(
    assignments.find(
      (a: { businessDate: string }) => a.businessDate === "2026-11-03",
    ).kind,
  ).toBe("off");
  await page
    .getByRole("button", { name: "Turno mañana", exact: false })
    .first()
    .click();
  await expect(
    page.getByRole("dialog", { name: "Editar horario", exact: true }),
  ).toBeVisible();
});

test("varias semanas permiten elegir días e invalidan la revisión al editar", async ({
  page,
}) => {
  const drawer = await openPeriod(page, "2026-12-07", "2026-12-20");
  await drawer.getByRole("checkbox", { name: "Sábado", exact: true }).uncheck();
  await drawer
    .getByRole("checkbox", { name: "Domingo", exact: true })
    .uncheck();
  await drawer
    .getByRole("button", { name: "Revisar fechas", exact: true })
    .click();
  await expect(
    drawer.getByText("10 por agregar", { exact: true }),
  ).toBeVisible();
  await drawer.getByLabel(/^Hasta/).fill("2026-12-13");
  await expect(drawer.getByRole("button", { name: /Confirmar/ })).toHaveCount(
    0,
  );
  await drawer
    .getByRole("button", { name: "Revisar fechas", exact: true })
    .click();
  await expect(
    drawer.getByText("5 por agregar", { exact: true }),
  ).toBeVisible();
});

test("conserva una fecha ocupada después de revisar y muestra el resultado real", async ({
  page,
}) => {
  const drawer = await openPeriod(page, "2026-11-16", "2026-11-17");
  await drawer
    .getByRole("button", { name: "Revisar fechas", exact: true })
    .click();
  await expect(
    drawer.getByText("2 por agregar", { exact: true }),
  ).toBeVisible();
  const data = await (await page.request.get("/api/attendance")).json();
  const employee = data.people.find((p: { name: string }) =>
    p.name.includes("Constanza"),
  );
  const occupied = await page.request.post("/api/attendance", {
    headers: { Origin: new URL(page.url()).origin },
    data: {
      requestId: crypto.randomUUID(),
      command: {
        action: "assign",
        userId: employee.id,
        businessDate: "2026-11-17",
        kind: "off",
      },
    },
  });
  expect(occupied.status()).toBe(200);
  await drawer
    .getByRole("button", { name: "Confirmar 2 horarios", exact: true })
    .click();
  await expect(
    drawer.getByText("1 horario agregado", { exact: true }),
  ).toBeVisible();
  await expect(
    drawer.getByText("Franco ya asignado", { exact: true }),
  ).toBeVisible();
});

test("una revisión demorada no reaparece después de cambiar el período y se puede reintentar un error", async ({
  page,
}) => {
  const drawer = await openPeriod(page, "2027-01-04", "2027-01-10");
  let release!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  let requested = false;
  await page.route("**/api/attendance/schedule-preview", async (route) => {
    requested = true;
    const response = await route.fetch();
    await held;
    await route.fulfill({ response }).catch(() => {});
  });
  await drawer
    .getByRole("button", { name: "Revisar fechas", exact: true })
    .click();
  await expect.poll(() => requested).toBe(true);
  await drawer.getByLabel(/^Hasta/).fill("2027-01-05");
  release();
  await expect(drawer.getByRole("button", { name: /Confirmar/ })).toHaveCount(
    0,
  );
  await page.unroute("**/api/attendance/schedule-preview");
  await page.route("**/api/attendance/schedule-preview", (route) =>
    route.fulfill({
      status: 503,
      json: { error: "Prueba de consulta no disponible" },
    }),
  );
  await drawer
    .getByRole("button", { name: "Revisar fechas", exact: true })
    .click();
  await expect(drawer.getByRole("alert")).toContainText(
    "Prueba de consulta no disponible",
  );
  await page.unroute("**/api/attendance/schedule-preview");
  await drawer
    .getByRole("button", { name: "Revisar fechas", exact: true })
    .click();
  await expect(
    drawer.getByText("2 por agregar", { exact: true }),
  ).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await drawer.evaluate((el) => el.scrollWidth <= el.clientWidth + 1),
  ).toBe(true);
});
