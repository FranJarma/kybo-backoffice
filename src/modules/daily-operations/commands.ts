import { and, eq, inArray } from "drizzle-orm";
import type { AppDb } from "@/db/client";
import type { Actor } from "@/lib/access";
import { AppError } from "@/lib/errors";
import {
  dailyOperationTasks as tasks,
  dailyOperationEvents as events,
  dailyOperationDependencies as deps,
} from "@/db/daily-operation-schema";
import { productionOrders } from "@/db/production-order-schema";
import { recipeLines, recipeOptions } from "@/db/recipe-schema";
import { integer } from "../inventory/decimal";
import { lockStock } from "../inventory/locking";
import { readDailySuggestions } from "./read-suggestions";
import {
  centralPreparationLocation,
  currentPreparationRecipes,
} from "./central-preparation";
import { executeCommand } from "../operations/command";
import { requireAssignee } from "../production/access";
import {
  startProduction,
  reviseProduction,
  cancelPlannedProduction,
  planProduction,
} from "../production/planning";
import {
  dispatchTransferInTransaction,
  cancelTransferInTransaction,
  confirmTransferInTransaction,
} from "../transfers/service";
import { taskCommandSchema } from "./validation";
import { authorizeTaskCommand } from "./access";
import { syncDocumentTask } from "./document-adapters";
function conflict(message: string): never {
  throw new AppError("DAILY_CONFLICT", message, 409);
}
export async function runTaskCommand(
  db: AppDb,
  actor: Actor,
  taskId: string,
  raw: unknown,
) {
  const input = taskCommandSchema.parse(raw);
  return executeCommand(
    db,
    actor,
    actor.branchId ?? "",
    input,
    "daily-task",
    { taskId, ...input },
    async (tx, ctx, operationId) => {
      const task = await authorizeTaskCommand(tx, ctx, { taskId, ...input });
      if (task.revision !== input.expectedRevision)
        conflict("La tarea cambió. Actualizá antes de continuar.");
      if (["done", "cancelled", "superseded"].includes(task.state))
        conflict("La tarea ya está cerrada.");
      if (["start", "dispatch"].includes(input.action)) {
        if (!task.assignedTo)
          conflict("Asigná un responsable antes de comenzar.");
        await requireAssignee(tx, ctx.branchId, task.assignedTo);
        const dependencies = await tx
          .select()
          .from(deps)
          .where(eq(deps.taskId, taskId));
        if (dependencies.length) {
          const rows = await tx
            .select()
            .from(tasks)
            .where(
              inArray(
                tasks.id,
                dependencies.map((d) => d.dependsOnId),
              ),
            );
          if (rows.some((r) => r.state !== "done"))
            conflict("Primero completá las tareas previas.");
        }
      }
      if (input.action === "assign") {
        if (!input.assignedTo) conflict("Elegí una persona.");
        await requireAssignee(tx, ctx.branchId, input.assignedTo);
        if (task.kind === "production" && task.documentId) {
          const [o] = await tx
            .select()
            .from(productionOrders)
            .where(
              and(
                eq(productionOrders.id, task.documentId),
                eq(productionOrders.branchId, ctx.branchId),
              ),
            );
          if (!o || o.revision !== task.documentRevision)
            conflict("La orden cambió. Actualizá el tablero.");
          await reviseProduction(tx, ctx, operationId, o.id, {
            expectedRevision: o.revision,
            assignedTo: input.assignedTo,
            scheduledFor: (o.scheduledFor ?? new Date()).toISOString(),
            notes: o.notes ?? "",
            plannedQuantity: o.plannedQuantity,
            reason: "Asignación desde Operación del día",
          });
        }
        await tx
          .update(tasks)
          .set({ assignedTo: input.assignedTo })
          .where(eq(tasks.id, taskId));
      } else if (input.action === "confirm_production") {
        const depot = await centralPreparationLocation(tx, ctx.branchId);
        if (
          task.kind !== "production" ||
          task.documentId ||
          !task.itemId ||
          !task.quantity ||
          !depot ||
          task.locationId !== depot.id
        )
          conflict(
            "Actualizá la sugerencia: la preparación debe realizarse en Depósito.",
          );
        if (!task.assignedTo)
          conflict("Asigná un responsable antes de confirmar.");
        const recipe = (await currentPreparationRecipes(tx)).find(
          (p) => p.itemId === task.itemId,
        );
        if (
          !recipe ||
          integer(task.quantity) <= 0n ||
          integer(task.quantity) % integer(recipe.yieldQuantity) !== 0n
        )
          conflict(
            "La receta o el tamaño de la tanda cambió. Actualizá las tareas.",
          );
        const lines = await tx
          .select()
          .from(recipeLines)
          .where(eq(recipeLines.versionId, recipe.versionId));
        const options = lines.length
          ? await tx
              .select()
              .from(recipeOptions)
              .where(
                inArray(
                  recipeOptions.lineId,
                  lines.map((l) => l.id),
                ),
              )
          : [];
        const selections = lines.map((line) => {
          const choices = options.filter((o) => o.lineId === line.id);
          if (!line.optional && choices.length !== 1)
            conflict(
              "Esta receta requiere elegir ingredientes. Planificá la orden desde Producción.",
            );
          return {
            lineId: line.id,
            optionId: line.optional ? null : choices[0].id,
          };
        });
        // Use the same sorted stock locks as manual production planning and receipts.
        // Read current supply after acquiring them; planned output is not physical stock.
        await lockStock(tx, ctx, [
          { itemId: task.itemId, locationId: depot.id },
          ...options
            .filter((option) =>
              selections.some((s) => s.optionId === option.id),
            )
            .map((option) => ({ itemId: option.itemId, locationId: depot.id })),
        ]);
        const fresh = (await readDailySuggestions(tx, ctx)).find(
          (s) => s.needKey === task.needKey && s.kind === "production",
        );
        if (
          !fresh ||
          fresh.quantity !== task.quantity ||
          fresh.locationId !== depot.id
        )
          conflict(
            "La necesidad cambió por stock u órdenes nuevas. Actualizá las tareas antes de confirmar.",
          );
        const order = await planProduction(
          tx,
          ctx,
          operationId,
          {
            recipeVersionId: recipe.versionId,
            locationId: depot.id,
            plannedQuantity: task.quantity,
            selections,
          },
          {
            assignedTo: task.assignedTo,
            scheduledFor: (task.dueAt ?? new Date()).toISOString(),
            notes: task.reason || task.title,
          },
        );
        await tx
          .update(tasks)
          .set({
            documentId: order.id,
            documentRevision: order.revision,
            state: "pending",
            // The real order now covers this quantity. A later shortage needs a new suggestion.
            needKey: null,
          })
          .where(eq(tasks.id, taskId));
      } else if (input.action === "confirm_transfer") {
        if (
          task.kind !== "transfer" ||
          task.documentId ||
          !task.originLocationId ||
          !task.locationId ||
          !task.itemId ||
          !task.quantity
        )
          conflict("La sugerencia ya cambió o no permite crear un traslado.");
        const transfer = await confirmTransferInTransaction(
          tx,
          ctx,
          operationId,
          {
            requestId: input.requestId,
            originLocationId: task.originLocationId,
            destinationLocationId: task.locationId,
            reason: task.reason || task.title,
            demands: [{ itemId: task.itemId, quantity: task.quantity }],
          },
        );
        await tx
          .update(tasks)
          .set({
            documentId: transfer.id,
            documentRevision: transfer.revision,
            state: "pending",
          })
          .where(eq(tasks.id, taskId));
      } else if (input.action === "report_blocked") {
        if (!input.reason) conflict("Contanos qué impide continuar.");
        await tx
          .update(tasks)
          .set({ state: "blocked", reason: input.reason })
          .where(eq(tasks.id, taskId));
      } else if (input.action === "cancel") {
        if (!input.reason) conflict("Indicá el motivo de cancelación.");
        if (task.documentId) {
          if (task.kind === "production")
            await cancelPlannedProduction(
              tx,
              ctx,
              operationId,
              task.documentId,
              { expectedRevision: task.documentRevision, reason: input.reason },
            );
          else if (task.kind === "transfer")
            await cancelTransferInTransaction(
              tx,
              ctx,
              operationId,
              task.documentId,
              {
                requestId: input.requestId,
                expectedRevision: task.documentRevision ?? undefined,
              },
            );
        }
        await tx
          .update(tasks)
          .set({ state: "cancelled", reason: input.reason })
          .where(eq(tasks.id, taskId));
      } else {
        if (!task.documentId)
          conflict("Primero confirmá la orden en el módulo correspondiente.");
        if (input.action === "start" && task.kind === "production")
          await startProduction(tx, ctx, operationId, task.documentId, {
            expectedRevision: task.documentRevision,
          });
        else if (input.action === "dispatch" && task.kind === "transfer")
          await dispatchTransferInTransaction(
            tx,
            ctx,
            operationId,
            task.documentId,
            {
              requestId: input.requestId,
              expectedRevision: task.documentRevision ?? undefined,
            },
          );
        else
          conflict(
            "Esta acción se realiza desde el documento correspondiente.",
          );
      }
      // Advance once for the user command; document synchronization may add its own audited revision.
      await tx
        .update(tasks)
        .set({ revision: task.revision + 1, updatedAt: new Date() })
        .where(eq(tasks.id, taskId));
      await tx.insert(events).values({
        branchId: ctx.branchId,
        taskId,
        revision: task.revision + 1,
        action: input.action,
        actorId: ctx.actorId,
        reason: input.reason ?? "",
      });
      if (
        task.documentId &&
        (task.kind === "production" || task.kind === "transfer")
      )
        await syncDocumentTask(tx, ctx, {
          type: task.kind,
          id: task.documentId,
        });
      const [saved] = await tx.select().from(tasks).where(eq(tasks.id, taskId));
      return { taskId, revision: saved.revision };
    },
  );
}
