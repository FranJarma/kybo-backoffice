import { test, expect } from "@playwright/test";

const username = process.env.E2E_STORE_USERNAME;
const password = process.env.E2E_STORE_PASSWORD;

test.skip(!username || !password, "Disposable shared-store account required");

test("keeps the entire QR above its renewal counter on desktop and tablet", async ({
  page,
}) => {
  const login = await page.request.post("/api/auth/sign-in/username", {
    headers: { Origin: new URL(test.info().project.use.baseURL!).origin },
    data: { username, password },
  });
  expect(login.ok()).toBe(true);
  try {
    await page.goto("/staff/attendance/qr");
    const qr = page.getByRole("img", {
      name: "Escaneá este QR para abrir tu fichaje personal",
    });
    await expect(qr).toBeVisible({ timeout: 30000 });

    for (const width of [1535, 1280, 1024, 820]) {
      await page.setViewportSize({ width, height: 960 });
      await expect(async () => {
        const image = await qr.boundingBox();
        const frame = await page.locator(".attendance-qr-image").boundingBox();
        const timer = await page.locator(".attendance-qr-timer").boundingBox();
        expect(image).not.toBeNull();
        expect(frame).not.toBeNull();
        expect(timer).not.toBeNull();
        expect(image!.y + image!.height).toBeLessThanOrEqual(timer!.y + 1);
        expect(image!.x).toBeGreaterThanOrEqual(frame!.x - 1);
        expect(image!.x + image!.width).toBeLessThanOrEqual(
          frame!.x + frame!.width + 1,
        );
        expect(image!.y + image!.height).toBeLessThanOrEqual(
          frame!.y + frame!.height + 1,
        );
        expect(Math.abs(image!.width - image!.height)).toBeLessThanOrEqual(1);
      }).toPass({ timeout: 3000 });
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
      ).toBe(true);
      await page.screenshot({
        path: test.info().outputPath(`qr-${width}.png`),
        fullPage: true,
      });
    }
  } finally {
    await page.request.post("/api/auth/sign-out", {
      headers: { Origin: new URL(test.info().project.use.baseURL!).origin },
      data: {},
    });
  }
});
