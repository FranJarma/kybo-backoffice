import { expect, test, type Page } from "@playwright/test";
import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
const require = createRequire(import.meta.url);
let css = "";
test.beforeAll(async () => {
  test.setTimeout(60000);
  const { build } = createRequire(require.resolve("tsx"))("esbuild");
  await build({
    entryPoints: ["tests/helpers/attendance-ux-ui.tsx"],
    outfile: ".next-e2e/attendance-ux-ui.js",
    bundle: true,
    platform: "browser",
    jsx: "automatic",
    define: {
      "process.env.NODE_ENV": '"production"',
      "process.env": '{"NODE_ENV":"production"}',
    },
  });
  const postcss = createRequire(require.resolve("@tailwindcss/postcss"))(
    "postcss",
  );
  css = (
    await postcss([require("@tailwindcss/postcss")()]).process(
      await readFile("src/app/globals.css", "utf8"),
      { from: "src/app/globals.css" },
    )
  ).css;
  css += await readFile("src/components/attendance/attendance.css", "utf8");
  css += await readFile("src/components/attendance/personal-frame.css", "utf8");
});
async function mount(
  page: Page,
  options: {
    mode?: string;
    fail?: boolean;
    holdRange?: boolean;
    holdSave?: boolean;
    qr?: boolean;
    shortQr?: boolean;
    state?: string;
    requireLocation?: boolean;
  } = {},
) {
  const range = Promise.withResolvers<void>(),
    save = Promise.withResolvers<void>();
  const control = {
    assignmentRevision: 1,
    fail: !!options.fail,
    holdRange: !!options.holdRange,
    releaseRange: range.resolve,
    releaseSave: save.resolve,
    commands: [] as { requestId: string; command: Record<string, unknown> }[],
    errors: [] as string[],
  };
  page.on("pageerror", (error) => {
    control.errors.push(error.message);
  });
  await page.route("**/*", async (route) => {
    const request = route.request(),
      url = new URL(request.url());
    if (url.pathname === "/__attendance-ux")
      return route.fulfill({
        contentType: "text/html",
        body: `<html lang="es"><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style></head><body></body></html>`,
      });
    if (url.pathname === "/assets/kybo-logo.png")
      return route.fulfill({
        contentType: "image/png",
        body: await readFile("public/assets/kybo-logo.png"),
      });
    if (url.pathname === "/api/identity")
      return route.fulfill({
        json: { ready: true, credentials: [{ id: "phone" }] },
      });
    if (url.pathname === "/api/attendance/qr")
      return route.fulfill({
        json: {
          id: "qr-attempt",
          serverNow: new Date().toISOString(),
          expiresAt: new Date(
            Date.now() + (options.shortQr ? 2500 : 60000),
          ).toISOString(),
        },
      });
    const from = url.searchParams.get("from") ?? "2026-11-02",
      to = url.searchParams.get("to") ?? "2026-11-08";
    if (url.pathname === "/api/attendance/schedule-preview")
      return route.fulfill({
        json: {
          shift: {
            id: "morning",
            revision: 1,
            name: "Mañana",
            start: "09:00",
            end: "17:00",
            pauseMinutes: 30,
          },
          rows: Array.from({ length: 7 }, (_, i) => ({
            businessDate: `2026-11-0${i + 2}`,
            status: i === 1 ? "skipped" : "available",
            ...(i === 1 ? { reason: "Franco ya asignado" } : {}),
          })),
        },
      });
    if (url.pathname === "/api/attendance" && request.method() === "POST") {
      const body = request.postDataJSON();
      control.commands.push(body);
      if (options.holdSave) await save.promise;
      return body.command.action === "assignPeriod"
        ? route.fulfill({
            json: {
              id: "period",
              created: 6,
              skipped: 1,
              rows: Array.from({ length: 7 }, (_, i) => ({
                businessDate: `2026-11-0${i + 2}`,
                status: i === 1 ? "skipped" : "created",
                ...(i === 1 ? { reason: "Franco ya asignado" } : {}),
              })),
            },
          })
        : route.fulfill({
            status: 409,
            json: { error: "Revisá el horario antes de guardar." },
          });
    }
    if (url.pathname === "/api/attendance") {
      if (control.holdRange && from !== "2026-11-02") await range.promise;
      if (control.fail)
        return route.fulfill({
          status: 503,
          json: { error: "No pudimos consultar la asistencia." },
        });
      const assignmentDate = options.mode === "planning" ? from : "2026-11-04";
      const assignments = [
        {
          id: "assigned",
          userId: "staff",
          businessDate: assignmentDate,
          kind: "work",
          shiftId: "morning",
          name:
            control.assignmentRevision > 1 ? "Mañana actualizada" : "Mañana",
          startsAt: `${assignmentDate}T12:00:00Z`,
          endsAt: `${assignmentDate}T20:00:00Z`,
          pauseMinutes: 30,
          revision: control.assignmentRevision,
        },
      ];
      return route.fulfill({
        json: {
          ready: true,
          branch: {
            id: "branch",
            name: "Peatonal Alberdi",
            timeZone: "America/Argentina/Buenos_Aires",
          },
          actor: {
            id: options.mode === "planning" ? "manager" : "staff",
            role: options.mode === "planning" ? "manager" : "staff",
            name:
              options.mode === "planning"
                ? "Verónica Ramos"
                : "Constanza Maldonado",
          },
          now: "2026-11-04T15:00:00Z",
          today: "2026-11-04",
          from,
          to,
          settings: {
            enabled: true,
            requireLocation: !!options.requireLocation,
            latitude: 0,
            longitude: 0,
            radiusMeters: 100,
            maxAccuracyMeters: 40,
            revision: 1,
          },
          people: [
            {
              id: "staff",
              name: "Constanza Maldonado",
              active: true,
              enabled: true,
            },
            {
              id: "other",
              name: "Abigail Ibarra",
              active: true,
              enabled: true,
            },
          ],
          shifts: [
            {
              id: "morning",
              name: "Mañana",
              start: "09:00",
              end: "17:00",
              pauseMinutes: 30,
              overnight: false,
              active: true,
              revision: 1,
            },
          ],
          assignments,
          events: [],
          originalEvents: [],
          current: {
            state: options.state ?? "out",
            branchId: options.state ? "branch" : null,
            entryId: options.state ? "entry" : null,
          },
          ownJournal: {
            businessDate: "2026-11-04",
            assignments,
            events: [],
            total: {
              netMinutes: 0,
              pauseMinutes: 0,
              provisional: !!options.state,
            },
          },
          entryAssignments: assignments,
          totals: {},
          states: {},
          corrections: [],
          manualRequests: [],
        },
      });
    }
    return route.abort();
  });
  await page.goto(
    `/__attendance-ux?mode=${options.mode ?? "personal"}&qr=${options.qr === false ? "no" : "yes"}`,
  );
  await page.addScriptTag({ path: ".next-e2e/attendance-ux-ui.js" });
  return control;
}
test("initial read failure replaces indefinite loading with retry", async ({
  page,
}) => {
  const c = await mount(page, { mode: "planning", fail: true });
  await expect(page.getByRole("alert")).toContainText(
    "No pudimos consultar la asistencia",
  );
  await expect(
    page.getByText("Cargando asistencia…", { exact: true }),
  ).toHaveCount(0);
  c.fail = false;
  await page
    .getByRole("button", { name: "Reintentar consulta", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Asignar varios días", exact: true }),
  ).toBeEnabled();
});
test("previous-week edits stay locked during a range read and after a read failure", async ({
  page,
}) => {
  const c = await mount(page, { mode: "planning", holdRange: true });
  await page
    .getByRole("button", { name: "Semana siguiente", exact: true })
    .click();
  await expect(
    page.getByRole("status").filter({ hasText: "Cargando horarios" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Asignar varios días", exact: true }),
  ).toBeDisabled();
  await expect(
    page
      .getByRole("button", { name: /Agregar horario para Constanza/ })
      .first(),
  ).toBeDisabled();
  c.fail = true;
  c.releaseRange();
  await expect(page.getByRole("alert")).toContainText("No pudimos consultar");
  await expect(
    page.getByRole("button", { name: "Asignar varios días", exact: true }),
  ).toBeDisabled();
  c.fail = false;
  c.holdRange = false;
  await page
    .getByRole("button", { name: "Reintentar consulta", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Asignar varios días", exact: true }),
  ).toBeEnabled();
  await expect(
    page
      .getByRole("button", { name: /Agregar horario para Constanza.*9 nov/ })
      .first(),
  ).toBeEnabled();
  expect(c.commands).toHaveLength(0);
});
test("drawer restores its calendar opener and expanded Autocomplete consumes Escape", async ({
  page,
}) => {
  await mount(page, { mode: "planning" });
  const opener = page
    .getByRole("button", { name: /Agregar horario para Abigail/ })
    .first();
  await opener.click();
  const dialog = page.getByRole("dialog", {
    name: "Asignar horario",
    exact: true,
  });
  const employee = dialog.getByRole("combobox", {
    name: "Empleado",
    exact: true,
  });
  await expect(employee).toBeFocused();
  await employee.fill("Constanza");
  await expect(employee).toHaveAttribute("aria-expanded", "true");
  await page.keyboard.press("Escape");
  await expect(dialog).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(opener).toBeFocused();
});
test("submitted scheduling fields freeze and a pending command cannot dismiss the drawer", async ({
  page,
}) => {
  const c = await mount(page, { mode: "planning", holdSave: true });
  await page
    .getByRole("button", { name: /Agregar horario para Abigail/ })
    .first()
    .click();
  const dialog = page.getByRole("dialog", {
    name: "Asignar horario",
    exact: true,
  });
  await dialog
    .getByRole("button", { name: "Guardar horario", exact: true })
    .click();
  await expect.poll(() => c.commands.length).toBe(1);
  await expect(
    dialog.getByRole("combobox", { name: "Empleado", exact: true }),
  ).toBeDisabled();
  await expect(dialog.getByLabel(/^Fecha/)).toBeDisabled();
  await expect(dialog.getByRole("status")).toContainText("Guardando cambios");
  await page.keyboard.press("Escape");
  await expect(dialog).toBeVisible();
  c.releaseSave();
  await expect(dialog.getByRole("alert")).toContainText("Revisá el horario");
  await expect(
    dialog.getByRole("combobox", { name: "Empleado", exact: true }),
  ).toBeEnabled();
});
test("a failed background read does not trap an open drawer and focuses retry on close", async ({
  page,
}) => {
  const c = await mount(page, { mode: "planning" });
  await page
    .getByRole("button", { name: /Agregar horario para Abigail/ })
    .first()
    .click();
  const dialog = page.getByRole("dialog", {
    name: "Asignar horario",
    exact: true,
  });
  c.fail = true;
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(dialog.getByRole("alert")).toContainText("No pudimos consultar");
  await expect(
    dialog.getByRole("combobox", { name: "Empleado", exact: true }),
  ).toBeDisabled();
  await dialog
    .getByRole("button", { name: "Cerrar detalle", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Reintentar consulta", exact: true }),
  ).toBeFocused();
  expect(c.commands).toHaveLength(0);
});
test("multi-day preview and result receive focus while actions remain reachable", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const c = await mount(page, { mode: "planning", holdSave: true });
  const opener = page.getByRole("button", {
    name: "Asignar varios días",
    exact: true,
  });
  await opener.click();
  const dialog = page.getByRole("dialog", {
    name: "Asignar varios días",
    exact: true,
  });
  await dialog
    .getByRole("combobox", { name: "Empleado", exact: true })
    .fill("Constanza");
  await page.getByRole("option", { name: /Constanza/ }).click();
  await dialog
    .getByRole("combobox", { name: "Turno habitual", exact: true })
    .fill("Mañana");
  await page.getByRole("option", { name: /Mañana/ }).click();
  await dialog
    .getByRole("button", { name: "Revisar fechas", exact: true })
    .click();
  await expect(
    dialog.getByRole("heading", {
      name: "Revisá antes de confirmar",
      exact: true,
    }),
  ).toBeFocused();
  await expect(
    dialog.getByText("Franco ya asignado", { exact: true }),
  ).toBeVisible();
  const confirm = dialog.getByRole("button", {
    name: "Confirmar 6 horarios",
    exact: true,
  });
  await expect(confirm).toBeInViewport();
  await page.screenshot({
    path: ".next-e2e/attendance-period-preview-390.png",
    fullPage: false,
  });
  await confirm.click();
  await expect(
    dialog.getByRole("combobox", { name: "Empleado", exact: true }),
  ).toBeDisabled();
  c.releaseSave();
  await expect(
    dialog.getByRole("heading", { name: "Horarios asignados", exact: true }),
  ).toBeFocused();
  await dialog.getByRole("button", { name: "Listo", exact: true }).click();
  await expect(opener).toBeFocused();
  expect(c.commands[0].command).toMatchObject({
    action: "assignPeriod",
    userId: "staff",
    shiftId: "morning",
    expectedShiftRevision: 1,
  });
});
test("a valid QR leads to the personal action in the first mobile viewport", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const c = await mount(page);
  await expect(
    page.getByText("QR del local recibido", { exact: true }),
  ).toBeVisible();
  const entry = page.getByRole("button", {
    name: "Registrar entrada",
    exact: true,
  });
  await expect(entry).toBeEnabled();
  const box = await entry.boundingBox();
  expect(box!.y + box!.height).toBeLessThan(760);
  expect(c.commands).toHaveLength(0);
  expect(c.errors).toEqual([]);
  await page.screenshot({
    path: ".next-e2e/attendance-personal-390.png",
    fullPage: true,
  });
});
test("a missing or expired QR keeps the next punch unavailable", async ({
  page,
}) => {
  await mount(page, { qr: false });
  await expect(
    page.getByRole("button", { name: "Registrar entrada", exact: true }),
  ).toBeDisabled();
  await mount(page, { shortQr: true });
  await expect(
    page.getByRole("button", { name: "Registrar entrada", exact: true }),
  ).toBeEnabled();
  await expect(
    page.getByRole("button", { name: "Registrar entrada", exact: true }),
  ).toBeDisabled({ timeout: 6000 });
  await expect(
    page.getByRole("alert").filter({ hasText: "El intento venció" }),
  ).toBeVisible();
});
test("an assignment draft retains its original revision after a background update", async ({
  page,
}) => {
  const c = await mount(page, { mode: "planning" });
  await page
    .getByRole("button", { name: /Editar horario de Constanza/ })
    .first()
    .click();
  const dialog = page.getByRole("dialog", {
    name: "Editar horario",
    exact: true,
  });
  await dialog.getByLabel(/^Motivo del cambio/).fill("Conservar mi borrador");
  c.assignmentRevision = 2;
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(
    page.locator('button[aria-label*="Mañana actualizada"]'),
  ).toHaveCount(1);
  await dialog
    .getByRole("button", { name: "Guardar horario", exact: true })
    .click();
  await expect.poll(() => c.commands.length).toBe(1);
  expect(c.commands[0].command).toMatchObject({
    expectedRevision: 1,
    reason: "Conservar mi borrador",
  });
});
test("habitual shift drawers focus the name and restore each opener", async ({
  page,
}) => {
  await mount(page, { mode: "planning" });
  const create = page.getByRole("button", { name: "Crear turno", exact: true });
  await create.click();
  await expect(
    page
      .getByRole("dialog")
      .getByRole("textbox", { name: "Nombre", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(create).toBeFocused();
  const edit = page.getByRole("button", { name: /^Mañana/ }).first();
  await edit.click();
  await expect(
    page
      .getByRole("dialog")
      .getByRole("textbox", { name: "Nombre", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(edit).toBeFocused();
});
test("required proximity keeps the primary action visible with an accurate inside reading", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.context().grantPermissions(["geolocation"]);
  await page
    .context()
    .setGeolocation({ latitude: 0, longitude: 0, accuracy: 10 });
  const c = await mount(page, { requireLocation: true });
  const status = page.getByRole("region", {
    name: "Ubicación al fichar",
    exact: true,
  });
  await expect(status).toHaveAttribute("data-state", "inside");
  await expect(
    status.getByRole("button", { name: "Actualizar ubicación", exact: true }),
  ).toBeVisible();
  const entry = page.getByRole("button", {
    name: "Registrar entrada",
    exact: true,
  });
  await expect(entry).toBeEnabled();
  const bounds = await entry.boundingBox();
  expect(bounds!.y + bounds!.height).toBeLessThan(760);
  expect(c.commands).toHaveLength(0);
  expect(c.errors).toEqual([]);
  await page.screenshot({
    path: ".next-e2e/attendance-proximity-390.png",
    fullPage: true,
  });
});
for (const state of ["working", "pause"])
  test(`personal ${state} actions require a valid QR`, async ({ page }) => {
    const primary = state === "working" ? "Comenzar pausa" : "Finalizar pausa";
    await mount(page, { state, qr: false });
    await expect(
      page.getByRole("button", { name: primary, exact: true }),
    ).toBeDisabled();
    const c = await mount(page, { state });
    await expect(
      page.getByRole("button", { name: primary, exact: true }),
    ).toBeEnabled();
    await expect(
      page.getByRole("button", { name: /registrar salida/i }),
    ).toBeEnabled();
    expect(c.commands).toHaveLength(0);
  });
for (const width of [390, 768, 1440])
  test(`weekly calendar remains readable and contained at ${width}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 1000 });
    const c = await mount(page, { mode: "planning" });
    await expect(page.getByRole("columnheader", { name: /Hoy/ })).toBeVisible();
    await expect(
      page
        .getByRole("button", { name: /Editar horario de Constanza.*2 nov/ })
        .first(),
    ).toBeVisible();
    const add = page
      .getByRole("button", { name: /Agregar horario para Abigail/ })
      .first();
    const cell = await add.locator("..").boundingBox();
    expect(cell!.height).toBeLessThan(120);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    expect(c.errors).toEqual([]);
    await page.screenshot({
      path: `.next-e2e/attendance-planning-${width}.png`,
      fullPage: true,
    });
  });
