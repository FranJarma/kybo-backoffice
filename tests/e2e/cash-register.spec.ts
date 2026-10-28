import { test, expect, type Page } from "@playwright/test";
import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import type {
  CashCommand,
  CashMovement,
  CashSession,
  CashSnapshot,
  CashSettingsCommand,
  CashSettingsSnapshot,
} from "../../src/modules/cash/types";
const require = createRequire(import.meta.url);
const bundle = ".next-e2e/cash-ui-fixture.js";
const tinyPhoto = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=",
  "base64",
);
let css = "";
test.beforeAll(async () => {
  test.setTimeout(120_000);
  await createRequire(require.resolve("tsx"))("esbuild").build({
    entryPoints: ["tests/helpers/cash-ui.tsx"],
    outfile: bundle,
    bundle: true,
    platform: "browser",
    jsx: "automatic",
    define: {
      "process.env.NODE_ENV": '"production"',
      "process.env": '{"NODE_ENV":"production"}',
    },
  });
  const globalCSS = (
    await createRequire(require.resolve("@tailwindcss/postcss"))("postcss")([
      require("@tailwindcss/postcss")(),
    ]).process(
      (await readFile("src/app/globals.css", "utf8")).replace(
        '@import "tailwindcss";',
        '@import "tailwindcss" source(none);\n@source "../components/cash";\n@source "../components/ui";',
      ),
      {
        from: "src/app/globals.css",
      },
    )
  ).css;
  css = `${globalCSS}\n${await readFile("src/components/cash/cash.css", "utf8")}`;
});
function session(): CashSession {
  return {
    id: "session",
    branchId: "branch",
    businessDate: "2026-10-27",
    state: "open",
    openedBy: "user",
    openedByName: "Operador",
    openedAt: "2026-10-27T12:00:00Z",
    openingCash: "500.10",
    openingReason: "",
    closeTime: "23:00",
    targetFund: null,
    timeZone: "America/Argentina/Buenos_Aires",
    revision: 7,
    closedAt: null,
    closedBy: null,
    closedByName: null,
    expectedClosing: null,
    counted: null,
    withdrawal: null,
    fund: null,
    difference: null,
    reason: null,
    posnet: null,
    reviewRequired: false,
    reviewedAt: null,
    reviewedByName: null,
    reviewNote: null,
  };
}
function snapshot(): CashSnapshot {
  const current = session();
  return {
    available: true,
    activated: true,
    branchId: "branch",
    branchName: "Sucursal de prueba",
    timeZone: current.timeZone,
    capabilities: {
      open: true,
      close: true,
      expense: true,
      externalExpense: true,
      withdraw: true,
      supplier: true,
      review: true,
      admin: true,
    },
    settings: { closeTime: "23:00", targetFund: null, revision: 0 },
    current,
    selected: current,
    lastClosed: null,
    sessions: [current],
    movements: [],
    totals: {
      expectedCash: "1000.10",
      opening: "500.10",
      cashCollections: "500.00",
      cashRefunds: "0.00",
      expenses: "0.00",
      supplierPayments: "0.00",
      withdrawals: "0.00",
      cardTotal: "800.00",
      cardOperations: 2,
      transferTotal: "0.00",
      otherTotal: "0.00",
    },
    pendingReviews: 0,
  };
}
type Posted = { requestId: string; command: CashCommand };
async function mount(
  page: Page,
  data = snapshot(),
  options: {
    conflict?: boolean;
    view?: string;
    failFirst?: boolean;
    reopenedOnConflict?: boolean;
    settings?: CashSettingsSnapshot;
  } = {},
) {
  const posted: Posted[] = [];
  let current = data,
    photoUploads = 0;
  await page.route("**/__cash-ui**", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: `<html lang="es"><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style></head><body></body></html>`,
    }),
  );
  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === "/api/settings/cash" && options.settings)
      return route.fulfill({ json: options.settings });
    if (url.pathname.startsWith("/api/cash/photos/"))
      return route.fulfill({ contentType: "image/png", body: tinyPhoto });
    if (url.pathname === "/api/cash/photos") {
      expect(url.searchParams.get("sessionId")).toBe("session");
      expect(route.request().headers()["content-type"]).toBe("image/png");
      photoUploads++;
      return route.fulfill({
        json: {
          id: `photo-${photoUploads}`,
          url: `/api/cash/photos/photo-${photoUploads}`,
        },
      });
    }
    if (url.pathname === "/api/cash/status")
      return route.fulfill({
        json: {
          available: current.available,
          activated: current.activated,
          open: !!current.current,
          sessionId: current.current?.id ?? null,
          canOpen: current.capabilities.open,
        },
      });
    if (route.request().method() === "POST") {
      const body = route.request().postDataJSON() as Posted;
      posted.push(body);
      if (options.failFirst && posted.length === 1)
        return route.fulfill({
          status: 503,
          json: { error: "Conexión interrumpida" },
        });
      if (options.reopenedOnConflict && posted.length === 1) {
        const next = {
          ...session(),
          id: "next-session",
          businessDate: "2026-10-28",
          revision: 1,
        };
        current = {
          ...current,
          current: next,
          selected: next,
          sessions: [next],
        };
        return route.fulfill({
          status: 409,
          json: { error: "La jornada ya fue cerrada" },
        });
      }
      if (options.conflict && posted.length === 1) {
        current = {
          ...current,
          current: { ...session(), revision: 8 },
          selected: { ...session(), revision: 8 },
          totals: { ...current.totals, expectedCash: "1200.10" },
        };
        return route.fulfill({
          status: 409,
          json: { error: "Cambió la caja" },
        });
      }
      if (body.command.action === "close") {
        const command = body.command;
        const closed: CashSession = {
          ...current.current!,
          state: "closed",
          closedAt: "2026-10-28T02:10:00Z",
          closedBy: "user",
          closedByName: "Operador",
          expectedClosing: current.totals.expectedCash,
          counted: command.counted,
          withdrawal: command.withdrawal,
          fund: "700.10",
          difference: "0.00",
          reason: command.reason,
          posnet: {
            ...command.posnet,
            expected: current.totals.cardTotal,
            expectedOperations: 2,
            total: command.posnet.mode === "pending" ? null : "800.00",
            operations: command.posnet.mode === "pending" ? null : 2,
            difference: command.posnet.mode === "pending" ? null : "0.00",
            needsReview: command.posnet.mode === "pending",
          },
        };
        current = {
          ...current,
          current: null,
          selected: closed,
          lastClosed: closed,
          sessions: [closed],
        };
      }
    }
    if (route.request().method() === "POST") {
      const body = route.request().postDataJSON() as Posted;
      if (body.command.action === "review" && current.selected) {
        const command = body.command;
        const reviewed = {
          ...current.selected,
          reviewedAt: "2026-10-28T03:00:00Z",
          reviewNote: command.note,
          posnetReview: command.posnet
            ? {
                ...command.posnet,
                expected: current.selected.posnet?.expected ?? "0.00",
                expectedOperations:
                  current.selected.posnet?.expectedOperations ?? 0,
                total: "800.00",
                operations: 2,
                difference: "0.00",
                needsReview: false,
              }
            : null,
        };
        current = {
          ...current,
          selected: reviewed,
          lastClosed: reviewed,
          sessions: [reviewed],
        };
      }
    }
    return route.fulfill({ json: current });
  });
  await page.goto(`/__cash-ui${options.view ? `?view=${options.view}` : ""}`);
  await page.addScriptTag({ path: bundle });
  return posted;
}
async function startClose(page: Page) {
  await page.getByRole("button", { name: "Cerrar caja", exact: true }).click();
  await page.getByLabel("Efectivo contado", { exact: true }).fill("1.000,10");
  const withdraw = page.getByLabel("Nuevo retiro al cerrar", { exact: true });
  if (await withdraw.count()) await withdraw.fill("300");
  await page.getByRole("button", { name: "Continuar", exact: true }).click();
}
async function fillLot(page: Page) {
  await page.getByLabel("Número de lote 1", { exact: true }).fill("003");
  await page
    .getByLabel("Fecha y hora del lote 1", { exact: true })
    .fill("2026-10-27T23:10");
  await page.getByLabel("Operaciones del lote 1", { exact: true }).fill("2");
  await page.getByLabel("Total del lote 1", { exact: true }).fill("800");
  await page
    .getByLabel("Elegir foto del lote 1", { exact: true })
    .setInputFiles({
      name: "comprobante.png",
      mimeType: "image/png",
      buffer: tinyPhoto,
    });
  await expect(
    page.getByText("Comprobante agregado", { exact: true }),
  ).toBeVisible();
}

function cardReconciliationSnapshot() {
  const data = snapshot();
  const movement = (patch: Partial<CashMovement>): CashMovement => ({
    id: "card-one",
    sessionId: "session",
    branchId: "branch",
    kind: "collection",
    amount: "500.00",
    methodKind: "card",
    methodName: "Tarjeta de débito",
    concept: "Cobro de venta #15",
    reference: "0000123",
    sourceType: "sale-payment",
    sourceId: "payment-one",
    actorName: "Operador",
    createdAt: "2026-10-28T02:45:00Z",
    ...patch,
  });
  data.movements = [
    movement({}),
    movement({
      id: "card-two",
      amount: "400.00",
      concept: "Cobro de venta #16",
      reference: null,
      createdAt: "2026-10-28T03:15:00Z",
    }),
    movement({
      id: "refund",
      kind: "refund",
      amount: "-100.00",
      concept: "Devolución de venta #15",
    }),
    movement({ id: "cash", methodKind: "cash", reference: "SOLO-EFECTIVO" }),
    movement({
      id: "transfer",
      methodKind: "transfer",
      reference: "SOLO-TRANSFERENCIA",
    }),
    movement({
      id: "previous",
      sessionId: "previous",
      reference: "OTRA-JORNADA",
    }),
    movement({
      id: "other-branch",
      branchId: "other",
      reference: "OTRA-SUCURSAL",
    }),
  ];
  data.totals.cardOperations = 3;
  return data;
}

for (const width of [390, 1024, 1440]) {
  test(`card receipts reconcile the current session including refunds at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 980 });
    const posted = await mount(page, cardReconciliationSnapshot());
    await startClose(page);
    const list = page.getByRole("region", {
      name: "Cobros con tarjeta de esta jornada",
      exact: true,
    });
    await expect(list).toBeVisible();
    await expect(list.getByRole("listitem")).toHaveCount(3);
    const collection = list
      .getByRole("listitem")
      .filter({ hasText: "Cobro de venta #15" });
    await expect(collection).toContainText("0000123");
    await expect(collection).toContainText("500,00");
    await expect(collection).toContainText("Tarjeta de débito");
    await expect(collection).toContainText(
      /27\/10\/26.*(?:23:45|11:45\s*p\.\s*m\.)/,
    );
    const legacy = list
      .getByRole("listitem")
      .filter({ hasText: "Cobro de venta #16" });
    await expect(legacy).toContainText("Sin comprobante registrado");
    await expect(legacy).toContainText(
      /28\/10\/26.*(?:00:15|12:15\s*a\.\s*m\.)/,
    );
    const refund = list
      .getByRole("listitem")
      .filter({ hasText: "Devolución de venta #15" });
    await expect(refund).toContainText("Comprobante original");
    await expect(refund).toContainText("0000123");
    await expect(refund).toContainText(/-\s*\$\s*100,00/);
    await expect(list).not.toContainText(
      /SOLO-EFECTIVO|SOLO-TRANSFERENCIA|OTRA-JORNADA|OTRA-SUCURSAL/,
    );
    await expect(
      page.getByText("2 cobros · 1 devolución", { exact: true }),
    ).toBeVisible();
    const bounds = await list.boundingBox();
    expect(bounds!.x).toBeGreaterThanOrEqual(0);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width);
    expect(
      await list.evaluate(
        (element) => element.scrollWidth <= element.clientWidth,
      ),
    ).toBe(true);
    await page
      .getByRole("dialog")
      .screenshot({ path: `.next-e2e/cash-card-reconciliation-${width}.png` });
    expect(posted).toEqual([]);
  });
}
test("a full day of card receipts remains keyboard-scrollable without widening the mobile close", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const data = cardReconciliationSnapshot();
  data.movements = Array.from({ length: 60 }, (_, index) => ({
    ...data.movements[0],
    id: `card-${index}`,
    concept: `Cobro de venta #${index + 1}`,
    reference: index === 0 ? "0".repeat(120) : String(index).padStart(7, "0"),
  }));
  data.totals.cardTotal = "30000.00";
  data.totals.cardOperations = 60;
  const posted = await mount(page, data);
  await startClose(page);
  const list = page.getByRole("region", {
    name: "Cobros con tarjeta de esta jornada",
    exact: true,
  });
  await expect(list.getByRole("listitem")).toHaveCount(60);
  await list.focus();
  expect(
    await list.evaluate(
      (element) => element.scrollWidth <= element.clientWidth,
    ),
  ).toBe(true);
  expect(
    await list.evaluate(
      (element) => element.scrollHeight > element.clientHeight,
    ),
  ).toBe(true);
  await list.press("End");
  await expect
    .poll(() => list.evaluate((element) => element.scrollTop))
    .toBeGreaterThan(0);
  await expect(
    page.getByRole("button", { name: "Continuar", exact: true }),
  ).toBeInViewport();
  expect(posted).toEqual([]);
});

test("private photo, reviewed values and draft survive back navigation and dismissal", async ({
  page,
}) => {
  const posted = await mount(page);
  await startClose(page);
  await page.getByRole("button", { name: "Continuar", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText(/foto/);
  await expect(
    page.getByLabel("Tomar foto del lote 1", { exact: true }),
  ).toHaveAttribute("capture", "environment");
  await fillLot(page);
  await page
    .getByRole("button", { name: "Ampliar foto del lote 1", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Reducir foto del lote 1", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await page
    .getByRole("button", { name: "Quitar foto del lote 1", exact: true })
    .click();
  await page.getByRole("button", { name: "Continuar", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText(/foto/);
  await fillLot(page);
  await page.getByRole("button", { name: "Continuar", exact: true }).click();
  await page.getByRole("button", { name: "Atrás", exact: true }).click();
  await expect(
    page.getByLabel("Número de lote 1", { exact: true }),
  ).toHaveValue("003");
  await page
    .getByRole("button", {
      name: "Guardar borrador y salir del cierre",
      exact: true,
    })
    .click();
  await page
    .getByRole("button", { name: "Continuar cierre", exact: true })
    .click();
  await expect(
    page.getByText("Comprobante agregado", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Continuar", exact: true }).click();
  await page
    .getByRole("button", { name: "Confirmar cierre", exact: true })
    .click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  expect(posted[0].command).toEqual({
    action: "close",
    sessionId: "session",
    expectedRevision: 7,
    counted: "1000.10",
    withdrawal: "300.00",
    reason: "",
    posnet: {
      mode: "registered",
      reason: "",
      lots: [
        {
          number: "003",
          closedAt: "2026-10-28T02:10:00.000Z",
          operations: 2,
          total: "800.00",
          photoId: "photo-2",
        },
      ],
    },
  });
  await expect(
    page.getByRole("heading", { name: "Arqueo confirmado" }),
  ).toBeVisible();
});
test("concurrent collection preserves the whole draft and requires reviewing updated figures", async ({
  page,
}) => {
  const posted = await mount(page, snapshot(), { conflict: true });
  await startClose(page);
  await fillLot(page);
  await page.getByRole("button", { name: "Continuar", exact: true }).click();
  await page
    .getByRole("button", { name: "Confirmar cierre", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText(
    "Conservamos tu borrador",
  );
  await expect(
    page.getByLabel("Efectivo contado", { exact: true }),
  ).toHaveValue("1.000,10");
  await expect(
    page.getByLabel("Nuevo retiro al cerrar", { exact: true }),
  ).toHaveValue("300");
  await page
    .getByLabel("Motivo de la diferencia de efectivo")
    .fill("Revisar el último cobro del día");
  await page.getByRole("button", { name: "Continuar", exact: true }).click();
  await expect(
    page.getByLabel("Número de lote 1", { exact: true }),
  ).toHaveValue("003");
  await expect(
    page.getByText("Comprobante agregado", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Continuar", exact: true }).click();
  await page
    .getByRole("button", { name: "Confirmar cierre", exact: true })
    .click();
  expect(
    posted.map((row) =>
      row.command.action === "close" ? row.command.expectedRevision : null,
    ),
  ).toEqual([7, 8]);
  expect(posted[1].requestId).not.toBe(posted[0].requestId);
});
test("authorized staff can close with pending posnet but cannot withdraw or manage grants", async ({
  page,
}) => {
  const data = snapshot();
  data.capabilities.withdraw = false;
  data.capabilities.admin = false;
  data.capabilities.supplier = false;
  data.capabilities.externalExpense = false;
  const posted = await mount(page, data);
  await expect(
    page.getByRole("button", { name: "Retirar efectivo", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: /configur|permiso/i }),
  ).toHaveCount(0);
  await startClose(page);
  await expect(
    page.getByLabel("Nuevo retiro al cerrar", { exact: true }),
  ).toHaveCount(0);
  await page
    .getByRole("button", {
      name: "No pude registrar el cierre del posnet",
      exact: true,
    })
    .click();
  await page.getByRole("button", { name: "Continuar", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText(/motivo/);
  await page
    .getByLabel("Motivo del cierre de lote pendiente")
    .fill("El equipo no emitió el comprobante");
  await page.getByRole("button", { name: "Continuar", exact: true }).click();
  await page
    .getByRole("button", { name: "Confirmar cierre", exact: true })
    .click();
  expect(posted[0].command).toMatchObject({
    withdrawal: "0.00",
    posnet: {
      mode: "pending",
      reason: "El equipo no emitió el comprobante",
      lots: [],
    },
  });
});
test("staff only sees supported cash-funded expenses and can continue after saving", async ({
  page,
}) => {
  const data = snapshot();
  Object.assign(data.capabilities, {
    admin: false,
    review: false,
    withdraw: false,
    supplier: false,
    externalExpense: false,
  });
  const posted = await mount(page, data);
  await page
    .getByRole("button", { name: "Registrar gasto", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  await expect(
    dialog.getByRole("radio", { name: "Pagado fuera de caja" }),
  ).toHaveCount(0);
  await dialog.getByLabel("Importe", { exact: true }).fill("120,50");
  await dialog.getByLabel("Concepto del gasto").fill("Limpieza");
  await dialog
    .getByRole("button", { name: "Registrar gasto", exact: true })
    .click();
  await expect(dialog).not.toBeVisible();
  expect(posted[0].command).toMatchObject({
    action: "expense",
    source: "cash",
    amount: "120.50",
  });
  await page
    .getByRole("button", { name: "Registrar gasto", exact: true })
    .click();
  await expect(dialog.getByLabel("Importe", { exact: true })).toBeEnabled();
});

test("network retry reuses its request identity and does not clear the expense form", async ({
  page,
}) => {
  const posted = await mount(page, snapshot(), { failFirst: true });
  await page
    .getByRole("button", { name: "Registrar gasto", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Importe", { exact: true }).fill("120,50");
  await dialog.getByLabel("Concepto del gasto").fill("Limpieza");
  await dialog
    .getByRole("button", { name: "Registrar gasto", exact: true })
    .click();
  await expect(dialog.getByRole("alert")).toContainText(
    "Conexión interrumpida",
  );
  await expect(dialog.getByLabel("Importe", { exact: true })).toHaveValue(
    "120,50",
  );
  await dialog
    .getByRole("button", { name: "Reintentar la misma operación", exact: true })
    .click();
  await expect(dialog).not.toBeVisible();
  expect(posted[1]).toEqual(posted[0]);
});
test("cash requests stay bound to the original branch across reads, mutations and photo uploads", async ({
  page,
}) => {
  const requests: { path: string; branch: string | undefined }[] = [];
  page.on("request", (request) => {
    if (new URL(request.url()).pathname.startsWith("/api/cash"))
      requests.push({
        path: new URL(request.url()).pathname,
        branch: request.headers()["x-kybo-branch-id"],
      });
  });
  await mount(page);
  await startClose(page);
  await fillLot(page);
  await page.getByRole("button", { name: "Continuar", exact: true }).click();
  await page
    .getByRole("button", { name: "Confirmar cierre", exact: true })
    .click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  expect(
    requests
      .filter(
        (request) =>
          request.path === "/api/cash" || request.path === "/api/cash/photos",
      )
      .map((request) => request.branch),
  ).toEqual(["branch", "branch", "branch"]);
});
test("a response from a different branch never replaces the cash context", async ({
  page,
}) => {
  await mount(page, {
    ...snapshot(),
    branchId: "other-branch",
    branchName: "Otra sucursal",
  });
  await expect(
    page.getByRole("heading", { name: "No pudimos consultar la caja" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Cerrar caja", exact: true }),
  ).toHaveCount(0);
});
test("a close draft never moves into a different session after a concurrent reopen", async ({
  page,
}) => {
  const posted = await mount(page, snapshot(), { reopenedOnConflict: true });
  await startClose(page);
  await fillLot(page);
  await page.getByRole("button", { name: "Continuar", exact: true }).click();
  await page
    .getByRole("button", { name: "Confirmar cierre", exact: true })
    .click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await expect(page.getByRole("alert")).toContainText(/cerr.*jornada/i);
  await page.getByRole("button", { name: "Cerrar caja", exact: true }).click();
  await expect(
    page.getByLabel("Efectivo contado", { exact: true }),
  ).toHaveValue("");
  expect(posted).toHaveLength(1);
});
test("saving a same-session expense keeps the prepared close draft and its private photo", async ({
  page,
}) => {
  await mount(page);
  await startClose(page);
  await fillLot(page);
  await page
    .getByRole("button", {
      name: "Guardar borrador y salir del cierre",
      exact: true,
    })
    .click();
  await page
    .getByRole("button", { name: "Registrar gasto", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Importe", { exact: true }).fill("10");
  await dialog.getByLabel("Concepto del gasto").fill("Limpieza");
  await dialog
    .getByRole("button", { name: "Registrar gasto", exact: true })
    .click();
  await expect(dialog).not.toBeVisible();
  await page
    .getByRole("button", { name: "Continuar cierre", exact: true })
    .click();
  await expect(
    page.getByLabel("Efectivo contado", { exact: true }),
  ).toHaveValue("1.000,10");
  await page.getByRole("button", { name: "Continuar", exact: true }).click();
  await expect(
    page.getByText("Comprobante agregado", { exact: true }),
  ).toBeVisible();
});
for (const width of [390, 768, 1024, 1440])
  test(`closing controls remain usable without horizontal overflow at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 880 });
    await mount(page);
    await startClose(page);
    await fillLot(page);
    await expect(
      page.getByRole("button", { name: "Continuar", exact: true }),
    ).toBeInViewport();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: `.next-e2e/cash-ui-${width}.png`,
      fullPage: true,
    });
  });
test("unavailable migration and closed-branch POS status provide an actionable state", async ({
  page,
}) => {
  const data = snapshot();
  data.available = false;
  await mount(page, data);
  await expect(
    page.getByRole("heading", { name: "Caja todavía no está disponible" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Abrir caja", exact: true }),
  ).toHaveCount(0);
  data.available = true;
  data.current = null;
  await mount(page, data, { view: "status" });
  await expect(
    page.getByRole("link", { name: "Abrir caja", exact: true }),
  ).toHaveAttribute("href", "/finance/cash");
});
test("administrator sets nullable fund and per-person grants with the shared autocomplete", async ({
  page,
}) => {
  const base: CashSettingsSnapshot = {
    available: true,
    branchId: "branch",
    branchName: "Sucursal de prueba",
    settings: { closeTime: "23:00", targetFund: null, revision: 0 },
    employees: [
      {
        id: "staff",
        name: "Personal autorizado",
        role: "staff",
        canOpen: false,
        canClose: false,
        canExpense: false,
      },
    ],
  };
  const commands: CashSettingsCommand[] = [];
  await mount(page, snapshot(), { view: "settings", settings: base });
  await page.route("**/api/settings/cash", (route) => {
    expect(route.request().headers()["x-kybo-branch-id"]).toBe("branch");
    if (route.request().method() === "POST")
      commands.push(route.request().postDataJSON().command);
    return route.fulfill({ json: base });
  });
  await expect(
    page.getByLabel("Fondo de cambio objetivo", { exact: true }),
  ).toHaveValue("");
  await expect(page.getByLabel("Horario previsto de cierre")).toHaveValue(
    "23:00",
  );
  await page
    .getByRole("button", { name: "Guardar configuración", exact: true })
    .click();
  expect(commands[0]).toEqual({
    action: "configure",
    targetFund: null,
    closeTime: "23:00",
    revision: 0,
  });
  await page
    .getByRole("combobox", { name: "Empleado de la sucursal", exact: true })
    .fill("Personal");
  await page.getByRole("option", { name: /Personal autorizado/ }).click();
  await page.getByRole("checkbox", { name: /Abrir caja/ }).check();
  await page
    .getByRole("button", { name: "Guardar permisos", exact: true })
    .click();
  expect(commands[1]).toEqual({
    action: "permission",
    userId: "staff",
    canOpen: true,
    canClose: false,
    canExpense: false,
  });
});
test("large camera captures are resized privately before upload and preserve their aspect ratio", async ({
  page,
}) => {
  await mount(page);
  await startClose(page);
  let uploaded: Buffer | null = null;
  await page.route("**/api/cash/photos?**", (route) => {
    expect(route.request().headers()["content-type"]).toBe("image/webp");
    expect(route.request().headers()["x-kybo-branch-id"]).toBe("branch");
    uploaded = route.request().postDataBuffer();
    return route.fulfill({
      json: { id: "large-photo", url: "/api/cash/photos/large-photo" },
    });
  });
  const originalSize = await page.evaluate(async () => {
    const canvas = document.createElement("canvas");
    canvas.width = 3000;
    canvas.height = 800;
    const context = canvas.getContext("2d")!,
      data = context.createImageData(canvas.width, canvas.height);
    for (let offset = 0; offset < data.data.length; offset += 65536)
      crypto.getRandomValues(
        data.data.subarray(offset, Math.min(data.data.length, offset + 65536)),
      );
    for (let index = 3; index < data.data.length; index += 4)
      data.data[index] = 255;
    context.putImageData(data, 0, 0);
    const blob = await new Promise<Blob>((resolve) =>
      canvas.toBlob((value) => resolve(value!), "image/png"),
    );
    const transfer = new DataTransfer();
    transfer.items.add(new File([blob], "camera.png", { type: "image/png" }));
    const input = document.querySelector<HTMLInputElement>(
      'input[aria-label="Elegir foto del lote 1"]',
    )!;
    input.files = transfer.files;
    input.dispatchEvent(new Event("change", { bubbles: true }));
    return blob.size;
  });
  await expect(
    page.getByText("Comprobante agregado", { exact: true }),
  ).toBeVisible();
  expect(originalSize).toBeGreaterThan(3 * 1024 * 1024);
  expect(uploaded!.length).toBeLessThanOrEqual(3 * 1024 * 1024);
  const metadata = await require("sharp")(uploaded).metadata();
  expect(metadata.width).toBe(2800);
  expect(metadata.height).toBe(747);
  await expect(
    page.getByRole("img", { name: "Comprobante del lote 1", exact: true }),
  ).toHaveAttribute("src", "/api/cash/photos/large-photo?branchId=branch");
});

test("same-day reopening with the unchanged fund accepts its required reason", async ({
  page,
}) => {
  await page.clock.setFixedTime(new Date("2026-10-27T18:00:00Z"));
  const closed = {
    ...session(),
    state: "closed" as const,
    fund: "500.10",
    closedAt: "2026-10-27T17:50:00Z",
  };
  const posted = await mount(page, {
    ...snapshot(),
    current: null,
    selected: closed,
    lastClosed: closed,
    sessions: [closed],
  });
  await page.getByRole("button", { name: "Abrir caja", exact: true }).click();
  await page
    .getByLabel("Motivo de nueva apertura", { exact: true })
    .fill("Se cerró por error antes de terminar");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Abrir caja", exact: true })
    .click();
  expect(posted[0].command).toMatchObject({
    action: "open",
    amount: "500.10",
    reason: "Se cerró por error antes de terminar",
  });
});

test("a physical posnet batch can be declared when the app recorded zero cards", async ({
  page,
}) => {
  const posted = await mount(page, {
    ...snapshot(),
    totals: { ...snapshot().totals, cardTotal: "0.00", cardOperations: 0 },
  });
  await startClose(page);
  await page
    .getByRole("button", { name: "Registrar un lote del posnet", exact: true })
    .click();
  await fillLot(page);
  await page
    .getByLabel("Motivo de la diferencia del posnet", { exact: true })
    .fill("El cobro se omitió en la app");
  await page.getByRole("button", { name: "Continuar", exact: true }).click();
  await page
    .getByRole("button", { name: "Confirmar cierre", exact: true })
    .click();
  expect(posted[0].command).toMatchObject({
    action: "close",
    posnet: {
      mode: "registered",
      reason: "El cobro se omitió en la app",
      lots: [{ total: "800.00" }],
    },
  });
});

test("an uncertain expense survives dismissal and refresh and retries the exact operation", async ({
  page,
}) => {
  const posted = await mount(page, snapshot(), { failFirst: true });
  await page
    .getByRole("button", { name: "Registrar gasto", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Importe", { exact: true }).fill("120,50");
  await dialog.getByLabel("Concepto del gasto").fill("Limpieza");
  await dialog
    .getByRole("button", { name: "Registrar gasto", exact: true })
    .click();
  await expect(
    dialog.getByRole("button", {
      name: "Reintentar la misma operación",
      exact: true,
    }),
  ).toBeVisible();
  await dialog
    .getByRole("button", { name: "Cerrar formulario", exact: true })
    .click();
  await page.reload();
  await page.addScriptTag({ path: bundle });
  await expect(
    page.getByRole("button", { name: "Registrar gasto", exact: true }),
  ).toBeDisabled();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await page
    .getByRole("button", { name: "Reintentar la misma operación", exact: true })
    .click();
  await expect.poll(() => posted.length).toBe(2);
  expect(posted[1]).toEqual(posted[0]);
});
test("review can attach a pending posnet receipt while preserving the original close", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const closed = {
    ...session(),
    state: "closed" as const,
    closedAt: "2026-10-28T02:10:00Z",
    fund: "1000.10",
    counted: "1000.10",
    expectedClosing: "1000.10",
    withdrawal: "0.00",
    difference: "0.00",
    reviewRequired: true,
    posnet: {
      mode: "pending" as const,
      reason: "Equipo sin conexión",
      lots: [],
      expected: "800.00",
      expectedOperations: 2,
      total: null,
      operations: null,
      difference: null,
      needsReview: true,
    },
  };
  const posted = await mount(page, {
    ...snapshot(),
    current: null,
    selected: closed,
    lastClosed: closed,
    sessions: [closed],
  });
  await page
    .getByRole("button", { name: "Registrar revisión", exact: true })
    .click();
  await page
    .getByRole("checkbox", {
      name: "Agregar comprobante del posnet",
      exact: true,
    })
    .check();
  await fillLot(page);
  await page
    .getByLabel("Observación de la revisión", { exact: true })
    .fill("Se verificó el cierre de lote al recuperar conexión");
  const reviewBox = await page.getByRole("dialog").boundingBox();
  expect(reviewBox!.x).toBeGreaterThanOrEqual(0);
  expect(reviewBox!.x + reviewBox!.width).toBeLessThanOrEqual(391);
  await page
    .getByRole("dialog")
    .screenshot({ path: ".next-e2e/cash-review-proof-390.png" });
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Revisar cierre", exact: true })
    .click();
  expect(posted[0].command).toMatchObject({
    action: "review",
    sessionId: "session",
    posnet: {
      mode: "registered",
      lots: [{ number: "003", photoId: "photo-1" }],
    },
  });
  await expect(
    page.getByText("Comprobante agregado durante la revisión", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Equipo sin conexión", { exact: true }),
  ).toBeVisible();
});
