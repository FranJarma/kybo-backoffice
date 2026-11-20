import { describe, expect, it } from "vitest";
import { groupPrintLines, ticketDocument } from "@/modules/printing/document";
import type { PrintTicket } from "@/modules/printing/types";

const ticket: PrintTicket = {
  version: 1,
  branchName: "Alberdi",
  timeZone: "America/Argentina/Buenos_Aires",
  saleId: "sale",
  orderId: "order",
  saleNumber: 148,
  sequence: 1,
  occurredAt: "2026-11-02T17:32:00Z",
  origin: "Mostrador",
  consumption: "Para llevar",
  tableName: null,
  externalId: null,
  customerName: "Martina",
  locatorNumber: 7,
  stationId: "bar",
  stationName: "Barra",
  notes: "Entregar todo junto",
  otherStations: ["Cocina"],
  lines: [
    {
      id: "line",
      quantity: 2,
      name: "Taro Iced Latte",
      comboName: null,
      notes: "Sin hielo",
      modifiers: [
        {
          groupName: "Perlas",
          optionName: "Tapioca",
          count: 2,
          instruction: "Agregar al final",
        },
      ],
    },
  ],
};

describe("order printing document", () => {
  it("prints change notices as deltas instead of another order to prepare", () => {
    const doc = ticketDocument(ticket, {kind:"change",copyNumber:0,requestedAt:ticket.occurredAt,change:"LOCALIZADOR ACTUAL: 9"});
    const text = doc.lines.map(l=>l.text).join("\n");
    expect(text).toContain("LOCALIZADOR ORIGINAL 7");
    expect(text).toContain("LOCALIZADOR ACTUAL: 9");
    expect(text).not.toContain("Taro Iced Latte");
    expect(text).not.toContain("Entregar todo junto");
  });
  it("keeps quantity per product, group/choice/count/instruction and distinct notes", () => {
    const doc = ticketDocument(ticket, {
      kind: "original",
      copyNumber: 0,
      requestedAt: ticket.occurredAt,
    });
    const text = doc.lines.map((l) => l.text).join("\n");
    expect(text).toContain("2 × Taro Iced Latte");
    expect(text).toContain("MODIFICADORES POR UNIDAD");
    expect(text).toContain("Perlas: Tapioca × 2");
    expect(text).toContain("Agregar al final");
    expect(text).toContain("OBSERVACIÓN DEL PRODUCTO");
    expect(text).toContain("NOTA DEL PEDIDO");
    expect(text).toContain("LOCALIZADOR 7");
    expect(text).not.toContain("$");
    expect(doc).toMatchObject({ version: 1, widthDots: 576, logo: true });
  });
  it("removes raw printer control bytes but preserves full Unicode and long notes", () => {
    const note = "Jamón, café y ñandú. ".repeat(100);
    const doc = ticketDocument(
      { ...ticket, notes: note + "\x1b@\x00" },
      { kind: "copy", copyNumber: 2, requestedAt: "2026-11-02T17:35:00Z" },
    );
    const text = doc.lines.map((l) => l.text).join("\n");
    expect(text).toContain(note.trim());
    expect(text).not.toMatch(/[\x00-\x08\x0b-\x1f\x7f]/);
    expect(text).toContain("COPIA 2");
    expect(text).toContain("Reimpresión:");
    expect(text).toContain("Original:");
  });
  it("prints combo components by station once and excludes commercial parents", () => {
    const base = {
      ...ticket.lines[0],
      stationId: "bar",
      stationName: "Barra",
      lineKind: "individual",
      parentLineId: null,
    };
    const result = groupPrintLines([
      { ...base, id: "parent", name: "Combo", lineKind: "combo", quantity: 2 },
      {
        ...base,
        id: "drink",
        name: "Tea",
        parentLineId: "parent",
        lineKind: "combo_component",
        quantity: 4,
      },
      {
        ...base,
        id: "waffle",
        stationId: "kitchen",
        stationName: "Cocina",
        parentLineId: "parent",
        lineKind: "combo_component",
        quantity: 2,
      },
      { ...base, id: "bottle", name: "Gaseosa", modifiers: [], quantity: 1 },
      { ...base, id: "unmapped", stationId: null, stationName: null },
    ]);
    expect(result).toHaveLength(3);
    expect(result[0].lines.map((l) => [l.id, l.quantity, l.comboName])).toEqual(
      [
        ["drink", 4, "Combo"],
        ["bottle", 1, null],
      ],
    );
    expect(result.flatMap((g) => g.lines).map((l) => l.id)).not.toContain(
      "parent",
    );
    expect(result[2].stationName).toBe("REVISAR ESTACIÓN");
  });
  it("never merges same products with different modifiers and marks historical copies", () => {
    const one = ticket.lines[0];
    const doc = ticketDocument(
      {
        ...ticket,
        lines: [
          one,
          {
            ...one,
            id: "other",
            modifiers: [
              { ...one.modifiers[0], optionName: "Sin perlas", count: 1 },
            ],
          },
        ],
      },
      { kind: "historical", copyNumber: 1, requestedAt: ticket.occurredAt },
    );
    expect(
      doc.lines.filter((l) => l.text === "2 × Taro Iced Latte"),
    ).toHaveLength(2);
    expect(doc.lines.map((l) => l.text)).toContain("HISTÓRICO · NO PREPARAR");
  });
});
