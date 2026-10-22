import { z } from "zod";
export const userCommandSchema = z
  .object({
    requestId: z.uuid(),
    id: z.string().min(1).max(200).optional(),
    version: z
      .string()
      .regex(/^[a-f0-9]{64}$/)
      .optional(),
    name: z.string().trim().min(1, "Completá el nombre.").max(120),
    username: z.string().trim().toLowerCase().max(30),
    email: z
      .string()
      .trim()
      .toLowerCase()
      .pipe(z.union([z.literal(""), z.email("Ingresá un correo válido.")])),
    password: z.string().max(128).default(""),
    role: z.enum(["admin", "manager", "staff"]),
    disabled: z.boolean(),
    catalogManager: z.boolean(),
    memberships: z
      .array(
        z
          .object({ branchId: z.uuid(), role: z.enum(["manager", "staff"]) })
          .strict(),
      )
      .max(50),
  })
  .strict()
  .superRefine((input, ctx) => {
    const issue = (path: string, message: string) =>
      ctx.addIssue({ code: "custom", path: [path], message });
    if (!input.username && (!input.id || !input.email))
      issue("username", "Completá el usuario para ingresar.");
    if (input.username && !/^[a-z0-9_.]{3,30}$/.test(input.username))
      issue(
        "username",
        "Usá de 3 a 30 letras, números, puntos o guiones bajos en el usuario.",
      );
    if ((!input.id || input.password) && input.password.length < 8)
      issue("password", "La contraseña debe tener al menos 8 caracteres.");
    if (input.id && !input.version)
      issue("version", "Actualizá la cuenta antes de guardar.");
    if (
      input.role !== "admin" &&
      !input.memberships.length &&
      (!input.id || !input.disabled)
    )
      issue("memberships", "Asigná al menos una sucursal.");
    if (input.role === "admin" && input.memberships.length)
      issue(
        "memberships",
        "El administrador tiene acceso a todas las sucursales.",
      );
    if (
      new Set(input.memberships.map((m) => m.branchId)).size !==
      input.memberships.length
    )
      issue("memberships", "Una sucursal está repetida.");
  });
