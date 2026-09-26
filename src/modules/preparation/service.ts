import { and, asc, count, desc, eq, inArray, isNull } from "drizzle-orm";
import { z } from "zod";
import type { AppDb } from "@/db/client";
import { requireCatalogAccess, type Actor } from "@/lib/access";
import { sales, saleOrders } from "@/db/sales-schema";
import { user, operationalUsers } from "@/db/auth-schema";
import {
  preparationTasks,
  preparationEvents,
  preparationStations,
} from "@/db/preparation-schema";
import {
  audit,
  claim,
  fingerprint,
  conflict,
  invalid,
  notFound,
  businessDate,
} from "@/modules/inventory/service";
import { salesAccess, parse, uuid } from "@/modules/sales/validation";
import { actionSchema, listSchema } from "./validation";
import {
  activeStates,
  type PrepList,
  type PrepMetrics,
  type Timing,
  type PrepStatus,
} from "./types";
import { taskDetail, taskViews, stationView, iso } from "./queries";
import { orderTiming } from "./timing";

export function createPreparationService(db: AppDb) {
  return {
    async act(actor: Actor | null, id: string, raw: unknown) {
      salesAccess(actor);
      parse(uuid, id);
      const input = parse(actionSchema, raw);
      if (input.action === "reassign") {
        requireCatalogAccess(actor);
        if (!input.assigneeId || !input.reason)
          invalid("Elegí responsable e indicá el motivo de la transferencia.");
      } else if (input.assigneeId || input.reason)
        invalid("Esta acción no admite responsable ni motivo.");
      return db.transaction(async (tx) => {
        const old = await claim(
          tx,
          actor,
          "prep-action",
          input.requestId,
          fingerprint("prep-action", { id, ...input }),
          id,
        );
        const [identity] = await tx
          .select({ saleId: saleOrders.saleId })
          .from(preparationTasks)
          .innerJoin(saleOrders, eq(saleOrders.id, preparationTasks.orderId))
          .where(eq(preparationTasks.id, id));
        if (!identity) notFound();
        // Same lock order as sale cancellation: sale first, then its task(s).
        const [sale] = await tx
          .select({ status: sales.status })
          .from(sales)
          .where(eq(sales.id, identity.saleId))
          .for("update");
        const [task] = await tx
          .select()
          .from(preparationTasks)
          .where(eq(preparationTasks.id, id))
          .for("update");
        if (!sale || !task) notFound();
        if (old) return taskDetail(tx, id);
        if (sale.status === "cancelled" || task.status === "cancelled")
          conflict("La venta fue anulada. Actualizá la cola.");
        if (task.revision !== input.revision)
          conflict("Otra persona actualizó esta tarea. Actualizá la cola.");
        const now = new Date();
        const change: Partial<typeof preparationTasks.$inferInsert> = {
          revision: task.revision + 1,
        };
        if (input.action === "start") {
          if (task.status !== "pending") conflict("Esta tarea ya fue tomada.");
          Object.assign(change, {
            status: "preparing",
            assigneeId: actor.id,
            startedAt: now,
          });
        } else if (input.action === "ready") {
          if (task.status !== "preparing")
            conflict("Solo podés finalizar una tarea en preparación.");
          if (task.assigneeId !== actor.id)
            invalid(
              "Solo la persona responsable puede marcarla lista. Un encargado puede transferirla.",
              "FORBIDDEN",
              403,
            );
          Object.assign(change, { status: "ready", readyAt: now });
        } else if (input.action === "deliver") {
          if (task.status !== "ready")
            conflict("Marcá la preparación como lista antes de entregar.");
          Object.assign(change, { status: "delivered", deliveredAt: now });
        } else {
          if (task.status !== "preparing")
            conflict("Solo se transfiere una tarea en preparación.");
          if (task.assigneeId === input.assigneeId)
            invalid("Elegí otra persona para transferir la tarea.");
          const [person] = await tx
            .select({ id: operationalUsers.userId })
            .from(operationalUsers)
            .where(
              and(
                eq(operationalUsers.userId, input.assigneeId!),
                eq(operationalUsers.disabled, false),
              ),
            )
            .for("share");
          if (!person)
            invalid("El responsable debe ser un usuario operativo habilitado.");
          change.assigneeId = person.id;
        }
        await tx
          .update(preparationTasks)
          .set(change)
          .where(eq(preparationTasks.id, id));
        await tx
          .insert(preparationEvents)
          .values({
            taskId: id,
            revision: task.revision + 1,
            action: input.action,
            actorId: actor.id,
            assigneeId: change.assigneeId ?? task.assigneeId,
            reason: input.reason || null,
            createdAt: now,
          });
        await audit(tx, actor, "preparation-tasks", id, input.action, input);
        return taskDetail(tx, id);
      });
    },
    async get(actor: Actor | null, id: string) {
      salesAccess(actor);
      parse(uuid, id);
      return db.transaction((tx) => taskDetail(tx, id), {
        isolationLevel: "repeatable read",
        accessMode: "read only",
      });
    },
    async list(actor: Actor | null, raw: unknown = {}): Promise<PrepList> {
      salesAccess(actor);
      const input = parse(listSchema, raw);
      return db.transaction(
        async (tx) => {
          const where = and(
            inArray(
              preparationTasks.status,
              input.scope === "active"
                ? activeStates
                : ["delivered", "cancelled"],
            ),
            input.stationId
              ? input.stationId === "general"
                ? isNull(preparationTasks.stationId)
                : eq(preparationTasks.stationId, input.stationId)
              : undefined,
            input.mine ? eq(preparationTasks.assigneeId, actor.id) : undefined,
            input.origin ? eq(sales.origin, input.origin) : undefined,
            input.saleId ? eq(sales.id, input.saleId) : undefined,
            input.scope === "history"
              ? eq(sales.businessDate, input.date ?? businessDate(new Date()))
              : undefined,
          );
          const grouped = await tx
            .select({ status: preparationTasks.status, total: count() })
            .from(preparationTasks)
            .innerJoin(saleOrders, eq(saleOrders.id, preparationTasks.orderId))
            .innerJoin(sales, eq(sales.id, saleOrders.saleId))
            .where(where)
            .groupBy(preparationTasks.status);
          const counts: PrepList["counts"] = {
            pending: 0,
            preparing: 0,
            ready: 0,
            delivered: 0,
            cancelled: 0,
          };
          for (const g of grouped) counts[g.status as PrepStatus] = g.total;
          const ids = await tx
            .select({ id: preparationTasks.id })
            .from(preparationTasks)
            .innerJoin(saleOrders, eq(saleOrders.id, preparationTasks.orderId))
            .innerJoin(sales, eq(sales.id, saleOrders.saleId))
            .where(where)
            .orderBy(
              input.scope === "active"
                ? asc(preparationTasks.enqueuedAt)
                : desc(preparationTasks.enqueuedAt),
              asc(preparationTasks.id),
            )
            .limit(30)
            .offset(input.offset);
          const stations = await tx
            .select()
            .from(preparationStations)
            .orderBy(asc(preparationStations.name));
          return {
            rows: await taskViews(
              tx,
              ids.map((r) => r.id),
            ),
            total: Object.values(counts).reduce((a, b) => a + b, 0),
            counts,
            offset: input.offset,
            stations: stations.map(stationView),
            serverNow: new Date().toISOString(),
          };
        },
        { isolationLevel: "repeatable read", accessMode: "read only" },
      );
    },
    async people(actor: Actor | null) {
      requireCatalogAccess(actor);
      return db
        .select({ id: user.id, name: user.name })
        .from(user)
        .innerJoin(
          operationalUsers,
          and(
            eq(operationalUsers.userId, user.id),
            eq(operationalUsers.disabled, false),
          ),
        )
        .orderBy(asc(user.name), asc(user.id))
        .limit(100);
    },
    async metrics(actor: Actor | null, date: string): Promise<PrepMetrics> {
      requireCatalogAccess(actor);
      parse(z.iso.date(), date);
      return db.transaction(
        async (tx) => {
          const rows = await tx
            .select({
              task: preparationTasks,
              origin: sales.origin,
              saleStatus: sales.status,
            })
            .from(preparationTasks)
            .innerJoin(saleOrders, eq(saleOrders.id, preparationTasks.orderId))
            .innerJoin(sales, eq(sales.id, saleOrders.saleId))
            .where(eq(sales.businessDate, date));
          const groups = new Map<string, typeof rows>();
          for (const row of rows)
            if (row.saleStatus !== "cancelled")
              groups.set(row.task.orderId, [
                ...(groups.get(row.task.orderId) ?? []),
                row,
              ]);
          const byOrigin = { counter: 0, table: 0, delivery: 0 };
          const samples: Timing[] = [];
          for (const group of groups.values()) {
            byOrigin[group[0].origin as keyof typeof byOrigin]++;
            if (group.every((r) => r.task.status === "delivered"))
              samples.push(
                orderTiming(
                  group.map(({ task: t }) => ({
                    status: t.status,
                    enqueuedAt: t.enqueuedAt.toISOString(),
                    startedAt: iso(t.startedAt),
                    readyAt: iso(t.readyAt),
                    deliveredAt: iso(t.deliveredAt),
                  })),
                ),
              );
          }
          const averages: Timing = {
            waitSeconds: null,
            prepSeconds: null,
            handoffSeconds: null,
            totalSeconds: null,
          };
          const complete = samples.filter((t) =>
            Object.values(t).every((v) => v !== null),
          );
          if (complete.length)
            for (const key of Object.keys(averages) as (keyof Timing)[])
              averages[key] = Math.round(
                complete.reduce((sum, t) => sum + t[key]!, 0) / complete.length,
              );
          return {
            date,
            orders: groups.size,
            sample: complete.length,
            byOrigin,
            averages,
          };
        },
        { isolationLevel: "repeatable read", accessMode: "read only" },
      );
    },
  };
}
