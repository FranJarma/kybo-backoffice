import { test, expect } from "@playwright/test";

const storeUsername = process.env.E2E_STORE_USERNAME;
const storePassword = process.env.E2E_STORE_PASSWORD;
const username = process.env.E2E_PERSONAL_USERNAME;
const password = process.env.E2E_PERSONAL_PASSWORD;
test.skip(
  !storeUsername || !storePassword || !username || !password,
  "Disposable store and participating admin accounts required",
);

test("skips browser location only when the branch allows it and retains native verification", async ({
  page,
  playwright,
  baseURL,
}) => {
  test.setTimeout(90000);
  const origin = new URL(baseURL!).origin;
  const store = await playwright.request.newContext({ baseURL });
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
  await page.setViewportSize({ width: 390, height: 844 });
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
          data: { username, password },
        })
      ).ok(),
    ).toBe(true);
    const initial = await (await store.get("/api/attendance/qr")).json();
    const branchId = initial.code.split(".")[1];
    const snapshot = async () => {
      const response = await page.request.get("/api/attendance", {
        headers: { "X-Kybo-Branch-Id": branchId },
      });
      expect(response.ok()).toBe(true);
      return response.json();
    };
    const configure = async (requireLocation: boolean) => {
      const { settings } = await snapshot();
      const response = await page.request.post("/api/attendance", {
        headers: { Origin: origin, "X-Kybo-Branch-Id": branchId },
        data: {
          requestId: crypto.randomUUID(),
          command: {
            action: "configure",
            expectedRevision: settings.revision,
            enabled: settings.enabled,
            latitude: settings.latitude,
            longitude: settings.longitude,
            radiusMeters: settings.radiusMeters,
            maxAccuracyMeters: settings.maxAccuracyMeters,
            codeValidityMinutes: settings.codeValidityMinutes,
            requireStepUp: settings.requireStepUp,
            requireLocation,
          },
        },
      });
      expect(response.ok()).toBe(true);
    };
    const scan = async () => {
      const response = await store.get("/api/attendance/qr");
      expect(response.ok()).toBe(true);
      const url = new URL((await response.json()).url);
      await page.goto(url.pathname + url.search);
    };
    await page.goto("/settings/attendance");
    await page
      .getByLabel("Exigir cercanía al local", { exact: true })
      .uncheck();
    await page
      .getByRole("button", { name: "Guardar configuración", exact: true })
      .click();
    await expect(
      page.getByRole("status").filter({ hasText: "Cambios guardados." }),
    ).toBeVisible();
    await expect(
      page.getByLabel("Exigir cercanía al local", { exact: true }),
    ).not.toBeChecked();
    await expect(
      page.getByLabel("Radio permitido (metros)", { exact: false }),
    ).toHaveCount(0);
    expect((await snapshot()).settings.requireLocation).toBe(false);
    await page.screenshot({
      path: test.info().outputPath("location-policy-off.png"),
      fullPage: true,
    });
    await scan();
    await expect(
      page.getByLabel("Contraseña de tu cuenta", { exact: false }),
    ).toBeVisible();
    await page
      .getByLabel("Contraseña de tu cuenta", { exact: false })
      .fill(password!);
    await page
      .getByRole("button", { name: "Activar verificación", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Tu celular está preparado." }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Continuar", exact: true }).click();
    await expect(
      page.getByText("QR del local recibido", { exact: true }),
    ).toBeVisible();
    await page.evaluate(() => {
      const target = window as typeof window & { locationCalls: number };
      target.locationCalls = 0;
      Object.defineProperty(navigator, "geolocation", {
        configurable: true,
        value: {
          getCurrentPosition: () => {
            target.locationCalls++;
            throw new Error("Location must not be requested in this branch");
          },
        },
      });
    });
    await page
      .getByRole("button", { name: "Registrar entrada", exact: true })
      .click();
    await expect(
      page.getByRole("status").filter({ hasText: "Fichaje registrado." }),
    ).toBeVisible({ timeout: 15000 });
    expect(
      await page.evaluate(
        () =>
          (window as typeof window & { locationCalls: number }).locationCalls,
      ),
    ).toBe(0);
    expect((await snapshot()).events).toMatchObject([
      { kind: "entry", locationVerified: false },
    ]);

    await configure(true);
    await page.context().grantPermissions(["geolocation"]);
    await page
      .context()
      .setGeolocation({ latitude: 0, longitude: 0, accuracy: 1 });
    await scan();
    await expect(
      page.getByText("QR del local recibido", { exact: true }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Comenzar pausa", exact: true })
      .click();
    await expect(
      page.getByRole("alert").filter({ hasText: "zona del local" }),
    ).toBeVisible({ timeout: 15000 });
    expect((await snapshot()).events).toHaveLength(1);
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
