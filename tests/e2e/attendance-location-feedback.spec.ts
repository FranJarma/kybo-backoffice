import { expect, test } from "@playwright/test";

const username = process.env.E2E_PERSONAL_USERNAME;
const password = process.env.E2E_PERSONAL_PASSWORD;
test.skip(!username || !password, "Disposable participating admin required");

test("previews proximity and never requests GPS when location is optional", async ({
  page,
  baseURL,
}) => {
  test.setTimeout(90000);
  const origin = new URL(baseURL!).origin;
  await page.setViewportSize({ width: 390, height: 844 });
  await page.context().grantPermissions(["geolocation"]);
  await page.context().setGeolocation({
    latitude: -26.83,
    longitude: -65.2,
    accuracy: 12,
  });
  const signIn = await page.request.post("/api/auth/sign-in/username", {
    headers: { Origin: origin },
    data: { username, password },
  });
  expect(signIn.ok()).toBe(true);
  let originalSettings: Record<string, unknown> | undefined;
  const configure = async (settings: Record<string, unknown>) => {
    const snapshot = await (await page.request.get("/api/attendance")).json();
    const result = await page.request.post("/api/attendance", {
      headers: { Origin: origin },
      data: {
        requestId: crypto.randomUUID(),
        command: {
          action: "configure",
          expectedRevision: snapshot.settings.revision,
          enabled: settings.enabled,
          latitude: settings.latitude,
          longitude: settings.longitude,
          radiusMeters: settings.radiusMeters,
          maxAccuracyMeters: settings.maxAccuracyMeters,
          codeValidityMinutes: settings.codeValidityMinutes,
          requireStepUp: settings.requireStepUp,
          requireLocation: settings.requireLocation,
        },
      },
    });
    expect(result.ok()).toBe(true);
  };
  try {
    const initial = await (await page.request.get("/api/attendance")).json();
    originalSettings = initial.settings;
    expect(initial.settings.requireLocation).toBe(true);
    const initialEvents = initial.events.length;
    await page.goto("/staff/attendance");
    const status = page.getByRole("region", { name: "Ubicación al fichar" });
    const refresh = status.getByRole("button", {
      name: "Actualizar ubicación",
    });
    await expect(status).toHaveAttribute("data-state", "inside");
    await expect(status).toContainText("Radio permitido: 100 m");
    await expect(status).toContainText("Aprox. 0 m del local");
    await expect(
      page.getByRole("button", { name: "Registrar entrada", exact: true }),
    ).toBeVisible();
    await page.screenshot({
      path: test.info().outputPath("proximity-inside-mobile.png"),
      fullPage: true,
    });
    await page.setViewportSize({ width: 1535, height: 1000 });
    await page.screenshot({
      path: test.info().outputPath("proximity-inside-desktop.png"),
      fullPage: true,
    });
    await page.setViewportSize({ width: 320, height: 740 });
    expect(
      await status.evaluate(
        (element) => element.scrollWidth <= element.clientWidth,
      ),
    ).toBe(true);
    await page.setViewportSize({ width: 390, height: 844 });

    await page
      .context()
      .setGeolocation({ latitude: -26.8292, longitude: -65.2, accuracy: 20 });
    await refresh.click();
    await expect(status).toHaveAttribute("data-state", "outside");
    await expect(status).toContainText(
      "No podemos confirmar que estés dentro del radio",
    );

    await page
      .context()
      .setGeolocation({ latitude: -26.82, longitude: -65.2, accuracy: 12 });
    await refresh.click();
    await expect(status).toHaveAttribute("data-state", "outside");
    await expect(status).toContainText("1,1 km del local");
    await page.screenshot({
      path: test.info().outputPath("proximity-outside-mobile.png"),
      fullPage: true,
    });

    await page
      .context()
      .setGeolocation({ latitude: -26.83, longitude: -65.2, accuracy: 80 });
    await refresh.click();
    await expect(status).toHaveAttribute("data-state", "inaccurate");
    await expect(status).toContainText("Precisión: ±80 m");

    // Emulate a native permission error after a successful reading. The old
    // green state must disappear and the user must be able to retry.
    await page.evaluate(() => {
      Object.defineProperty(navigator.geolocation, "getCurrentPosition", {
        configurable: true,
        value: (_success: PositionCallback, failure: PositionErrorCallback) => {
          failure({
            code: 1,
            message: "Denied",
            PERMISSION_DENIED: 1,
            POSITION_UNAVAILABLE: 2,
            TIMEOUT: 3,
          });
        },
      });
    });
    await refresh.click();
    await expect(status).toHaveAttribute("data-state", "unavailable");
    await expect(status).toContainText("Permití el acceso a la ubicación");

    // A policy revision must replace the previous state and stop all GPS reads,
    // including automatic refreshes. The attendance manager reloads on focus.
    await configure({ ...originalSettings, requireLocation: false });
    await page.evaluate(() => {
      const target = window as typeof window & {
        locationCalls: number;
        locationSuccess?: PositionCallback;
      };
      target.locationCalls = 0;
      Object.defineProperty(navigator.geolocation, "getCurrentPosition", {
        configurable: true,
        value: (success: PositionCallback) => {
          target.locationCalls++;
          target.locationSuccess = success;
        },
      });
      window.dispatchEvent(new Event("focus"));
    });
    await expect(status).toHaveAttribute("data-state", "not-required");
    await expect(status).toContainText("Podés fichar desde cualquier lugar");
    await expect(status.getByRole("button")).toHaveCount(0);
    await page.evaluate(() => {
      const target = window as typeof window & {
        locationCalls: number;
        locationSuccess?: PositionCallback;
      };
      // A callback from the old required policy cannot restore a green state.
      target.locationSuccess?.({
        coords: { latitude: -26.83, longitude: -65.2, accuracy: 12 },
        timestamp: Date.now(),
      } as GeolocationPosition);
      target.locationCalls = 0;
      window.dispatchEvent(new Event("focus"));
    });
    await page.clock.install();
    await page.clock.fastForward(21000);
    expect(
      await page.evaluate(
        () =>
          (window as typeof window & { locationCalls: number }).locationCalls,
      ),
    ).toBe(0);
    await expect(status).toHaveAttribute("data-state", "not-required");
    expect(
      (await (await page.request.get("/api/attendance")).json()).events,
    ).toHaveLength(initialEvents);
    await page.screenshot({
      path: test.info().outputPath("proximity-not-required-mobile.png"),
      fullPage: true,
    });
  } finally {
    if (originalSettings) await configure(originalSettings);
    await page.request.post("/api/auth/sign-out", {
      headers: { Origin: origin },
      data: {},
    });
  }
});
