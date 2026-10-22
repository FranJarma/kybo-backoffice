import { and, asc, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import type { AppDb } from "@/db/client";
import type { Actor } from "@/lib/access";
import { branches } from "@/db/branch-schema";
import { locatorAssignments } from "@/db/pickup-schema";
import { saleOrders, sales } from "@/db/sales-schema";
import { user } from "@/db/auth-schema";
import { alias } from "drizzle-orm/pg-core";
import { requireOperationalContext } from "@/modules/branches/context";
import {
  audit,
  claim,
  conflict,
  fingerprint,
  invalid,
  notFound,
  type Tx,
} from "@/modules/inventory/service";
import { parse, salesAccess, uuid } from "@/modules/sales/validation";
import type { LocatorFleet, LocatorHistory } from "./types";

export async function assignLocator(
  tx: Tx,
  actor: Actor,
  orderId: string,
  number: number | null | undefined,
) {
  if (number == null) return;
  const [branch] = await tx
    .select({ count: branches.locatorCount })
    .from(branches)
    .where(eq(branches.id, actor.branchId!));
  if (!branch || number < 1 || number > branch.count)
    invalid("Elegí un localizador disponible de esta sucursal.");
  const [inserted] = await tx
    .insert(locatorAssignments)
    .values({
      branchId: actor.branchId!,
      orderId,
      number,
      assignedBy: actor.id,
    })
    .onConflictDoNothing()
    .returning({ id: locatorAssignments.id });
  if (!inserted)
    conflict(
      "Ese localizador ya está ocupado. No se guardó ningún cambio. Elegí otro o continuá sin localizador.",
    );
}

export async function locatorHistory(
  db: AppDb | Tx,
  orderId: string,
): Promise<LocatorHistory[]> {
  const returnedUser = alias(user, "locator_return_user");
  const rows = await db
    .select({
      assignment: locatorAssignments,
      assignedName: user.name,
      returnedName: returnedUser.name,
    })
    .from(locatorAssignments)
    .innerJoin(user, eq(user.id, locatorAssignments.assignedBy))
    .leftJoin(returnedUser, eq(returnedUser.id, locatorAssignments.returnedBy))
    .where(eq(locatorAssignments.orderId, orderId))
    .orderBy(asc(locatorAssignments.assignedAt), asc(locatorAssignments.id));
  return rows.map(({ assignment: a, assignedName, returnedName }) => ({
    id: a.id,
    number: a.number,
    assignedBy: assignedName,
    assignedAt: a.assignedAt.toISOString(),
    returnedBy: returnedName,
    returnedAt: a.returnedAt?.toISOString() ?? null,
  }));
}

const changeSchema = z
  .object({
    requestId: uuid,
    expectedAssignmentId: uuid.nullable(),
    number: z.number().int().min(1).max(999).nullable(),
    returnConfirmed: z.boolean(),
  })
  .strict();

export function createPickupService(db: AppDb) {
  return {
    async fleet(actor: Actor | null): Promise<LocatorFleet> {
      salesAccess(actor);
      const ctx = await requireOperationalContext(
        db,
        actor,
        actor.branchId ?? "",
      );
      const [branch] = await db
        .select()
        .from(branches)
        .where(eq(branches.id, ctx.branchId));
      const rows = await db
        .select({
          assignment: locatorAssignments,
          saleId: sales.id,
          number: sales.number,
          sequence: saleOrders.sequence,
          status: sales.status,
        })
        .from(locatorAssignments)
        .innerJoin(saleOrders, eq(saleOrders.id, locatorAssignments.orderId))
        .innerJoin(sales, eq(sales.id, saleOrders.saleId))
        .where(
          and(
            eq(locatorAssignments.branchId, ctx.branchId),
            isNull(locatorAssignments.returnedAt),
          ),
        )
        .orderBy(asc(locatorAssignments.number));
      return {
        count: branch.locatorCount,
        publicPath: `/pickup/${branch.publicQueueKey}`,
        occupied: rows.map(
          ({ assignment: a, saleId, number, sequence, status }) => ({
            id: a.id,
            number: a.number,
            orderId: a.orderId,
            saleId,
            label: `${number}.${sequence}`,
            cancelled: status === "cancelled",
          }),
        ),
      };
    },
    async history(actor: Actor | null, orderId: string) {
      salesAccess(actor);
      parse(uuid, orderId);
      const ctx = await requireOperationalContext(
        db,
        actor,
        actor.branchId ?? "",
      );
      const [order] = await db
        .select({ id: saleOrders.id })
        .from(saleOrders)
        .where(
          and(
            eq(saleOrders.id, orderId),
            eq(saleOrders.branchId, ctx.branchId),
          ),
        );
      if (!order) notFound();
      return locatorHistory(db, orderId);
    },
    async change(actor: Actor | null, orderId: string, raw: unknown) {
      salesAccess(actor);
      parse(uuid, orderId);
      const input = parse(changeSchema, raw);
      return db.transaction(async (tx) => {
        const ctx = await requireOperationalContext(
          tx,
          actor,
          actor.branchId ?? "",
        );
        const old = await claim(
          tx,
          actor,
          "pickup-change",
          input.requestId,
          fingerprint("pickup-change", { orderId, ...input }),
          orderId,
        );
        const [identity] = await tx
          .select({ saleId: saleOrders.saleId })
          .from(saleOrders)
          .where(
            and(
              eq(saleOrders.id, orderId),
              eq(saleOrders.branchId, ctx.branchId),
            ),
          );
        if (!identity) notFound();
        const [sale] = await tx
          .select({ status: sales.status })
          .from(sales)
          .where(eq(sales.id, identity.saleId))
          .for("update");
        await tx
          .select({ id: saleOrders.id })
          .from(saleOrders)
          .where(eq(saleOrders.id, orderId))
          .for("update");
        if (old) return locatorHistory(tx, orderId);
        const [current] = await tx
          .select()
          .from(locatorAssignments)
          .where(
            and(
              eq(locatorAssignments.orderId, orderId),
              isNull(locatorAssignments.returnedAt),
            ),
          )
          .for("update");
        if ((current?.id ?? null) !== input.expectedAssignmentId)
          conflict("La asignación cambió. Actualizá antes de confirmar.");
        if (current?.number === input.number)
          return locatorHistory(tx, orderId);
        if (input.number !== null && sale.status === "cancelled")
          conflict("No se puede asignar un equipo a un pedido anulado.");
        if (current) {
          if (!input.returnConfirmed)
            invalid(
              "Confirmá que recibiste físicamente el localizador anterior.",
            );
          await tx
            .update(locatorAssignments)
            .set({ returnedBy: actor.id, returnedAt: new Date() })
            .where(eq(locatorAssignments.id, current.id));
        }
        await assignLocator(tx, actor, orderId, input.number);
        await audit(tx, actor, "sale-orders", orderId, "locator-change", input);
        return locatorHistory(tx, orderId);
      });
    },
  };
}
