import { and, eq } from "drizzle-orm";
import { z } from "zod";
import type { AppDb } from "@/db/client";
import type { Tx } from "@/db/types";
import type { Actor } from "@/lib/access";
import { AppError } from "@/lib/errors";
import { locations, branches } from "@/db/branch-schema";
import {
  stockTransfers,
  transferAllocations,
  transferResolutions,
} from "@/db/transfer-schema";
import { stockDocuments } from "@/db/inventory-document-schema";
import { stockReservations } from "@/db/reservation-schema";
import { executeCommand } from "../operations/command";
import { reserveStock, settleReservation } from "../inventory/reservations";
import { postMovement } from "../inventory/ledger";
import { lockStock } from "../inventory/locking";
import { integer, six } from "../inventory/decimal";
import type { CommandMeta, OperationalContext } from "../operations/types";
import { transferPortion } from "./value";
function invalid(message: string): never {
  throw new AppError("TRANSFER_CONFLICT", message, 409);
}
const confirmSchema = z
  .object({
    requestId: z.uuid(),
    originLocationId: z.uuid(),
    destinationLocationId: z.uuid(),
    reason: z.string().trim().min(1).max(2000),
    demands: z
      .array(z.object({ itemId: z.uuid(), quantity: z.string() }).strict())
      .min(1)
      .max(100),
  })
  .strict();
const manager = (ctx: OperationalContext) => {
  if (ctx.role === "staff")
    throw new AppError("FORBIDDEN", "Se requiere permiso de encargado.", 403);
};
async function lockTransfer(
  tx: Tx,
  ctx: OperationalContext,
  id: string,
  side: "origin" | "destination",
  revision?: number,
) {
  const [transfer] = await tx
    .select()
    .from(stockTransfers)
    .where(eq(stockTransfers.id, id))
    .for("update");
  if (
    !transfer ||
    (side === "origin"
      ? transfer.originBranchId
      : transfer.destinationBranchId) !== ctx.branchId
  )
    invalid("El traslado no corresponde a esta sucursal.");
  if (revision !== undefined && revision !== transfer.revision)
    invalid("El traslado cambió. Actualizalo.");
  return transfer;
}
export function createTransferService(db: AppDb) {
  return {
    async cancel(
      actor: Actor,
      branchId: string,
      id: string,
      meta: CommandMeta,
    ) {
      return executeCommand(
        db,
        actor,
        branchId,
        meta,
        "transfer-cancel",
        { id, ...meta },
        async (tx, ctx, operationId) => {
          manager(ctx);
          const transfer = await lockTransfer(
            tx,
            ctx,
            id,
            "origin",
            meta.expectedRevision,
          );
          if (transfer.state !== "confirmed")
            invalid("Solo puede anularse un traslado antes del despacho.");
          const rows = await tx
            .select()
            .from(transferAllocations)
            .where(eq(transferAllocations.transferId, id));
          const [origin] = await tx
            .select({ reservationId: stockReservations.id })
            .from(stockDocuments)
            .innerJoin(
              stockReservations,
              eq(stockReservations.documentId, stockDocuments.id),
            )
            .where(
              and(
                eq(stockDocuments.transferId, id),
                eq(stockDocuments.branchId, ctx.branchId),
              ),
            );
          if (!origin) invalid("Falta la reserva del traslado.");
          await settleReservation(tx, ctx, {
            operationId,
            reservationId: origin.reservationId,
            consume: [],
            release: rows.map((r) => ({
              itemId: r.itemId,
              lotId: r.lotId,
              locationId: transfer.originLocationId,
              quantity: r.quantity,
            })),
          });
          await tx
            .update(stockTransfers)
            .set({ state: "cancelled", revision: transfer.revision + 1 })
            .where(eq(stockTransfers.id, id));
          return { id, revision: transfer.revision + 1 };
        },
      );
    },
    async resolveDifference(
      actor: Actor,
      branchId: string,
      id: string,
      raw: unknown,
    ) {
      const input = z
        .object({
          requestId: z.uuid(),
          expectedRevision: z.number().int().positive(),
          allocationId: z.uuid(),
          kind: z.enum(["loss", "return"]),
          quantity: z.string().regex(/^\d{1,12}\.\d{6}$/),
          reason: z.string().trim().min(1).max(2000),
        })
        .strict()
        .parse(raw);
      return executeCommand(
        db,
        actor,
        branchId,
        input,
        "transfer-resolve",
        { id, ...input },
        async (tx, ctx, operationId) => {
          manager(ctx);
          const transfer = await lockTransfer(
            tx,
            ctx,
            id,
            "origin",
            input.expectedRevision,
          );
          if (transfer.state !== "in_transit")
            invalid("Solo se resuelve una diferencia que sigue en tránsito.");
          const rows = await tx
            .select()
            .from(transferAllocations)
            .where(eq(transferAllocations.transferId, id))
            .orderBy(transferAllocations.id)
            .for("update");
          const row = rows.find((r) => r.id === input.allocationId);
          if (!row) invalid("El lote no pertenece al traslado.");
          const q = integer(input.quantity);
          const value = transferPortion(
            integer(row.quantity),
            row.dispatchValue === null ? null : integer(row.dispatchValue),
            integer(row.received) + integer(row.resolved),
            integer(row.settledValue),
            q,
          );
          if (input.kind === "return") {
            const [document] = await tx
              .insert(stockDocuments)
              .values({
                branchId: ctx.branchId,
                kind: "transfer",
                transferId: id,
              })
              .returning();
            await postMovement(tx, ctx, {
              operationId,
              documentId: document.id,
              action: "transfer",
              reason: input.reason,
              legs: [
                {
                  itemId: row.itemId,
                  lotId: row.lotId,
                  locationId: transfer.originLocationId,
                  quantity: input.quantity,
                  direction: "in",
                  incomingValue: value === null ? null : six(value),
                },
              ],
            });
          }
          await tx
            .insert(transferResolutions)
            .values({
              operationId,
              allocationId: row.id,
              kind: input.kind,
              quantity: input.quantity,
              value: value === null ? null : six(value),
              reason: input.reason,
            });
          row.resolved = six(integer(row.resolved) + q);
          row.settledValue = six(integer(row.settledValue) + (value ?? 0n));
          await tx
            .update(transferAllocations)
            .set({ resolved: row.resolved, settledValue: row.settledValue })
            .where(eq(transferAllocations.id, row.id));
          const done = rows.every(
            (r) =>
              integer(r.quantity) === integer(r.received) + integer(r.resolved),
          );
          await tx
            .update(stockTransfers)
            .set({
              state: done ? "resolved" : "in_transit",
              revision: transfer.revision + 1,
            })
            .where(eq(stockTransfers.id, id));
          return { id, revision: transfer.revision + 1 };
        },
      );
    },
    async confirm(actor: Actor, branchId: string, raw: unknown) {
      const input = confirmSchema.parse(raw);
      return executeCommand(
        db,
        actor,
        branchId,
        input,
        "transfer-confirm",
        input,
        async (tx, ctx, operationId) => {
          manager(ctx);
          const [destination] = await tx
            .select()
            .from(locations)
            .where(eq(locations.id, input.destinationLocationId))
            .for("share");
          if (
            !destination ||
            destination.archivedAt ||
            destination.id === input.originLocationId
          )
            invalid("Elegí otra ubicación de destino activa.");
          const [destinationBranch] = await tx
            .select()
            .from(branches)
            .where(eq(branches.id, destination.branchId))
            .for("share");
          if (!destinationBranch || destinationBranch.archivedAt)
            invalid("La sucursal de destino no está activa.");
          const [transfer] = await tx
            .insert(stockTransfers)
            .values({
              originBranchId: ctx.branchId,
              destinationBranchId: destination.branchId,
              originLocationId: input.originLocationId,
              destinationLocationId: destination.id,
              reason: input.reason,
            })
            .returning();
          const [document] = await tx
            .insert(stockDocuments)
            .values({
              branchId: ctx.branchId,
              kind: "transfer",
              transferId: transfer.id,
            })
            .returning();
          const reservation = await reserveStock(tx, ctx, {
            operationId,
            documentId: document.id,
            demands: input.demands.map((d) => ({
              ...d,
              locationId: input.originLocationId,
            })),
          });
          await tx
            .insert(transferAllocations)
            .values(
              reservation.allocations.map((a) => ({
                transferId: transfer.id,
                itemId: a.itemId,
                lotId: a.lotId,
                quantity: a.quantity,
              })),
            );
          return { id: transfer.id, revision: transfer.revision };
        },
      );
    },
    async dispatch(
      actor: Actor,
      branchId: string,
      id: string,
      meta: CommandMeta,
    ) {
      return executeCommand(
        db,
        actor,
        branchId,
        meta,
        "transfer-dispatch",
        { id, ...meta },
        async (tx, ctx, operationId) => {
          manager(ctx);
          const transfer = await lockTransfer(
            tx,
            ctx,
            id,
            "origin",
            meta.expectedRevision,
          );
          if (transfer.state !== "confirmed")
            invalid("El traslado ya fue despachado o anulado.");
          const rows = await tx
            .select()
            .from(transferAllocations)
            .where(eq(transferAllocations.transferId, id))
            .orderBy(transferAllocations.itemId, transferAllocations.lotId)
            .for("update");
          await lockStock(
            tx,
            ctx,
            rows.map((r) => ({
              itemId: r.itemId,
              locationId: transfer.originLocationId,
            })),
            true,
          );
          const [origin] = await tx
            .select({
              documentId: stockDocuments.id,
              reservationId: stockReservations.id,
            })
            .from(stockDocuments)
            .innerJoin(
              stockReservations,
              eq(stockReservations.documentId, stockDocuments.id),
            )
            .where(
              and(
                eq(stockDocuments.transferId, id),
                eq(stockDocuments.branchId, ctx.branchId),
              ),
            );
          if (!origin) invalid("Falta la reserva del traslado.");
          const allocations = rows.map((r) => ({
            itemId: r.itemId,
            lotId: r.lotId,
            locationId: transfer.originLocationId,
            quantity: r.quantity,
          }));
          await settleReservation(tx, ctx, {
            reservationId: origin.reservationId,
            consume: allocations,
            release: [],
            operationId,
          });
          const sameBranch =
            transfer.originBranchId === transfer.destinationBranchId;
          for (const [index, row] of rows.entries()) {
            const [movement] = await postMovement(tx, ctx, {
              operationId,
              documentId: origin.documentId,
              action: "transfer",
              reason: transfer.reason,
              legs: [
                {
                  ...allocations[index],
                  direction: "out",
                  incomingValue: null,
                },
              ],
            });
            const dispatchValue =
              movement.value === null ? null : six(-integer(movement.value));
            if (sameBranch)
              await postMovement(tx, ctx, {
                operationId,
                documentId: origin.documentId,
                action: "transfer",
                reason: transfer.reason,
                legs: [
                  {
                    ...allocations[index],
                    locationId: transfer.destinationLocationId,
                    direction: "in",
                    incomingValue: dispatchValue,
                  },
                ],
              });
            await tx
              .update(transferAllocations)
              .set({
                dispatchValue,
                received: sameBranch ? row.quantity : "0.000000",
                settledValue: sameBranch
                  ? (dispatchValue ?? "0.000000")
                  : "0.000000",
              })
              .where(eq(transferAllocations.id, row.id));
          }
          await tx
            .update(stockTransfers)
            .set({
              state: sameBranch ? "received" : "in_transit",
              revision: transfer.revision + 1,
            })
            .where(eq(stockTransfers.id, id));
          return { id, revision: transfer.revision + 1 };
        },
      );
    },
    async receive(actor: Actor, branchId: string, id: string, raw: unknown) {
      const input = z
        .object({
          requestId: z.uuid(),
          expectedRevision: z.number().int().positive(),
          lines: z
            .array(
              z
                .object({
                  allocationId: z.uuid(),
                  quantity: z.string().regex(/^\d{1,12}\.\d{6}$/),
                })
                .strict(),
            )
            .min(1)
            .max(100),
        })
        .strict()
        .parse(raw);
      if (
        new Set(input.lines.map((l) => l.allocationId)).size !==
        input.lines.length
      )
        invalid("No repitas lotes en la recepción.");
      return executeCommand(
        db,
        actor,
        branchId,
        input,
        "transfer-receive",
        { id, ...input },
        async (tx, ctx, operationId) => {
          manager(ctx);
          const transfer = await lockTransfer(
            tx,
            ctx,
            id,
            "destination",
            input.expectedRevision,
          );
          if (transfer.state !== "in_transit")
            invalid("No hay tránsito pendiente para recibir.");
          const [document] = await tx
            .insert(stockDocuments)
            .values({
              branchId: ctx.branchId,
              kind: "transfer",
              transferId: id,
            })
            .returning();
          const rows = await tx
            .select()
            .from(transferAllocations)
            .where(eq(transferAllocations.transferId, id))
            .orderBy(transferAllocations.itemId, transferAllocations.lotId)
            .for("update");
          await lockStock(
            tx,
            ctx,
            rows.map((r) => ({
              itemId: r.itemId,
              locationId: transfer.destinationLocationId,
            })),
            true,
          );
          for (const line of [...input.lines].sort((a, b) =>
            a.allocationId.localeCompare(b.allocationId),
          )) {
            const row = rows.find((r) => r.id === line.allocationId);
            if (!row) invalid("El lote no pertenece a este traslado.");
            const q = integer(line.quantity);
            const value = transferPortion(
              integer(row.quantity),
              row.dispatchValue === null ? null : integer(row.dispatchValue),
              integer(row.received) + integer(row.resolved),
              integer(row.settledValue),
              q,
            );
            await postMovement(tx, ctx, {
              operationId,
              documentId: document.id,
              action: "transfer",
              reason: transfer.reason,
              legs: [
                {
                  itemId: row.itemId,
                  lotId: row.lotId,
                  locationId: transfer.destinationLocationId,
                  quantity: line.quantity,
                  direction: "in",
                  incomingValue: value === null ? null : six(value),
                },
              ],
            });
            row.received = six(integer(row.received) + q);
            row.settledValue = six(integer(row.settledValue) + (value ?? 0n));
            await tx
              .update(transferAllocations)
              .set({ received: row.received, settledValue: row.settledValue })
              .where(eq(transferAllocations.id, row.id));
          }
          const done = rows.every(
            (r) =>
              integer(r.quantity) === integer(r.received) + integer(r.resolved),
          );
          await tx
            .update(stockTransfers)
            .set({
              state: done ? "received" : "in_transit",
              revision: transfer.revision + 1,
            })
            .where(eq(stockTransfers.id, id));
          return { id, revision: transfer.revision + 1 };
        },
      );
    },
  };
}
