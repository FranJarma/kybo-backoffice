import {
  requireCatalogManagement,
  requireCatalogRead,
} from "../branches/context";
import { recipeGraphLock } from "@/db/recipe-schema";
import { randomUUID } from "node:crypto";
import { eq, and, asc } from "drizzle-orm";
import type { AppDb } from "@/db/client";
import type { Actor } from "@/lib/access";
import { items } from "@/db/business-schema";
import {
  modifierGroups,
  modifierGroupVersions,
  modifierOptions,
  modifierOptionComponents,
  recipeModifierGroups,
} from "@/db/modifier-schema";
import {
  audit,
  claim,
  fingerprint,
  invalid,
  conflict,
  notFound,
  type Tx,
} from "@/modules/inventory/service";
import { parseGroup } from "./validation";
import { recipeId } from "@/modules/recipes/service";
export async function groupDefinition(
  db: AppDb | Tx,
  id: string,
  versionId?: string,
) {
  const [g] = await db
    .select()
    .from(modifierGroups)
    .where(eq(modifierGroups.id, id));
  if (!g) notFound();
  const [v] = await db
    .select()
    .from(modifierGroupVersions)
    .where(
      and(
        eq(modifierGroupVersions.groupId, id),
        versionId
          ? eq(modifierGroupVersions.id, versionId)
          : eq(modifierGroupVersions.version, g.revision),
      ),
    );
  if (!v) notFound();
  const opts = await db
    .select()
    .from(modifierOptions)
    .where(eq(modifierOptions.groupVersionId, v.id))
    .orderBy(asc(modifierOptions.position));
  return {
    ...g,
    name: v.name,
    revision: v.version,
    versionId: v.id,
    options: await Promise.all(
      opts.map(async (o) => ({
        ...o,
        components: (
          await db
            .select({
              component: modifierOptionComponents,
              itemClass: items.class,
            })
            .from(modifierOptionComponents)
            .innerJoin(items, eq(items.id, modifierOptionComponents.itemId))
            .where(eq(modifierOptionComponents.optionId, o.id))
        ).map(({ component, itemClass }) => ({ ...component, itemClass })),
      })),
    ),
  };
}
export function createModifierService(db: AppDb) {
  return {
    async list(actor: Actor) {
      await requireCatalogRead(db, actor);
      return db.select().from(modifierGroups).orderBy(asc(modifierGroups.name));
    },
    async get(actor: Actor, id: string, versionId?: string) {
      await requireCatalogRead(db, actor);
      recipeId(id);
      if (versionId) recipeId(versionId);
      return groupDefinition(db, id, versionId);
    },
    async save(actor: Actor, raw: unknown) {
      await requireCatalogManagement(db, actor);
      const input = parseGroup(raw);
      return db.transaction((tx) => publishGroup(tx, actor, input));
    },
    async archive(actor: Actor, id: string, raw: unknown) {
      await requireCatalogManagement(db, actor);
      recipeId(id);
      const input = raw as { revision?: number };
      return db.transaction(async (tx) => {
        const [g] = await tx
          .select()
          .from(modifierGroups)
          .where(eq(modifierGroups.id, id))
          .for("update");
        if (!g) notFound();
        if (g.revision !== input?.revision) conflict("El grupo cambió.");
        await tx
          .update(modifierGroups)
          .set({ archivedAt: new Date() })
          .where(eq(modifierGroups.id, id));
        await audit(tx, actor, "modifier_groups", id, "archive", {});
        return {
          id,
          assignments: await tx
            .select({ recipeVersionId: recipeModifierGroups.recipeVersionId })
            .from(recipeModifierGroups)
            .where(eq(recipeModifierGroups.groupId, id)),
        };
      });
    },
  };
}

export async function publishGroup(
  tx: Tx,
  actor: Actor,
  input: ReturnType<typeof parseGroup>,
) {
  await requireCatalogManagement(tx, actor);
  if (!!input.id !== !!input.revision) invalid("Falta la revisión.");
  if (new Set(input.options.map((o) => o.key)).size !== input.options.length)
    invalid("Claves repetidas.");
  for (const o of input.options) {
    if (o.kind === "instruction" && o.components.length)
      invalid("Una instrucción no lleva ingredientes.");
    if (new Set(o.components.map((c) => c.itemId)).size !== o.components.length)
      invalid("Insumo repetido.");
  }
  const versionId = randomUUID();
  const previous = await claim(
    tx,
    actor,
    "modifier-group",
    input.requestId,
    fingerprint("modifier-group", input),
    versionId,
  );
  if (previous) {
    const [v] = await tx
      .select()
      .from(modifierGroupVersions)
      .where(eq(modifierGroupVersions.id, previous));
    if (!v) notFound();
    return groupDefinition(tx, v.groupId, v.id);
  }
  await tx.insert(recipeGraphLock).values({ id: 1 }).onConflictDoNothing();
  await tx
    .select()
    .from(recipeGraphLock)
    .where(eq(recipeGraphLock.id, 1))
    .for("update");
  const id = input.id ?? randomUUID();
  let revision = 1;
  if (input.id) {
    const [g] = await tx
      .select()
      .from(modifierGroups)
      .where(eq(modifierGroups.id, id))
      .for("update");
    if (!g) notFound();
    if (g.revision !== input.revision || g.archivedAt)
      conflict("El grupo cambió o está archivado.");
    revision = g.revision + 1;
    await tx
      .update(modifierGroups)
      .set({ revision, name: input.name })
      .where(eq(modifierGroups.id, id));
  } else await tx.insert(modifierGroups).values({ id, name: input.name });
  const stock = new Map<string, typeof items.$inferSelect>();
  for (const itemId of [
    ...new Set(input.options.flatMap((o) => o.components.map((c) => c.itemId))),
  ].sort()) {
    const [item] = await tx
      .select()
      .from(items)
      .where(eq(items.id, itemId))
      .for("update");
    if (!item || item.archivedAt || !item.recipeUsable)
      conflict("Elegí artículos activos habilitados para recetas.");
    stock.set(itemId, item);
  }
  await tx.insert(modifierGroupVersions).values({
    id: versionId,
    groupId: id,
    version: revision,
    name: input.name,
    actorId: actor.id,
  });
  for (const [position, o] of input.options.entries()) {
    const optionId = randomUUID();
    await tx.insert(modifierOptions).values({
      id: optionId,
      groupVersionId: versionId,
      key: o.key,
      name: o.name,
      kind: o.kind,
      instruction: o.kind === "instruction" ? o.instruction || o.name : null,
      position,
    });
    for (const c of o.components) {
      const item = stock.get(c.itemId)!;
      if (c.baseUnit && c.baseUnit !== item.baseUnit)
        conflict("Cambió la unidad del insumo.");
      await tx.insert(modifierOptionComponents).values({
        optionId,
        itemId: item.id,
        name: item.name,
        baseUnit: item.baseUnit,
        quantity: c.quantity,
        wastePercent: c.wastePercent,
      });
    }
  }
  await audit(tx, actor, "modifier_groups", id, "version", {
    versionId,
    revision,
  });
  return groupDefinition(tx, id, versionId);
}
