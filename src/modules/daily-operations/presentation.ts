import type { TaskRow } from "./types";
export function taskIsClosed(task: Pick<TaskRow, "state">) {
  return ["done", "cancelled", "superseded"].includes(task.state);
}
export function taskDateLabel(task: TaskRow, timeZone: string) {
  if (!task.dueAt) return null;
  if (!taskIsClosed(task)) return taskDueDate(task.dueAt, timeZone);
  return `Fecha prevista: ${new Intl.DateTimeFormat("es-AR", { timeZone, day: "numeric", month: "short", year: "numeric" }).format(new Date(task.dueAt))}`;
}
export function taskNextStep(task: TaskRow, canManage: boolean) {
  if (taskIsClosed(task)) return "Consultar resultado";
  if (task.assigneeUnavailable)
    return canManage ? "Reasignar responsable" : "Avisar al encargado";
  if (task.state === "blocked") return "Revisar impedimento";
  if (task.state === "awaiting_review") return "Revisar resultado";
  if (!task.assignedTo)
    return canManage ? "Asignar responsable" : "Esperar asignación";
  if (task.kind === "purchase")
    return task.documentId
      ? "Seguir pedido en Compras"
      : task.quantity
        ? "Preparar pedido de compra"
        : "Estimar consumo del insumo";
  if (task.kind === "production")
    return !task.documentId
      ? canManage
        ? "Confirmar preparación en Depósito"
        : "Esperar confirmación del encargado"
      : task.state === "in_progress"
        ? "Registrar resultado de producción"
        : "Comenzar preparación";
  if (task.kind === "transfer")
    return !task.documentId
      ? canManage
        ? "Confirmar reposición"
        : "Esperar confirmación del encargado"
      : "Confirmar llegada a destino";
  return "Ver detalle del control";
}
export function taskAction(t: TaskRow) {
  if (t.kind === "purchase")
    return {
      href: t.documentId
        ? `/inventory/purchases?order=${t.documentId}`
        : t.itemId
          ? `/inventory/purchases?item=${t.itemId}`
          : "/inventory/purchases",
      label: t.documentId
        ? "Ver pedido"
        : t.quantity
          ? "Preparar pedido"
          : "Configurar insumo",
    };
  if (t.kind === "production")
    return { href: "/kitchen/production", label: "Abrir producción" };
  if (t.kind === "transfer")
    return { href: "/inventory/transfers", label: "Abrir traslados" };
  return null;
}
export function taskDueDate(
  dueAt: string | null,
  timeZone: string,
  now = new Date(),
) {
  if (!dueAt) return null;
  const calendar = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const due = calendar.format(new Date(dueAt)),
    today = calendar.format(now);
  if (due === today) return "Hoy";
  const label = new Intl.DateTimeFormat("es-AR", {
    timeZone,
    day: "numeric",
    month: "short",
  }).format(new Date(dueAt));
  return due < today ? `Pendiente desde el ${label}` : `Para el ${label}`;
}
