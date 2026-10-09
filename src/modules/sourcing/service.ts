import { randomUUID } from "node:crypto";
import { asc, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import type { AppDb } from "@/db/client";
import type { Actor } from "@/lib/access";
import { AppError } from "@/lib/errors";
import { items, suppliers, purchasePresentations } from "@/db/business-schema";
import { itemSuppliers, supplierQuotes } from "@/db/sourcing-schema";
import {
  requireCatalogManagement,
  requireCatalogRead,
} from "../branches/context";
import { audit, claim, fingerprint } from "../inventory/service";
import { baseUnit, comparablePrice, presentationQuantity } from "./quantities";
import { sourcingInput } from "./validation";

const unavailable = () => {
  throw new AppError(
    "CONFLICT",
    "El artículo, proveedor o presentación cambió o está archivado. Recargá los datos.",
    409,
  );
};
const viewQuote = (q: typeof supplierQuotes.$inferSelect) => ({
  ...q,
  createdAt: q.createdAt.toISOString(),
  comparison: comparablePrice(q.price, q.baseQuantity, q.baseUnit),
});

export function createSourcingService(db: AppDb) {
  return {
    async list(actor: Actor, id: string) {
      z.uuid().parse(id);
      await requireCatalogRead(db, actor);
      const [item] = await db.select().from(items).where(eq(items.id, id));
      if (!item) throw new AppError("NOT_FOUND", "El artículo no existe.", 404);
      const [links, packs, latest, history] = await Promise.all([
        db.select().from(itemSuppliers).where(eq(itemSuppliers.itemId, id)),
        db
          .select()
          .from(purchasePresentations)
          .where(eq(purchasePresentations.itemId, id))
          .orderBy(asc(purchasePresentations.name)),
        db
          .selectDistinctOn([supplierQuotes.presentationId])
          .from(supplierQuotes)
          .where(eq(supplierQuotes.itemId, id))
          .orderBy(
            supplierQuotes.presentationId,
            desc(supplierQuotes.quotedOn),
            desc(supplierQuotes.createdAt),
            desc(supplierQuotes.id),
          ),
        db
          .select()
          .from(supplierQuotes)
          .where(eq(supplierQuotes.itemId, id))
          .orderBy(desc(supplierQuotes.createdAt), desc(supplierQuotes.id))
          .limit(30),
      ]);
      const ids = [
        ...new Set([
          ...links.map((r) => r.supplierId),
          ...packs.map((r) => r.supplierId),
        ]),
      ];
      const vendors = ids.length
        ? await db
            .select({
              id: suppliers.id,
              name: suppliers.name,
              archivedAt: suppliers.archivedAt,
            })
            .from(suppliers)
            .where(inArray(suppliers.id, ids))
            .orderBy(asc(suppliers.name))
        : [];
      return {
        item: {
          id,
          name: item.name,
          baseUnit: item.baseUnit,
          archived: !!item.archivedAt,
          purchasable: item.purchasable,
        },
        suppliers: vendors.map((v) => ({
          id: v.id,
          name: v.name,
          archived: !!v.archivedAt,
        })),
        presentations: packs.map((p) => {
          const q = latest.find((q) => q.presentationId === p.id);
          const compatible =
            q &&
            q.itemId === p.itemId &&
            q.supplierId === p.supplierId &&
            q.baseQuantity === p.baseQuantity &&
            q.baseUnit === item.baseUnit;
          return {
            id: p.id,
            supplierId: p.supplierId,
            name: p.name,
            revision: p.revision,
            baseQuantity: p.baseQuantity,
            archived: !!p.archivedAt,
            quote: compatible ? viewQuote(q) : null,
          };
        }),
        history: history.map(viewQuote),
      };
    },
    async write(actor: Actor, id: string, raw: unknown) {
      z.uuid().parse(id);
      const input = sourcingInput.parse(raw);
      return db.transaction(async (tx) => {
        await requireCatalogManagement(tx, actor);
        const resultId = randomUUID();
        const previous = await claim(
          tx,
          { ...actor, branchId: undefined },
          "item-sourcing",
          input.requestId,
          fingerprint("item-sourcing", { itemId: id, ...input }),
          resultId,
        );
        if (previous) return { id: previous };
        // Match catalog writes: presentation (if existing), supplier, then item.
        const [pack] =
          input.action === "quote"
            ? await tx
                .select()
                .from(purchasePresentations)
                .where(eq(purchasePresentations.id, input.presentationId))
                .for("update")
            : [];
        if (
          input.action === "quote" &&
          (!pack ||
            pack.itemId !== id ||
            pack.archivedAt ||
            pack.revision !== input.revision)
        )
          unavailable();
        const supplierId =
          input.action === "quote" ? pack!.supplierId : input.supplierId;
        const [vendor] = await tx
          .select()
          .from(suppliers)
          .where(eq(suppliers.id, supplierId))
          .for("update");
        if (!vendor || vendor.archivedAt) unavailable();
        const [item] = await tx
          .select()
          .from(items)
          .where(eq(items.id, id))
          .for("update");
        if (!item || item.archivedAt || !item.purchasable) unavailable();
        await tx
          .insert(itemSuppliers)
          .values({ itemId: id, supplierId })
          .onConflictDoNothing();
        if (input.action === "presentation") {
          if (baseUnit(input.unit) !== item.baseUnit)
            throw new AppError(
              "VALIDATION",
              "La unidad de la presentación debe corresponder a la del ingrediente.",
              400,
            );
          const [created] = await tx
            .insert(purchasePresentations)
            .values({
              id: resultId,
              itemId: id,
              supplierId,
              name: input.name,
              baseQuantity: presentationQuantity(
                input.unitsPerPack,
                input.contentPerUnit.replace(".", ","),
                input.unit,
              ),
            })
            .returning();
          await audit(tx, actor, "presentations", resultId, "create", created);
        } else if (input.action === "quote") {
          const [created] = await tx
            .insert(supplierQuotes)
            .values({
              id: resultId,
              itemId: id,
              supplierId,
              presentationId: pack!.id,
              presentationName: pack!.name,
              supplierName: vendor.name,
              baseQuantity: pack!.baseQuantity,
              baseUnit: item.baseUnit,
              price: input.price,
              quotedOn: input.quotedOn,
              validUntil: input.validUntil,
              leadTimeDays: input.leadTimeDays,
              minimumPacks: input.minimumPacks,
              actorId: actor.id,
            })
            .returning();
          await audit(tx, actor, "supplier-quotes", resultId, "quote", created);
        } else {
          await audit(tx, actor, "items", id, "link-supplier", {
            itemId: id,
            supplierId,
          });
        }
        return { id: resultId };
      });
    },
  };
}
export type ItemSourcing = Awaited<
  ReturnType<ReturnType<typeof createSourcingService>["list"]>
>;
