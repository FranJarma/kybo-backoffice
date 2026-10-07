import { requireOperationalContext } from "../branches/context";
import { locations } from "@/db/branch-schema";
import { randomUUID } from "node:crypto";
import { and, asc, count, eq, ilike, inArray, isNull, sql } from "drizzle-orm";
import type { AppDb } from "@/db/client";
import { requireCatalogAccess, type Actor } from "@/lib/access";
import { products } from "@/db/business-schema";
import {
  preparationStations,
  preparationRoutes,
  preparationTasks,
} from "@/db/preparation-schema";
import {
  audit,
  claim,
  fingerprint,
  conflict,
  invalid,
  notFound,
} from "@/modules/inventory/service";
import { parse } from "@/modules/sales/validation";
import { settingsSchema, stationSchema, routeSchema } from "./validation";
import { stationView } from "./queries";
import { activeStates, type PrepSettings } from "./types";
async function stationTransaction<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (error) {
    let item: unknown = error;
    for (let i = 0; i < 4 && item && typeof item === "object"; i++) {
      if ("code" in item && item.code === "23505")
        conflict("Ya existe una estación con ese nombre.");
      item = "cause" in item ? item.cause : null;
    }
    throw error;
  }
}
export function createPreparationSettings(db: AppDb) {
  return {
    async list(actor: Actor | null, raw: unknown = {}): Promise<PrepSettings> {
      requireCatalogAccess(actor);
      const ctx = await requireOperationalContext(
        db,
        actor!,
        actor!.branchId ?? "",
      );
      requireCatalogAccess({ id: ctx.actorId, role: ctx.role });
      if (ctx.role === "staff")
        invalid("Se requiere permiso de encargado.", "FORBIDDEN", 403);
      const input = parse(settingsSchema, raw);
      return db.transaction(
        async (tx) => {
          const stations = await tx
            .select()
            .from(preparationStations)
            .where(eq(preparationStations.branchId, ctx.branchId))
            .orderBy(asc(preparationStations.name));
          const where = and(
            input.includeArchived ? undefined : isNull(products.archivedAt),
            ilike(
              products.name,
              `%${input.q.trim().replace(/[\\%_]/g, "\\$&")}%`,
            ),
          );
          const [{ total }] = await tx
            .select({ total: count() })
            .from(products)
            .where(where);
          const rows = await tx
            .select({
              id: products.id,
              name: products.name,
              archivedAt: products.archivedAt,
              revision: preparationRoutes.revision,
              stationId: preparationRoutes.stationId,
            })
            .from(products)
            .leftJoin(
              preparationRoutes,
              and(
                eq(preparationRoutes.productId, products.id),
                eq(preparationRoutes.branchId, ctx.branchId),
              ),
            )
            .where(where)
            .orderBy(asc(products.name), asc(products.id))
            .limit(30)
            .offset(input.offset);
          return {
            locations: await tx
              .select({ id: locations.id, name: locations.name })
              .from(locations)
              .where(
                and(
                  eq(locations.branchId, ctx.branchId),
                  isNull(locations.archivedAt),
                ),
              )
              .orderBy(locations.name),
            stations: stations.map(stationView),
            products: rows.map(({ archivedAt, ...p }) => ({
              ...p,
              archived: !!archivedAt,
              revision: p.revision ?? 0,
            })),
            total,
            offset: input.offset,
          };
        },
        { isolationLevel: "repeatable read", accessMode: "read only" },
      );
    },
    async saveStation(actor: Actor | null, raw: unknown) {
      requireCatalogAccess(actor);
      const ctx = await requireOperationalContext(
        db,
        actor!,
        actor!.branchId ?? "",
      );
      if (ctx.role === "staff")
        invalid("Se requiere permiso de encargado.", "FORBIDDEN", 403);
      const a = actor!,
        input = parse(stationSchema, raw),
        id = input.id ?? randomUUID();
      return stationTransaction(() =>
        db.transaction(async (tx) => {
          const old = await claim(
            tx,
            a,
            "prep-station",
            input.requestId,
            fingerprint("prep-station", input),
            id,
          );
          if (old) {
            const [s] = await tx
              .select()
              .from(preparationStations)
              .where(
                and(
                  eq(preparationStations.id, old),
                  eq(preparationStations.branchId, ctx.branchId),
                ),
              );
            if (!s) notFound();
            return stationView(s);
          }
          const [location] = await tx
            .select()
            .from(locations)
            .where(
              and(
                eq(locations.id, input.consumptionLocationId),
                eq(locations.branchId, ctx.branchId),
                isNull(locations.archivedAt),
              ),
            )
            .for("share");
          if (!location)
            invalid("Elegí una ubicación activa de esta sucursal.");
          if (input.id) {
            const [s] = await tx
              .select()
              .from(preparationStations)
              .where(
                and(
                  eq(preparationStations.id, id),
                  eq(preparationStations.branchId, ctx.branchId),
                ),
              )
              .for("update");
            if (!s) notFound();
            if (s.revision !== input.revision)
              conflict("La estación cambió. Actualizá la configuración.");
            if (input.archived) {
              const [route] = await tx
                .select({ id: preparationRoutes.productId })
                .from(preparationRoutes)
                .where(eq(preparationRoutes.stationId, id))
                .limit(1);
              const [task] = await tx
                .select({ id: preparationTasks.id })
                .from(preparationTasks)
                .where(
                  and(
                    eq(preparationTasks.stationId, id),
                    inArray(preparationTasks.status, activeStates),
                  ),
                )
                .limit(1);
              if (route || task)
                conflict(
                  "Reasigná los productos y terminá las tareas activas antes de archivar.",
                );
            }
            const [saved] = await tx
              .update(preparationStations)
              .set({
                name: input.name,
                consumptionLocationId: input.consumptionLocationId,
                archivedAt: input.archived
                  ? (s.archivedAt ?? new Date())
                  : null,
                revision: s.revision + 1,
              })
              .where(
                and(
                  eq(preparationStations.id, id),
                  eq(preparationStations.branchId, ctx.branchId),
                ),
              )
              .returning();
            await audit(tx, a, "preparation-stations", id, "update", input);
            return stationView(saved);
          }
          if (input.revision || input.archived)
            invalid("Una estación nueva debe estar activa.");
          const [{ total }] = await tx
            .select({ total: count() })
            .from(preparationStations)
            .where(
              and(
                eq(preparationStations.branchId, ctx.branchId),
                isNull(preparationStations.archivedAt),
              ),
            );
          if (total >= 30) invalid("Se permiten hasta 30 estaciones activas.");
          const [saved] = await tx
            .insert(preparationStations)
            .values({
              id,
              branchId: ctx.branchId,
              name: input.name,
              consumptionLocationId: input.consumptionLocationId,
            })
            .returning();
          await audit(tx, a, "preparation-stations", id, "create", input);
          return stationView(saved);
        }),
      );
    },
    async routeProduct(actor: Actor | null, raw: unknown) {
      requireCatalogAccess(actor);
      const ctx = await requireOperationalContext(
        db,
        actor!,
        actor!.branchId ?? "",
      );
      if (ctx.role === "staff")
        invalid("Se requiere permiso de encargado.", "FORBIDDEN", 403);
      const a = actor!,
        input = parse(routeSchema, raw);
      return db.transaction(async (tx) => {
        const old = await claim(
          tx,
          a,
          "prep-route",
          input.requestId,
          fingerprint("prep-route", input),
          input.productId,
        );
        const [p] = await tx
          .select()
          .from(products)
          .where(eq(products.id, input.productId))
          .for("update");
        if (!p) notFound();
        const [route] = await tx
          .select()
          .from(preparationRoutes)
          .where(
            and(
              eq(preparationRoutes.productId, input.productId),
              eq(preparationRoutes.branchId, ctx.branchId),
            ),
          );
        if (old)
          return {
            productId: p.id,
            stationId: route?.stationId ?? null,
            revision: route?.revision ?? 0,
          };
        if (p.archivedAt && input.stationId !== null)
          invalid("Un producto archivado solo puede quedar sin estación.");
        if ((route?.revision ?? 0) !== input.revision)
          conflict("La asignación cambió. Actualizá antes de guardar.");
        if (input.stationId) {
          const [s] = await tx
            .select()
            .from(preparationStations)
            .where(eq(preparationStations.id, input.stationId))
            .for("share");
          if (!s || s.archivedAt || s.branchId !== ctx.branchId)
            invalid("Elegí una estación activa.");
        }
        const [saved] = await tx
          .insert(preparationRoutes)
          .values({
            productId: p.id,
            branchId: ctx.branchId,
            stationId: input.stationId,
            revision: input.revision + 1,
          })
          .onConflictDoUpdate({
            target: [preparationRoutes.branchId, preparationRoutes.productId],
            set: {
              stationId: input.stationId,
              revision: sql`${preparationRoutes.revision}+1`,
            },
          })
          .returning();
        await audit(tx, a, "preparation-routes", p.id, "route", input);
        return saved;
      });
    },
  };
}
