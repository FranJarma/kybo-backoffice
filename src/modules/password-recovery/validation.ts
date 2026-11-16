import { z } from "zod";
export function isRecoveryEmail(value: string) {
  return (
    z.email().safeParse(value).success &&
    !value.toLowerCase().endsWith("@users.invalid")
  );
}

export function normalizeRecoveryPhone(value: string) {
  const phone = value.trim().replace(/[\s().-]/g, "");
  if (!/^\+[1-9]\d{7,14}$/.test(phone))
    throw new Error("Ingresá el WhatsApp con + y código de país.");
  return phone;
}
const phone = z
  .string()
  .max(60)
  .transform((value, ctx) => {
    if (!value.trim()) return "";
    try {
      return normalizeRecoveryPhone(value);
    } catch {
      ctx.addIssue({
        code: "custom",
        message: "Ingresá el WhatsApp con + y código de país.",
      });
      return z.NEVER;
    }
  });
export const recoveryContactInput = z
  .object({
    phone,
    enabled: z.boolean(),
    confirmed: z.boolean(),
    version: z.uuid().nullable(),
  })
  .strict()
  .superRefine((input, ctx) => {
    if (input.enabled && (!input.phone || !input.confirmed))
      ctx.addIssue({
        code: "custom",
        path: [input.phone ? "confirmed" : "phone"],
        message:
          "Confirmá que el WhatsApp pertenece a esta persona antes de habilitarlo.",
      });
  });
const identifier = z
  .string()
  .trim()
  .toLowerCase()
  .min(1, "Ingresá tu usuario o correo.")
  .max(254);
const challengeId = z.uuid();
export const recoveryRequestInput = z
  .object({ action: z.literal("request"), identifier })
  .strict();
export const recoveryVerifyInput = z
  .object({
    action: z.literal("verify"),
    challengeId,
    code: z.string().regex(/^\d{6}$/, "Ingresá los seis dígitos del código."),
  })
  .strict();
export const recoveryResetInput = z
  .object({
    action: z.literal("reset"),
    challengeId,
    token: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
    newPassword: z.string().min(8, "Usá al menos 8 caracteres.").max(128),
    confirmPassword: z.string().min(1, "Confirmá la contraseña.").max(128),
  })
  .strict()
  .refine((input) => input.newPassword === input.confirmPassword, {
    path: ["confirmPassword"],
    message: "Las contraseñas no coinciden.",
  });
export const recoveryInput = z.union([
  recoveryRequestInput,
  recoveryVerifyInput,
  recoveryResetInput,
]);
export type RecoveryContactState = {
  ready: boolean;
  phone: string | null;
  enabled: boolean;
  confirmed: boolean;
  version: string | null;
};
