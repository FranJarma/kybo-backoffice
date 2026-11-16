import { describe, expect, it, vi } from "vitest";
import { normalizeRecoveryPhone } from "@/modules/password-recovery/validation";
import { codeDigest, matchesDigest } from "@/modules/password-recovery/crypto";
import {
  readRecoveryConfig,
  createMetaCodeSender,
} from "@/modules/password-recovery/provider";

export const testRecoveryConfig = {
  secret: "test-only-recovery-secret-32-bytes-or-more",
  accessToken: "test-only-meta-access-token",
  phoneNumberId: "123456789012345",
  apiVersion: "v25.0",
  templateName: "kybo_recovery_test",
  language: "es_AR",
};

describe("WhatsApp recovery transport", () => {
  it("normalizes explicitly international phones without guessing country codes", () => {
    expect(normalizeRecoveryPhone("+54 9 11 0000-0001")).toBe("+5491100000001");
    expect(() => normalizeRecoveryPhone("1100000001")).toThrow();
    expect(() => normalizeRecoveryPhone("+5491100000001 ext 22")).toThrow();
    expect(() => normalizeRecoveryPhone("+0123456789")).toThrow();
  });
  it("binds a code to its challenge and a private secret", () => {
    const digest = codeDigest(testRecoveryConfig.secret, "one", "012345");
    expect(digest).not.toContain("012345");
    expect(digest).not.toBe(
      codeDigest(testRecoveryConfig.secret, "two", "012345"),
    );
    expect(digest).not.toBe(codeDigest("a-different-secret", "one", "012345"));
    expect(matchesDigest(digest, digest)).toBe(true);
    expect(matchesDigest(digest, "broken")).toBe(false);
  });
  it("is disabled by default and rejects partial enabled configuration", () => {
    expect(readRecoveryConfig({})).toBeNull();
    expect(() =>
      readRecoveryConfig({ KYBO_WHATSAPP_RECOVERY_ENABLED: "true" }),
    ).toThrow();
  });
  it("accepts only explicit fixed-host configuration", () => {
    const config = readRecoveryConfig({
      KYBO_WHATSAPP_RECOVERY_ENABLED: "true",
      KYBO_PASSWORD_RECOVERY_SECRET: testRecoveryConfig.secret,
      KYBO_WHATSAPP_ACCESS_TOKEN: testRecoveryConfig.accessToken,
      KYBO_WHATSAPP_PHONE_NUMBER_ID: testRecoveryConfig.phoneNumberId,
      KYBO_WHATSAPP_API_VERSION: testRecoveryConfig.apiVersion,
      KYBO_WHATSAPP_AUTH_TEMPLATE: testRecoveryConfig.templateName,
      KYBO_WHATSAPP_TEMPLATE_LANGUAGE: testRecoveryConfig.language,
    });
    expect(config).toEqual(testRecoveryConfig);
  });
  it("rejects reusing the authentication secret for recovery", () => {
    expect(() =>
      readRecoveryConfig({
        KYBO_WHATSAPP_RECOVERY_ENABLED: "true",
        KYBO_PASSWORD_RECOVERY_SECRET: testRecoveryConfig.secret,
        BETTER_AUTH_SECRET: testRecoveryConfig.secret,
        KYBO_WHATSAPP_ACCESS_TOKEN: testRecoveryConfig.accessToken,
        KYBO_WHATSAPP_PHONE_NUMBER_ID: testRecoveryConfig.phoneNumberId,
        KYBO_WHATSAPP_API_VERSION: testRecoveryConfig.apiVersion,
        KYBO_WHATSAPP_AUTH_TEMPLATE: testRecoveryConfig.templateName,
        KYBO_WHATSAPP_TEMPLATE_LANGUAGE: testRecoveryConfig.language,
      }),
    ).toThrow();
  });
  it("sends the code in the authentication body and copy-code button without redirects", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        new Response(JSON.stringify({ messages: [{ id: "wamid.test" }] })),
      );
    await createMetaCodeSender(testRecoveryConfig, fetcher).sendCode({
      recipient: "+5491100000001",
      code: "012345",
    });
    const [url, request] = fetcher.mock.calls[0];
    expect(url).toBe(
      "https://graph.facebook.com/v25.0/123456789012345/messages",
    );
    expect(request?.redirect).toBe("error");
    expect(request?.signal).toBeInstanceOf(AbortSignal);
    expect(JSON.parse(request?.body as string)).toMatchObject({
      messaging_product: "whatsapp",
      to: "5491100000001",
      type: "template",
      template: {
        name: "kybo_recovery_test",
        language: { code: "es_AR" },
        components: [
          { type: "body", parameters: [{ type: "text", text: "012345" }] },
          {
            type: "button",
            sub_type: "url",
            index: "0",
            parameters: [{ type: "text", text: "012345" }],
          },
        ],
      },
    });
  });
  it.each([400, 429, 500])("sanitizes provider errors (%s)", async (status) => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response("private phone +5491100000001 and code 012345", {
        status,
      }),
    );
    const error = await createMetaCodeSender(testRecoveryConfig, fetcher)
      .sendCode({ recipient: "+5491100000001", code: "012345" })
      .catch((e: Error) => e);
    expect(error).toMatchObject({ code: "RECOVERY_DELIVERY_FAILED" });
    expect(String(error)).not.toMatch(/012345|5491100000001|test-only-meta/);
  });
  it("does not mistake an invalid successful response for message acceptance", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response("{}"));
    await expect(
      createMetaCodeSender(testRecoveryConfig, fetcher).sendCode({
        recipient: "+5491100000001",
        code: "012345",
      }),
    ).rejects.toMatchObject({ code: "RECOVERY_DELIVERY_FAILED" });
  });
});
