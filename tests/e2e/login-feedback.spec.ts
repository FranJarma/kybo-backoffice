import { test, expect } from "@playwright/test";
const email = process.env.E2E_EMAIL,
  password = process.env.E2E_PASSWORD;
test.skip(!email || !password, "Disposable authentication fixture required");
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
    await page.getByLabel("Usuario o correo").fill(email!);
    await page.getByLabel("Contraseña", { exact: true }).fill(password!);
    await page.getByRole("button", { name: "Ingresar", exact: true }).click();
    await entry;
    await expect(
      page.getByRole("button", { name: "Abriendo Kybo…", exact: true }),
    ).toBeDisabled();
    await expect(page.getByRole("status")).toContainText("Acceso confirmado");
    await expect(page.getByLabel("Usuario o correo")).toBeDisabled();
    await expect(page.locator("form")).toHaveAttribute("aria-busy", "true");
  } finally {
    release();
  }
  await expect(page).not.toHaveURL(/\/login(?:\?|$)/, { timeout: 25000 });
});
