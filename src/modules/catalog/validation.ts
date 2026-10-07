import { z } from "zod";
import type { Entity } from "./types";
import { AppError } from "@/lib/errors";
import { itemSchema } from "../items/validation";

export function parseDecimal(input: unknown, scale: number): string | null {
  if (input === null || input === undefined || input === "") return null;
  if (typeof input !== "string" || input.length > 80)
    throw new AppError(
      "VALIDATION",
      "Ingresá un importe válido con coma decimal.",
      400,
    );
  const value = input.trim();
  if (value === "") return null;
  if (!/^(?:\d+|\d{1,3}(?:\.\d{3})+)(?:,\d+)?$/.test(value))
    throw new AppError(
      "VALIDATION",
      "Usá coma para decimales y puntos solo para miles.",
      400,
    );
  const [rawInt, fraction = ""] = value.replaceAll(".", "").split(",");
  const integer = BigInt(rawInt).toString();
  if (integer.length > 12 || fraction.length > scale)
    throw new AppError(
      "VALIDATION",
      `El valor admite hasta ${scale} decimales y 12 dígitos enteros.`,
      400,
    );
  return `${integer}.${fraction.padEnd(scale, "0")}`;
}

const name = z
  .string()
  .trim()
  .min(1, "Ingresá un nombre.")
  .max(160, "El nombre admite hasta 160 caracteres.");
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((value) => value || null);
const email = z
  .union([z.literal(""), z.email("Revisá el email.").max(254)])
  .nullish()
  .transform((value) => value || null);
const phone = z
  .string()
  .trim()
  .max(60)
  .nullish()
  .transform((value) => value?.replace(/[\s()-]/g, "") || null)
  .refine(
    (value) => value === null || /^\+[1-9]\d{7,14}$/.test(value),
    "Usá el teléfono completo con código de país, por ejemplo +54.",
  );
const decimal = (scale: number, required = false, positive = false) =>
  z
    .unknown()
    .transform((value) => parseDecimal(value, scale))
    .refine((value) => !required || value !== null, "Completá este importe.")
    .refine(
      (value) =>
        !positive || (value !== null && BigInt(value.replace(".", "")) > 0n),
      "La cantidad debe ser mayor que cero.",
    );
const schemas = {
  suppliers: z
    .object({ name, email, phone, notes: optionalText(2000) })
    .strict(),
  customers: z.object({ name, email, phone }).strict(),
  "payment-methods": z
    .object({ name, kind: z.enum(["cash", "card", "transfer", "other"]) })
    .strict(),
  items: z.preprocess((raw) => {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return raw;
    const value = raw as Record<string, unknown>;
    const booleanValue = (v: unknown) =>
      v === "true" ? true : v === "false" ? false : v;
    return {
      ...value,
      unitCost: parseDecimal(value.unitCost, 6),
      purchasable: booleanValue(value.purchasable),
      recipeUsable: booleanValue(value.recipeUsable),
    };
  }, itemSchema),
  products: z
    .object({
      name,
      priceCounter: decimal(2, true),
      pricePedidosYa: decimal(2),
      priceUberEats: decimal(2),
    })
    .strict(),
  presentations: z
    .object({
      name,
      supplierId: z.uuid(),
      itemId: z.uuid(),
      baseQuantity: decimal(6, true, true),
    })
    .strict(),
};

export function parseInput(
  entity: Entity,
  input: unknown,
): Record<string, unknown> {
  const result = schemas[entity].safeParse(input);
  if (!result.success)
    throw new AppError(
      "VALIDATION",
      result.error.issues[0]?.message ?? "Revisá los campos.",
      400,
    );
  return result.data;
}

export function parseUpdate(input: unknown): {
  revision: number;
  archived?: boolean;
  fields?: Record<string, unknown>;
} {
  if (typeof input !== "object" || input === null || Array.isArray(input))
    throw new AppError("VALIDATION", "Revisá los campos.", 400);
  const { revision, ...fields } = input as Record<string, unknown>;
  if (
    typeof revision !== "number" ||
    !Number.isSafeInteger(revision) ||
    revision < 1
  )
    throw new AppError(
      "VALIDATION",
      "Falta la revisión de esta ficha. Volvé a cargarla.",
      400,
    );
  if ("archived" in fields) {
    if (
      typeof fields.archived !== "boolean" ||
      Object.keys(fields).length !== 1
    )
      throw new AppError(
        "VALIDATION",
        "La acción de archivo no admite otros cambios.",
        400,
      );
    return { revision, archived: fields.archived };
  }
  return { revision, fields };
}
