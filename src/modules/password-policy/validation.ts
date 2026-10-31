import { z } from "zod";
import { safeLoginReturn } from "@/lib/login-return";
export const ownPasswordInput = z
  .object({
    currentPassword: z
      .string()
      .min(1, "Ingresá tu contraseña actual.")
      .max(128),
    newPassword: z
      .string()
      .min(8, "La nueva contraseña debe tener al menos 8 caracteres.")
      .max(128),
  })
  .strict();
export const passwordChangeFields = ownPasswordInput
  .extend({
    confirmPassword: z
      .string()
      .min(1, "Confirmá la nueva contraseña.")
      .max(128),
  })
  .refine((v) => v.newPassword === v.confirmPassword, {
    path: ["confirmPassword"],
    message: "Las contraseñas nuevas no coinciden.",
  })
  .refine(
    (v) =>
      v.newPassword.normalize("NFKC") !== v.currentPassword.normalize("NFKC"),
    {
      path: ["newPassword"],
      message: "Elegí una contraseña diferente de la actual.",
    },
  );
export function passwordChangeLocation(returnTo: unknown, onboarding = false) {
  return `/account/password?returnTo=${encodeURIComponent(safeLoginReturn(returnTo))}${onboarding ? "&onboarding=1" : ""}`;
}
