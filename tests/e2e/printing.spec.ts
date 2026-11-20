import { test, expect, type Page } from "@playwright/test";
import type { PrintingSnapshot } from "../../src/modules/printing/types";
const saleId = process.env.E2E_PRINT_SALE_ID;
const branchId = process.env.E2E_PRINT_BRANCH_ID;
test.skip(
  !saleId || !branchId,
  "Requires the disposable printing preview; never use production data",
);
async function login(page: Page, baseURL: string, store = false) {
  const response = await page.request.post("/api/auth/sign-in/username", {
    headers: { Origin: new URL(baseURL).origin },
    data: {
      username: store ? "mostrador.demo" : "admin.demo",
      password: "Attendance-TestOnly-123!",
    },
  });
  expect(response.ok()).toBe(true);
  await page
    .context()
    .addCookies([{ name: "kybo-branch", value: branchId!, url: baseURL }]);
}
test("real sale dialog preserves station modifiers and a lost reprint response produces one copy", async ({
  page,
  baseURL,
}) => {
  test.setTimeout(120000);
  await login(page, baseURL!);
  const before = (await (
    await page.request.get(`/api/printing?saleId=${saleId}`)
  ).json()) as PrintingSnapshot;
  const existingCopies = new Set(
    before.jobs.filter((j) => j.kind === "copy").map((j) => j.id),
  );
  await page.goto(`/sales?account=${saleId}`);
  const detail = page.getByRole("dialog", { name: /Venta #/ });
  const printing = page.getByRole("region", { name: "Impresión de comandas" });
  await expect(printing).toBeVisible({ timeout: 60000 });
  const kitchen = printing
    .locator("article")
    .filter({ hasText: "Cocina" })
    .first();
  await kitchen.getByText("Ver ticket", { exact: true }).click();
  await expect(kitchen).toContainText("Hielo: Sin hielo × 1");
  await expect(kitchen).toContainText("Preparar sin hielo");
  await expect(kitchen).toContainText("Sin salame");
  await expect(kitchen).toContainText("Entregar todo junto");
  await expect(kitchen).not.toContainText("1 × Kybo Tea");
  const requestIds: string[] = [];
  let lost = false;
  await page.route("**/api/printing", async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    const input = route.request().postDataJSON();
    if (input.command.action !== "reprint") return route.continue();
    requestIds.push(input.requestId);
    if (!lost) {
      lost = true;
      const actual = await route.fetch();
      expect(actual.ok()).toBe(true);
      return route.abort();
    }
    return route.continue();
  });
  await kitchen
    .getByRole("button", { name: "Reimprimir", exact: true })
    .click();
  const reprint = page.getByRole("dialog", { name: "Reimprimir comanda" });
  await expect(
    reprint.getByRole("button", { name: "Enviar copia" }),
  ).toBeDisabled();
  await reprint.getByLabel("Otro motivo", { exact: true }).check();
  await expect(
    reprint.getByRole("button", { name: "Enviar copia" }),
  ).toBeDisabled();
  await reprint
    .getByLabel("Detalle del motivo")
    .fill("Prueba de respuesta perdida");
  await reprint.getByRole("button", { name: "Enviar copia" }).click();
  await reprint
    .getByRole("button", { name: "Reintentar la misma operación" })
    .click();
  await expect(reprint).toHaveCount(0);
  expect(requestIds).toHaveLength(2);
  expect(requestIds[0]).toBe(requestIds[1]);
  const response = await page.request.get(`/api/printing?saleId=${saleId}`);
  const state = (await response.json()) as PrintingSnapshot;
  const copies = state.jobs.filter(
    (j) => j.kind === "copy" && !existingCopies.has(j.id),
  );
  expect(copies).toHaveLength(1);
  expect(copies[0].stationName).toBe("Cocina");
  expect(copies[0].document.lines.map((l) => l.text)).toContain(
    `COPIA ${copies[0].copyNumber}`,
  );
  await detail.getByRole("button", { name: "Cerrar detalle de venta" }).click();
  await expect(detail).toHaveCount(0);
  await expect(page).toHaveURL(/\/sales(?:\?|$)/);
});
test("settings fit desktop tablet and mobile, and installer bundles the fixed sources", async ({
  page,
  baseURL,
}) => {
  test.setTimeout(120000);
  await login(page, baseURL!);
  await page.goto("/settings/printing");
  const input = page.getByLabel("Nombre de la impresora");
  await expect(input).toBeVisible({ timeout: 60000 });
  await expect(input).toHaveAttribute("required", "");
  await expect(input).toHaveAttribute("maxlength", "160");
  await page
    .getByRole("button", { name: "Generar código de vinculación" })
    .click();
  await expect(page.getByText("Código de un solo uso:")).toBeVisible();
  for (const width of [1440, 1024, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
  }
  const response = await page.request.get("/api/printing/installer");
  expect(response.ok()).toBe(true);
  expect(response.headers()["content-disposition"]).toContain(".ps1");
  const script = await response.text();
  expect(script).toContain("$EmbeddedFiles = @{");
  for (const name of [
    "KyboPrintConnector.ps1",
    "KyboPrintNative.cs",
    "assets/kybo-logo.png",
  ])
    expect(script).toContain(`'${name}' = '`);
  expect(script).not.toContain("# KYBO_PAYLOAD_RECORDS");
});
test("shared store can consult sale tickets but cannot change setup or download installer", async ({
  page,
  baseURL,
}) => {
  test.setTimeout(120000);
  await login(page, baseURL!, true);
  expect(
    (await page.request.get(`/api/printing?saleId=${saleId}`)).status(),
  ).toBe(200);
  expect((await page.request.get("/api/printing")).status()).toBe(403);
  expect((await page.request.get("/api/printing/installer")).status()).toBe(
    403,
  );
  const response = await page.request.post("/api/printing", {
    headers: { Origin: new URL(baseURL!).origin },
    data: {
      requestId: crypto.randomUUID(),
      command: {
        action: "configure",
        revision: 1,
        enabled: true,
        printerName: "Forbidden",
      },
    },
  });
  expect(response.status()).toBe(403);
  await page.goto(`/sales?account=${saleId}`);
  await expect(
    page.getByRole("region", { name: "Impresión de comandas" }),
  ).toBeVisible({ timeout: 60000 });
});
