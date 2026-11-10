import { AppError } from "@/lib/errors";
import type { CodeSender } from "./types";
export type { CodeSender } from "./types";
export type RecoveryConfig = {
  secret: string;
  accessToken: string;
  phoneNumberId: string;
  apiVersion: string;
  templateName: string;
  language: string;
};
export const recoveryUnavailable = () =>
  new AppError(
    "RECOVERY_UNAVAILABLE",
    "La recuperación todavía no está disponible. Pedí a Administración una contraseña temporal.",
    503,
  );
export function readRecoveryConfig(
  env: Record<string, string | undefined> = process.env,
): RecoveryConfig | null {
  if (env.KYBO_WHATSAPP_RECOVERY_ENABLED !== "true") return null;
  const config = {
    secret: env.KYBO_PASSWORD_RECOVERY_SECRET ?? "",
    accessToken: env.KYBO_WHATSAPP_ACCESS_TOKEN ?? "",
    phoneNumberId: env.KYBO_WHATSAPP_PHONE_NUMBER_ID ?? "",
    apiVersion: env.KYBO_WHATSAPP_API_VERSION ?? "",
    templateName: env.KYBO_WHATSAPP_AUTH_TEMPLATE ?? "",
    language: env.KYBO_WHATSAPP_TEMPLATE_LANGUAGE ?? "",
  };
  if (
    config.secret.length < 32 ||
    config.secret === env.BETTER_AUTH_SECRET ||
    config.accessToken.length < 10 ||
    !/^\d{5,30}$/.test(config.phoneNumberId) ||
    !/^v\d{1,3}\.\d{1,2}$/.test(config.apiVersion) ||
    !/^[a-z][a-z0-9_]{1,511}$/.test(config.templateName) ||
    !/^[a-z]{2}(?:_[A-Z]{2})?$/.test(config.language)
  )
    throw recoveryUnavailable();
  return config;
}
export function createMetaCodeSender(
  config: RecoveryConfig,
  fetcher: typeof fetch = fetch,
): CodeSender {
  return {
    async sendCode({ recipient, code }) {
      try {
        const response = await fetcher(
          `https://graph.facebook.com/${config.apiVersion}/${config.phoneNumberId}/messages`,
          {
            method: "POST",
            redirect: "error",
            signal: AbortSignal.timeout(8000),
            headers: {
              Authorization: `Bearer ${config.accessToken}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              messaging_product: "whatsapp",
              recipient_type: "individual",
              to: recipient.slice(1),
              type: "template",
              template: {
                name: config.templateName,
                language: { code: config.language },
                components: [
                  { type: "body", parameters: [{ type: "text", text: code }] },
                  {
                    type: "button",
                    sub_type: "url",
                    index: "0",
                    parameters: [{ type: "text", text: code }],
                  },
                ],
              },
            }),
          },
        );
        if (!response.ok) {
          await response.body?.cancel();
          throw new Error();
        }
        const body: unknown = await response.json();
        if (
          !body ||
          typeof body !== "object" ||
          !("messages" in body) ||
          !Array.isArray(body.messages) ||
          typeof body.messages[0]?.id !== "string" ||
          !body.messages[0].id
        )
          throw new Error();
      } catch {
        throw new AppError(
          "RECOVERY_DELIVERY_FAILED",
          "No se pudo completar el envío de recuperación.",
          503,
        );
      }
    },
  };
}
