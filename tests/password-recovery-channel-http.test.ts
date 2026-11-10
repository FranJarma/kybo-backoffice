import { beforeEach, afterEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ getDb: vi.fn() }));
vi.mock("@/db/client", () => ({ getDb: mocks.getDb }));
import { GET } from "@/app/api/account/recovery/route";
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("KYBO_EMAIL_RECOVERY_ENABLED", "false");
  vi.stubEnv("KYBO_WHATSAPP_RECOVERY_ENABLED", "true");
});
afterEach(() => vi.unstubAllEnvs());
it("never activates WhatsApp as a fallback when email is disabled", async () => {
  const response = await GET(
    new Request("http://localhost:3000/api/account/recovery"),
  );
  expect(await response.json()).toEqual({ available: false });
  expect(mocks.getDb).not.toHaveBeenCalled();
});
it("can enable only the email channel without any WhatsApp credentials", async () => {
  vi.stubEnv("KYBO_EMAIL_RECOVERY_ENABLED", "true");
  vi.stubEnv("KYBO_WHATSAPP_RECOVERY_ENABLED", "false");
  vi.stubEnv(
    "KYBO_PASSWORD_RECOVERY_SECRET",
    "a-fake-recovery-secret-at-least-32-characters",
  );
  vi.stubEnv("KYBO_GMAIL_USER", "kybo-test-only-sender@gmail.com");
  vi.stubEnv("KYBO_GMAIL_APP_PASSWORD", "abcdefghijklmnop");
  mocks.getDb.mockResolvedValue({
    execute: async () => ({ rows: [{ ready: true }] }),
  });
  const response = await GET(
    new Request("http://localhost:3000/api/account/recovery"),
  );
  expect(await response.json()).toEqual({ available: true });
});
