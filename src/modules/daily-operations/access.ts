import { and, eq } from "drizzle-orm";
import type { Tx } from "@/db/types";
import { dailyOperationTasks as tasks } from "@/db/daily-operation-schema";
import { productionOrders } from "@/db/production-order-schema";
import type { OperationalContext } from "../operations/types";
import { AppError } from "@/lib/errors";
export async function authorizeTaskCommand(
  tx: Tx,
  ctx: OperationalContext,
  payload: unknown,
) {
  const input = payload as { taskId?: string; action?: string };
  if (!input.taskId) throw new AppError("VALIDATION", "Falta la tarea.", 400);
  const [task] = await tx
    .select()
    .from(tasks)
    .where(and(eq(tasks.id, input.taskId), eq(tasks.branchId, ctx.branchId)))
    .for("update");
  if (!task)
    throw new AppError(
      "NOT_FOUND",
      "La tarea no pertenece a esta sucursal.",
      404,
    );
  if (ctx.role === "staff") {
    if (
      !["start", "report_blocked", "dispatch"].includes(input.action ?? "") ||
      task.assignedTo !== ctx.actorId
    )
      throw new AppError(
        "FORBIDDEN",
        "Solo podés ejecutar tus tareas asignadas.",
        403,
      );
    if (task.kind === "production" && task.documentId) {
      const [order] = await tx
        .select()
        .from(productionOrders)
        .where(
          and(
            eq(productionOrders.id, task.documentId),
            eq(productionOrders.branchId, ctx.branchId),
          ),
        )
        .for("update");
      if (!order || order.assignedTo !== ctx.actorId)
        throw new AppError(
          "FORBIDDEN",
          "La producción fue reasignada. Actualizá tus tareas.",
          403,
        );
    }
  }
  return task;
}
