import { test, expect } from "@playwright/test";

const storeUsername = process.env.E2E_STORE_USERNAME;
const storePassword = process.env.E2E_STORE_PASSWORD;
const personalUsername = process.env.E2E_PERSONAL_USERNAME;
const personalPassword = process.env.E2E_PERSONAL_PASSWORD;

test.skip(
  !storeUsername || !storePassword || !personalUsername || !personalPassword,
  "Disposable personal and shared-store accounts required",
);

test("guides an existing account from the QR to phone verification and back, then skips setup", async ({
  page,
  playwright,
  baseURL,
}) => {
  test.setTimeout(90000);
  const origin = new URL(baseURL!).origin;
  const store = await playwright.request.newContext({ baseURL });
  const scannedPath = async () => {
    const response = await store.get("/api/attendance/qr");
    expect(response.ok()).toBe(true);
    const qr = new URL((await response.json()).url);
    return qr.pathname + qr.search;
  };
  const browser = await page.context().newCDPSession(page);
  await browser.send("WebAuthn.enable");
  await browser.send("WebAuthn.addVirtualAuthenticator", {
    options: {
      protocol: "ctap2",
      transport: "internal",
      hasResidentKey: true,
      hasUserVerification: true,
      isUserVerified: true,
      automaticPresenceSimulation: true,
    },
  });
  try {
    expect(
      (
        await store.post("/api/auth/sign-in/username", {
          headers: { Origin: origin },
          data: { username: storeUsername, password: storePassword },
        })
      ).ok(),
    ).toBe(true);
    expect(
      (
        await page.request.post("/api/auth/sign-in/username", {
          headers: { Origin: origin },
          data: { username: personalUsername, password: personalPassword },
        })
      ).ok(),
    ).toBe(true);

    const path = await scannedPath();
    await page.goto(path);
    await expect(page).toHaveURL(
      `${origin}/onboarding?returnTo=${encodeURIComponent(path)}`,
      { timeout: 20000 },
    );
    await expect(
      page.getByRole("heading", {
        name: "Activá la verificación de tu celular.",
      }),
    ).toBeVisible();

    const password = page.getByLabel("Contraseña de tu cuenta", {
      exact: false,
    });
    await password.fill("Incorrect-TestOnly-123!");
    await page
      .getByRole("button", { name: "Activar verificación", exact: true })
      .click();
    await expect(page.getByRole("alert")).toBeVisible();
    await expect(password).toBeVisible();
    await password.fill(personalPassword!);
    await page
      .getByRole("button", { name: "Activar verificación", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Tu celular está preparado." }),
    ).toBeVisible({ timeout: 20000 });
    await page.getByRole("button", { name: "Continuar", exact: true }).click();
    await expect(page).toHaveURL(origin + path);
    await expect(
      page.getByRole("button", { name: "Registrar entrada", exact: true }),
    ).toBeVisible();

    const fresh = await scannedPath();
    await page.goto(fresh);
    await expect(
      page.getByText("QR del local recibido", { exact: true }),
    ).toBeVisible({ timeout: 15000 });
    await expect(page).toHaveURL(origin + fresh);
    await expect(password).toHaveCount(0);
  } finally {
    await page.request.post("/api/auth/sign-out", {
      headers: { Origin: origin },
      data: {},
    });
    await store.post("/api/auth/sign-out", {
      headers: { Origin: origin },
      data: {},
    });
    await store.dispose();
    await browser.detach();
  }
});
