import { and, asc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import type { AppDb } from "@/db/client";
import type { Actor } from "@/lib/access";
import { products } from "@/db/business-schema";
import {
  productOptionGroups as groups,
  productOptionGroupVersions as versions,
  productOptionGroupProducts as memberships,
} from "@/db/product-option-group-schema";
import {
  requireCatalogManagement,
  requireCatalogRead,
} from "../branches/context";
import { lockProductSetup } from "../products/onboarding";
import {
  claim,
  fingerprint,
  audit,
  conflict,
  invalid,
  notFound,
  type Tx,
} from "../inventory/service";

const saveInput = z
  .object({
    requestId: z.uuid(),
    id: z.uuid().optional(),
    revision: z.number().int().positive().optional(),
    name: z.string().trim().min(1).max(100),
    productIds: z.array(z.uuid()).min(1).max(50),
  })
  .strict()
  .refine((v) => !!v.id === !!v.revision, "Falta la revisión del grupo.")
  .refine(
    (v) => new Set(v.productIds).size === v.productIds.length,
    "No repitas productos en el grupo.",
  );
const archiveInput = z
  .object({ requestId: z.uuid(), revision: z.number().int().positive() })
  .strict();

export async function productGroupDefinition(
  db: AppDb | Tx,
  id: string,
  versionId?: string,
) {
  z.uuid().parse(id);
  if (versionId) z.uuid().parse(versionId);
  const [group] = await db.select().from(groups).where(eq(groups.id, id));
  if (!group) notFound();
  const [version] = await db
    .select()
    .from(versions)
    .where(
      and(
        eq(versions.groupId, id),
        versionId
          ? eq(versions.id, versionId)
          : eq(versions.version, group.revision),
      ),
    );
  if (!version) notFound();
  const options = await db
    .select({
      productId: memberships.productId,
      name: products.name,
      archivedAt: products.archivedAt,
    })
    .from(memberships)
    .innerJoin(products, eq(products.id, memberships.productId))
    .where(eq(memberships.versionId, version.id))
    .orderBy(asc(memberships.position));
  return {
    id: group.id,
    name: version.name,
    revision: version.version,
    latestRevision: group.revision,
    versionId: version.id,
    archivedAt: group.archivedAt,
    options: options.map((p) => ({
      productId: p.productId,
      name: p.name,
      archived: !!p.archivedAt,
    })),
  };
}
export type ProductGroupDefinition = Awaited<
  ReturnType<typeof productGroupDefinition>
>;
export function createProductGroupService(db: AppDb) {
  return {
    async list(actor: Actor) {
      await requireCatalogRead(db, actor);
      return db
        .select({
          id: groups.id,
          name: groups.name,
          revision: groups.revision,
          archivedAt: groups.archivedAt,
          versionId: versions.id,
          productCount: sql<number>`count(${memberships.id})::int`,
        })
        .from(groups)
        .innerJoin(
          versions,
          and(
            eq(versions.groupId, groups.id),
            eq(versions.version, groups.revision),
          ),
        )
        .leftJoin(memberships, eq(memberships.versionId, versions.id))
        .groupBy(groups.id, versions.id)
        .orderBy(asc(groups.name));
    },
    async get(actor: Actor, id: string, versionId?: string) {
      await requireCatalogRead(db, actor);
      return productGroupDefinition(db, id, versionId);
    },
    async save(actor: Actor, raw: unknown) {
      await requireCatalogManagement(db, actor);
      const input = saveInput.parse(raw);
      return db.transaction(async (tx) => {
        const versionId = crypto.randomUUID();
        const replay = await claim(
          tx,
          actor,
          "product-option-group",
          input.requestId,
          fingerprint("product-option-group", input),
          versionId,
        );
        if (replay) {
          const [v] = await tx
            .select()
            .from(versions)
            .where(eq(versions.id, replay));
          if (!v) notFound();
          return productGroupDefinition(tx, v.groupId, v.id);
        }
        await lockProductSetup(tx);
        const id = input.id ?? crypto.randomUUID();
        let revision = 1;
        if (input.id) {
          const [g] = await tx
            .select()
            .from(groups)
            .where(eq(groups.id, id))
            .for("update");
          if (!g) notFound();
          if (g.archivedAt || g.revision !== input.revision)
            conflict("El grupo cambió o está archivado. Volvé a abrirlo.");
          revision = g.revision + 1;
          await tx
            .update(groups)
            .set({ name: input.name, revision })
            .where(eq(groups.id, id));
        } else await tx.insert(groups).values({ id, name: input.name });
        for (const productId of [...input.productIds].sort()) {
          const [p] = await tx
            .select()
            .from(products)
            .where(eq(products.id, productId))
            .for("share");
          if (!p || p.archivedAt || p.kind !== "individual")
            invalid("Elegí productos individuales activos.");
        }
        await tx.insert(versions).values({
          id: versionId,
          groupId: id,
          version: revision,
          name: input.name,
          actorId: actor.id,
        });
        await tx.insert(memberships).values(
          input.productIds.map((productId, position) => ({
            versionId,
            productId,
            position,
          })),
        );
        await audit(tx, actor, "product_option_groups", id, "version", {
          versionId,
          revision,
        });
        return productGroupDefinition(tx, id, versionId);
      });
    },
    async archive(actor: Actor, id: string, raw: unknown) {
      await requireCatalogManagement(db, actor);
      z.uuid().parse(id);
      const input = archiveInput.parse(raw);
      return db.transaction(async (tx) => {
        const replay = await claim(
          tx,
          actor,
          "product-option-group-archive",
          input.requestId,
          fingerprint("product-option-group-archive", { id, input }),
          id,
        );
        if (replay) return { id: replay };
        await lockProductSetup(tx);
        const [g] = await tx
          .select()
          .from(groups)
          .where(eq(groups.id, id))
          .for("update");
        if (!g) notFound();
        if (g.revision !== input.revision || g.archivedAt)
          conflict("El grupo cambió o ya está archivado.");
        await tx
          .update(groups)
          .set({ archivedAt: new Date() })
          .where(eq(groups.id, id));
        await audit(tx, actor, "product_option_groups", id, "archive", {
          revision: g.revision,
        });
        return { id };
      });
    },
  };
}
