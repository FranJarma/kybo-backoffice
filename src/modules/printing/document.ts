import type {
  PrintTicket,
  TicketDocument,
  TicketKind,
  TicketLine,
} from "./types";
export function printText(value: string) {
  return value
    .normalize("NFC")
    .replace(/[\x00-\x08\x0b-\x1f\x7f]/g, "")
    .trimEnd();
}
export type RoutedLine = Omit<TicketLine, "comboName"> & {
  lineKind: string;
  parentLineId: string | null;
  stationId: string | null;
  stationName: string | null;
};
export function groupPrintLines(rows: RoutedLine[]) {
  const parents = new Map(
    rows.filter((l) => l.lineKind === "combo").map((l) => [l.id, l.name]),
  );
  const groups = new Map<
    string,
    { stationId: string | null; stationName: string; lines: TicketLine[] }
  >();
  for (const row of rows) {
    if (row.lineKind === "combo") continue;
    const key = row.stationId ?? "general";
    let group = groups.get(key);
    if (!group) {
      group = {
        stationId: row.stationId,
        stationName: row.stationName ?? "REVISAR ESTACIÓN",
        lines: [],
      };
      groups.set(key, group);
    }
    group.lines.push({
      id: row.id,
      name: row.name,
      quantity: row.quantity,
      comboName: row.parentLineId
        ? (parents.get(row.parentLineId) ?? "Combo")
        : null,
      notes: row.notes,
      modifiers: row.modifiers,
    });
  }
  return [...groups.values()];
}
export function ticketDocument(
  ticket: PrintTicket,
  meta: {
    kind: TicketKind;
    copyNumber: number;
    requestedAt: string;
    change?: string;
  },
): TicketDocument {
  const lines: TicketDocument["lines"] = [];
  const add = (
    text: string,
    style: TicketDocument["lines"][number]["style"] = "normal",
    align?: "center",
  ) => {
    for (const part of printText(text).split("\n"))
      lines.push({ text: part, style, ...(align ? { align } : {}) });
  };
  const when = (value: string) =>
    new Date(value).toLocaleString("es-AR", {
      timeZone: ticket.timeZone,
      dateStyle: "short",
      timeStyle: "short",
    });
  add(ticket.branchName, "small", "center");
  if (meta.kind === "historical")
    add("HISTÓRICO · NO PREPARAR", "title", "center");
  if (meta.kind === "copy" || meta.kind === "historical")
    add(`COPIA ${meta.copyNumber}`, "title", "center");
  if (meta.kind === "cancellation")
    add("CANCELADO · NO PREPARAR", "title", "center");
  if (meta.kind === "change") add("CAMBIO DEL PEDIDO", "title", "center");
  if (meta.kind === "test") add("PRUEBA · NO PREPARAR", "title", "center");
  add(ticket.stationName.toUpperCase(), "title", "center");
  add(`PEDIDO ${ticket.saleNumber}.${ticket.sequence}`, "heading");
  add(
    ticket.locatorNumber === null
      ? "SIN LOCALIZADOR"
      : `LOCALIZADOR ${meta.change ? "ORIGINAL " : ""}${ticket.locatorNumber}`,
    "heading",
  );
  if (ticket.customerName) add(`CLIENTE: ${ticket.customerName}`, "bold");
  add(`${ticket.origin} · ${ticket.consumption}`, "small");
  if (ticket.tableName) add(`Mesa: ${ticket.tableName}`, "bold");
  if (ticket.externalId) add(`Referencia: ${ticket.externalId}`, "small");
  add(`Original: ${when(ticket.occurredAt)}`, "small");
  if (meta.copyNumber > 0)
    add(`Reimpresión: ${when(meta.requestedAt)}`, "small");
  if (meta.change) add(meta.change, "heading");
  if (meta.kind !== "cancellation" && meta.kind !== "change")
    for (const line of ticket.lines) {
      add("--------------------------------", "small");
      if (line.comboName) add(`Combo: ${line.comboName}`, "small");
      add(`${line.quantity} × ${line.name}`, "heading");
      if (line.modifiers.length) {
        add(
          line.quantity > 1 ? "MODIFICADORES POR UNIDAD" : "MODIFICADORES",
          "small",
        );
        for (const m of line.modifiers) {
          add(`  ${m.groupName}: ${m.optionName} × ${m.count}`, "bold");
          if (
            m.instruction &&
            printText(m.instruction).toLowerCase() !==
              printText(m.optionName).toLowerCase()
          )
            add(`    ${m.instruction}`);
        }
      }
      if (line.notes) {
        add("OBSERVACIÓN DEL PRODUCTO", "small");
        add(line.notes, "bold");
      }
    }
  if (ticket.notes && meta.kind !== "cancellation" && meta.kind !== "change") {
    add("--------------------------------", "small");
    add("NOTA DEL PEDIDO", "bold");
    add(ticket.notes, "bold");
  }
  if (ticket.otherStations.length)
    add(`Pedido compartido con ${ticket.otherStations.join(", ")}`, "small");
  add("Comanda de preparación", "small", "center");
  return { version: 1, widthDots: 576, logo: true, lines };
}
