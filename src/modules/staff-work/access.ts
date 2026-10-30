import { and, eq, inArray, or, sql, type SQL } from "drizzle-orm";
import type { AppDb } from "@/db/client";
import type { Tx } from "@/db/types";
import { preparationTasks } from "@/db/preparation-schema";
import { productionOrders } from "@/db/production-order-schema";
import { centralPreparationLocation } from "@/modules/daily-operations/central-preparation";
import type { Actor } from "@/lib/access";
import { AppError } from "@/lib/errors";
import type { OperationalContext } from "@/modules/operations/types";
import {
  getPersonalStations,
  getStoreProfile,
  workplaceSchemaReady,
} from "@/modules/workplace/access";

type TaskAccess = Pick<
  typeof preparationTasks.$inferSelect,
  "stationId" | "assigneeId" | "status"
>;
const forbidden = () =>
  new AppError(
    "FORBIDDEN",
    "Solo podés preparar pedidos de tu puesto asignado o terminar los que ya comenzaste.",
    403,
  );

export async function personalPreparationScope(
  db: AppDb | Tx,
  actor: Actor,
  now = new Date(),
): Promise<SQL | undefined> {
  if (actor.accountKind === "store" || (await getStoreProfile(db, actor.id)))
    throw forbidden();
  if (actor.role !== "staff" || !(await workplaceSchemaReady(db)))
    return undefined;
  const stations = await getPersonalStations(db, actor, now);
  const ids = stations.flatMap((s) => (s.stationId ? [s.stationId] : []));
  return or(
    ids.length ? inArray(preparationTasks.stationId, ids) : sql`false`,
    and(
      eq(preparationTasks.assigneeId, actor.id),
      sql`${preparationTasks.startedAt} is not null`,
    ),
  );
}

export async function requirePreparationTaskAccess(
  db: AppDb | Tx,
  actor: Actor,
  task: TaskAccess,
  action: "view" | "start" | "ready" | "deliver" | "reassign",
  options: { replay?: boolean; now?: Date } = {},
) {
  if (action === "deliver") {
    await requireDeliveryAccess(db, {
      actorId: actor.id,
      branchId: actor.branchId!,
      role: actor.role,
      timeZone: actor.timeZone ?? "UTC",
      accountKind: actor.accountKind,
    });
    return;
  }
  if (actor.accountKind === "store" || (await getStoreProfile(db, actor.id)))
    throw forbidden();
  if (actor.role !== "staff" || !(await workplaceSchemaReady(db))) return;
  // Starting an order establishes personal responsibility. That responsibility
  // survives a changed station/window, so unfinished work is never stranded.
  const own = task.assigneeId === actor.id && task.status !== "pending";
  if (own && (action === "view" || action === "ready" || options.replay))
    return;
  if (action === "ready" || action === "reassign") throw forbidden();
  const stations = await getPersonalStations(
    db,
    actor,
    options.now ?? new Date(),
    { lock: action === "start" },
  );
  if (!task.stationId || !stations.some((s) => s.stationId === task.stationId))
    throw forbidden();
}

export async function requireDeliveryAccess(
  db: AppDb | Tx,
  ctx: OperationalContext,
) {
  if (ctx.role !== "staff" || !(await workplaceSchemaReady(db))) return;
  if (ctx.accountKind === "store" || (await getStoreProfile(db, ctx.actorId)))
    return;
  throw new AppError(
    "FORBIDDEN",
    "La entrega al cliente se registra desde el puesto del local.",
    403,
  );
}

/** Called before command replay as well as execution. No stock writes or task
 * synchronization here: executeCommand and the production domain own those. */
export async function requirePersonalProductionAccess(
  db: AppDb | Tx,
  ctx: OperationalContext,
  id: string,
) {
  if (ctx.role !== "staff" || !(await workplaceSchemaReady(db))) return;
  if (ctx.accountKind === "store" || (await getStoreProfile(db, ctx.actorId)))
    throw new AppError(
      "FORBIDDEN",
      "El puesto compartido no ejecuta producción personal.",
      403,
    );
  const depot = await centralPreparationLocation(db as Tx, ctx.branchId);
  const [order] = await db
    .select({
      assignedTo: productionOrders.assignedTo,
      locationId: productionOrders.locationId,
    })
    .from(productionOrders)
    .where(
      and(
        eq(productionOrders.id, id),
        eq(productionOrders.branchId, ctx.branchId),
      ),
    )
    .for("update");
  if (
    !depot ||
    !order ||
    order.assignedTo !== ctx.actorId ||
    order.locationId !== depot.id
  )
    throw new AppError(
      "FORBIDDEN",
      "Solo podés registrar la producción que tenés asignada en Depósito.",
      403,
    );
}
