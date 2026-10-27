import type { TaskRow } from "./types";
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
