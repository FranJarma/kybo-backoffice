import { test, expect } from "@playwright/test";
const username = process.env.E2E_USERNAME,
  password = process.env.E2E_PASSWORD;
test.skip(!username || !password, "Disposable authentication fixture required");
test("keeps progress and prevents another submission until authenticated navigation finishes", async ({
  page,
}) => {
  let release!: () => void, entered!: () => void;
  const entry = new Promise<void>((resolve) => {
    entered = resolve;
  });
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route(
    (url) => url.pathname === "/",
    async (route) => {
      entered();
      await gate;
      await route.continue();
    },
  );
  try {
    await page.goto("/login");
    await page.getByLabel("Usuario", { exact: true }).fill(username!);
    await page.getByLabel("Contraseña", { exact: true }).fill(password!);
    await page.getByRole("button", { name: "Ingresar", exact: true }).click();
    await entry;
    await expect(
      page.getByRole("button", { name: "Abriendo Kybo…", exact: true }),
    ).toBeDisabled();
    await expect(page.getByRole("status")).toContainText("Acceso confirmado");
    await expect(page.getByLabel("Usuario", { exact: true })).toBeDisabled();
    await expect(page.locator("form")).toHaveAttribute("aria-busy", "true");
  } finally {
    release();
  }
  await expect(page).not.toHaveURL(/\/login(?:\?|$)/, { timeout: 25000 });
});
