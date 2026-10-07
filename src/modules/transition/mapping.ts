import { z } from "zod";
import { branchSchema, locationSchema } from "../branches/validation";
import { itemSchema } from "../items/validation";
const identity = locationSchema.extend({ id: z.uuid() });
export const transitionMappingSchema = z
  .object({
    initialBranch: identity.extend({ timeZone: branchSchema.shape.timeZone }),
    initialLocation: identity,
    memberships: z.array(
      z
        .object({
          userId: z.string().min(1),
          branchId: z.uuid(),
          role: z.enum(["manager", "staff"]),
        })
        .strict(),
    ),
    catalogManagers: z.array(z.string().min(1)),
    itemClassifications: z.array(
      z
        .object({
          id: z.uuid(),
          code: itemSchema.shape.code,
          class: itemSchema.shape.class,
          purchasable: z.boolean(),
          recipeUsable: z.boolean(),
        })
        .strict(),
    ),
    cutoverAt: z.iso.datetime({ offset: true }),
  })
  .strict()
  .superRefine((mapping, ctx) => {
    if (
      new Set(mapping.itemClassifications.map((i) => i.id)).size !==
      mapping.itemClassifications.length
    )
      ctx.addIssue({
        code: "custom",
        path: ["itemClassifications"],
        message: "No repitas artículos.",
      });
    if (
      new Set(mapping.itemClassifications.map((i) => i.code)).size !==
      mapping.itemClassifications.length
    )
      ctx.addIssue({
        code: "custom",
        path: ["itemClassifications"],
        message: "No repitas códigos.",
      });
    if (
      mapping.memberships.some((m) => m.branchId !== mapping.initialBranch.id)
    )
      ctx.addIssue({
        code: "custom",
        path: ["memberships"],
        message: "Las membresías deben pertenecer a la sucursal inicial.",
      });
    if (
      new Set(mapping.memberships.map((m) => m.userId)).size !==
      mapping.memberships.length
    )
      ctx.addIssue({
        code: "custom",
        path: ["memberships"],
        message: "No repitas miembros.",
      });
    for (const [i, item] of mapping.itemClassifications.entries())
      if (item.class === "cleaning" && item.recipeUsable)
        ctx.addIssue({
          code: "custom",
          path: ["itemClassifications", i],
          message: "Limpieza no puede utilizarse en recetas.",
        });
  });
export type TransitionMapping = z.infer<typeof transitionMappingSchema>;
