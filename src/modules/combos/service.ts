import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import type { AppDb } from "@/db/client";
import type { Actor } from "@/lib/access";
import { products } from "@/db/business-schema";
import { comboVersions, comboGroups, comboOptions } from "@/db/combo-schema";
import {
  requireCatalogManagement,
  requireCatalogRead,
} from "@/modules/branches/context";
import {
  claim,
  fingerprint,
  invalid,
  conflict,
  audit,
  type Tx,
} from "@/modules/inventory/service";
import { recipeGraphLock } from "@/db/recipe-schema";
const money = z
  .string()
  .regex(/^\d{1,12}(\.\d{1,2})?$/)
  .default("0");
export const comboInput = z
  .object({
    requestId: z.uuid(),
    revision: z.number().int().min(0),
    groups: z
      .array(
        z
          .object({
            name: z.string().trim().min(1).max(100),
            quantity: z.number().int().min(1).max(99),
            options: z
              .array(
                z
                  .object({
                    productId: z.uuid(),
                    counter: money,
                    pedidosya: money,
                    ubereats: money,
                  })
                  .strict(),
              )
              .min(1)
              .max(50),
          })
          .strict(),
      )
      .min(1)
      .max(10),
  })
  .strict();
export async function loadCombo(
  db: AppDb | Tx,
  productId: string,
  versionId?: string,
) {
  const [version] = await db
    .select()
    .from(comboVersions)
    .where(
      and(
        eq(comboVersions.productId, productId),
        versionId ? eq(comboVersions.id, versionId) : undefined,
      ),
    )
    .orderBy(desc(comboVersions.revision))
    .limit(1);
  if (!version) return null;
  const groups = await db
    .select()
    .from(comboGroups)
    .where(eq(comboGroups.versionId, version.id))
    .orderBy(asc(comboGroups.position));
  const options = groups.length
    ? await db
        .select({
          option: comboOptions,
          name: products.name,
          archived: products.archivedAt,
        })
        .from(comboOptions)
        .innerJoin(products, eq(products.id, comboOptions.productId))
        .where(
          inArray(
            comboOptions.groupId,
            groups.map((g) => g.id),
          ),
        )
        .orderBy(asc(comboOptions.position))
    : [];
  return {
    ...version,
    groups: groups.map((g) => ({
      ...g,
      options: options
        .filter((o) => o.option.groupId === g.id)
        .map((o) => ({ ...o.option, name: o.name, archived: !!o.archived })),
    })),
  };
}
export type ComboDefinition = NonNullable<
  Awaited<ReturnType<typeof loadCombo>>
>;
export async function getCombo(db: AppDb, actor: Actor, productId: string) {
  await requireCatalogRead(db, actor);
  return loadCombo(db, productId);
}
export async function publishCombo(
  db: AppDb,
  actor: Actor,
  productId: string,
  raw: unknown,
) {
  await requireCatalogManagement(db, actor);
  const input = comboInput.parse(raw);
  z.uuid().parse(productId);
  return db.transaction(async (tx) => {
    const id = crypto.randomUUID();
    const replay = await claim(
      tx,
      actor,
      "combo-publish",
      input.requestId,
      fingerprint("combo-publish", { productId, input }),
      id,
    );
    if (replay) {
      const previous = await loadCombo(tx, productId, replay);
      if (!previous) return conflict("Publicación no disponible.");
      return previous;
    }
    await tx.insert(recipeGraphLock).values({ id: 1 }).onConflictDoNothing();
    await tx
      .select()
      .from(recipeGraphLock)
      .where(eq(recipeGraphLock.id, 1))
      .for("update");
    const [product] = await tx
      .select()
      .from(products)
      .where(eq(products.id, productId))
      .for("share");
    if (!product || product.archivedAt || product.kind !== "combo")
      invalid("Elegí un producto de tipo combo activo.");
    const previous = await loadCombo(tx, productId);
    if ((previous?.revision ?? 0) !== input.revision)
      conflict("El combo cambió. Actualizá sus componentes.");
    const ids = [
      ...new Set(
        input.groups.flatMap((g) => g.options.map((o) => o.productId)),
      ),
    ].sort();
    for (const childId of ids) {
      const [p] = await tx
        .select()
        .from(products)
        .where(eq(products.id, childId))
        .for("share");
      if (!p || p.archivedAt || p.kind !== "individual")
        invalid("Los componentes deben ser productos individuales activos.");
    }
    await tx.insert(comboVersions).values({
      id,
      productId,
      revision: input.revision + 1,
      actorId: actor.id,
    });
    for (const [position, g] of input.groups.entries()) {
      if (new Set(g.options.map((o) => o.productId)).size !== g.options.length)
        invalid("No repitas un producto dentro del mismo grupo.");
      const [group] = await tx
        .insert(comboGroups)
        .values({ versionId: id, name: g.name, quantity: g.quantity, position })
        .returning();
      await tx.insert(comboOptions).values(
        g.options.map((o, position) => ({
          ...o,
          groupId: group.id,
          position,
        })),
      );
    }
    const after = (await loadCombo(tx, productId, id))!;
    await audit(tx, actor, "combos", productId, "publish", { previous, after });
    return after;
  });
}
