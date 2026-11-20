import nodemailer from "nodemailer";
import type SMTPTransport from "nodemailer/lib/smtp-transport";
import { AppError } from "@/lib/errors";
import type { CodeSender, RecoveryContext } from "./types";
import { isRecoveryEmail } from "./validation";
import { recoveryUnavailable } from "./provider";
export type EmailRecoveryConfig = RecoveryContext & {
  channel: "email";
  user: string;
  appPassword: string;
};
type Mail = { from: string; to: string[]; subject: string; text: string };
type Transport = {
  sendMail(
    message: Mail,
  ): Promise<{
    accepted?: Array<string | { address?: string }>;
    rejected?: unknown[];
  }>;
};
type TransportFactory = (options: SMTPTransport.Options) => Transport;
export function readEmailRecoveryConfig(
  env: Record<string, string | undefined> = process.env,
): EmailRecoveryConfig | null {
  if (env.KYBO_EMAIL_RECOVERY_ENABLED !== "true") return null;
  const result: EmailRecoveryConfig = {
    channel: "email",
    secret: env.KYBO_PASSWORD_RECOVERY_SECRET ?? "",
    user: (env.KYBO_GMAIL_USER ?? "").trim().toLowerCase(),
    appPassword: (env.KYBO_GMAIL_APP_PASSWORD ?? "").replace(/\s/g, ""),
  };
  if (
    result.secret.length < 32 ||
    result.secret === env.BETTER_AUTH_SECRET ||
    !isRecoveryEmail(result.user) ||
    !/@(?:gmail|googlemail)\.com$/.test(result.user) ||
    !/^[A-Za-z0-9]{16}$/.test(result.appPassword)
  )
    throw recoveryUnavailable();
  return result;
}
export function createGmailCodeSender(
  config: EmailRecoveryConfig,
  createTransport: TransportFactory = (options) =>
    nodemailer.createTransport(options),
): CodeSender {
  return {
    async sendCode({ recipient, code }) {
      try {
        if (!isRecoveryEmail(recipient) || !/^\d{6}$/.test(code))
          throw new Error();
        const transport = createTransport({
          host: "smtp.gmail.com",
          port: 465,
          secure: true,
          auth: { user: config.user, pass: config.appPassword },
          tls: { rejectUnauthorized: true, minVersion: "TLSv1.2" },
          connectionTimeout: 8000,
          greetingTimeout: 5000,
          socketTimeout: 8000,
          dnsTimeout: 5000,
          logger: false,
          debug: false,
          disableFileAccess: true,
          disableUrlAccess: true,
        });
        const result = await transport.sendMail({
          from: `Kybo Operations <${config.user}>`,
          to: [recipient],
          subject: "Tu código de recuperación de Kybo",
          text: `Recuperación de acceso a Kybo Operations\n\nTu código es: ${code}\n\nVence en 5 minutos y se usa una sola vez.\nNo compartas este código con nadie.\n\nSi no solicitaste recuperar tu acceso, ignorá este correo. Tu contraseña no cambió.`,
        });
        const accepted = result.accepted?.some(
          (address) =>
            (typeof address === "string"
              ? address
              : (address.address ?? "")
            ).toLowerCase() === recipient.toLowerCase(),
        );
        if (!accepted || (result.rejected?.length ?? 0) > 0) throw new Error();
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
