import { afterEach, expect, it, vi } from "vitest";
import {
  createGmailCodeSender,
  readEmailRecoveryConfig,
} from "@/modules/password-recovery/gmail-provider";
const config = {
  channel: "email" as const,
  secret: "email-test-only-private-secret-at-least-32",
  user: "kybo-test-only-sender@gmail.com",
  appPassword: "abcdefghijklmnop",
};
const environment = {
  KYBO_EMAIL_RECOVERY_ENABLED: "true",
  KYBO_PASSWORD_RECOVERY_SECRET: config.secret,
  KYBO_GMAIL_USER: config.user,
  KYBO_GMAIL_APP_PASSWORD: config.appPassword,
};
afterEach(() => vi.unstubAllEnvs());
it("stays off by default even when WhatsApp variables are present", () => {
  expect(
    readEmailRecoveryConfig({ KYBO_WHATSAPP_RECOVERY_ENABLED: "true" }),
  ).toBeNull();
});
it("requires a Gmail sender, app password and independent recovery secret", () => {
  expect(readEmailRecoveryConfig(environment)).toEqual(config);
  expect(
    readEmailRecoveryConfig({
      ...environment,
      KYBO_GMAIL_APP_PASSWORD: "abcd efgh ijkl mnop",
    })?.appPassword,
  ).toBe(config.appPassword);
  expect(() =>
    readEmailRecoveryConfig({ ...environment, KYBO_GMAIL_USER: "invalid" }),
  ).toThrow();
  expect(() =>
    readEmailRecoveryConfig({
      ...environment,
      BETTER_AUTH_SECRET: config.secret,
    }),
  ).toThrow();
  expect(() =>
    readEmailRecoveryConfig({
      ...environment,
      KYBO_GMAIL_APP_PASSWORD: "ordinary-account-password",
    }),
  ).toThrow();
});
it("uses encrypted Gmail SMTP and sends a code to exactly one confirmed recipient", async () => {
  const sendMail = vi
    .fn()
    .mockResolvedValue({
      accepted: ["employee@example.test"],
      rejected: [],
      messageId: "test-message",
    });
  const factory = vi.fn().mockReturnValue({ sendMail });
  await createGmailCodeSender(config, factory).sendCode({
    recipient: "employee@example.test",
    code: "012345",
  });
  expect(factory.mock.calls[0][0]).toMatchObject({
    host: "smtp.gmail.com",
    port: 465,
    secure: true,
    tls: { rejectUnauthorized: true, minVersion: "TLSv1.2" },
    logger: false,
    debug: false,
    disableFileAccess: true,
    disableUrlAccess: true,
  });
  const body = sendMail.mock.calls[0][0];
  expect(body.to).toEqual(["employee@example.test"]);
  expect(body.from).toBe(`Kybo Operations <${config.user}>`);
  expect(body.text).toContain("012345");
  expect(body.text).toContain("5 minutos");
  expect(body.subject).not.toContain("012345");
  expect(body.html).toBeUndefined();
});
it("sanitizes SMTP authentication and delivery errors", async () => {
  const factory = vi.fn().mockReturnValue({
    sendMail: async () => {
      throw new Error(
        "private employee@example.test code 012345 password abcdefghijklmnop",
      );
    },
  });
  const error = await createGmailCodeSender(config, factory)
    .sendCode({ recipient: "employee@example.test", code: "012345" })
    .catch((error) => error);
  expect(error).toMatchObject({ code: "RECOVERY_DELIVERY_FAILED" });
  expect(String(error)).not.toMatch(/employee@|012345|abcdefghijklmnop/);
});
it("rejects malformed codes or placeholder recipients before creating a transport", async () => {
  const factory = vi.fn();
  await expect(
    createGmailCodeSender(config, factory).sendCode({
      recipient: "reserved@users.invalid",
      code: "012345",
    }),
  ).rejects.toThrow();
  await expect(
    createGmailCodeSender(config, factory).sendCode({
      recipient: "employee@example.test",
      code: "wrong",
    }),
  ).rejects.toThrow();
  expect(factory).not.toHaveBeenCalled();
});
it("does not mistake SMTP rejection for acceptance", async () => {
  const factory = vi
    .fn()
    .mockReturnValue({
      sendMail: async () => ({
        accepted: [],
        rejected: ["employee@example.test"],
      }),
    });
  await expect(
    createGmailCodeSender(config, factory).sendCode({
      recipient: "employee@example.test",
      code: "012345",
    }),
  ).rejects.toMatchObject({ code: "RECOVERY_DELIVERY_FAILED" });
});
