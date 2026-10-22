import { test, expect } from "@playwright/test";
test("public display updates, hides stale orders on disconnect, and recovers without login", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  let offline = false;
  await page.route("**/api/public/pickup/**", async (route) => {
    if (offline) return route.abort();
    await route.fulfill({
      json: {
        branchName: "Kybo Centro",
        nextOffset: 0,
        rows: [
          {
            label: "42.1",
            locatorNumber: 7,
            customerName: "Martina",
            state: "ready",
          },
          {
            label: "43.1",
            locatorNumber: null,
            customerName: "Lucía",
            state: "preparing",
          },
          {
            label: "44.1",
            locatorNumber: null,
            customerName: null,
            state: "preparing",
          },
        ],
      },
    });
  });
  await page.goto("/pickup/11111111-1111-4111-8111-111111111111");
  await expect(
    page.getByRole("heading", { name: "Listos para retirar" }),
  ).toBeVisible();
  await expect(page.getByText("Pedido 42.1", { exact: true })).toBeVisible();
  await expect(page.getByText("43.1", { exact: true })).toBeVisible();
  await expect(page.getByText("Martina", { exact: true })).toBeVisible();
  await expect(page.getByText("Lucía", { exact: true })).toBeVisible();
  await expect(page.getByText("44.1", { exact: true })).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({ path: ".next/pickup-public.png", fullPage: true });
  offline = true;
  await expect(page.getByText("Estamos reconectando")).toBeVisible({
    timeout: 15000,
  });
  await expect(page.getByText("Pedido 42.1", { exact: true })).toHaveCount(0);
  offline = false;
  await expect(page.getByText("Pedido 42.1", { exact: true })).toBeVisible({
    timeout: 15000,
  });
});
