import { describe, it, expect } from "vitest";
import { closingCommand, type CloseDraft } from "@/components/cash/draft";
import type { CashSession, CashTotals } from "@/modules/cash/types";

const session = {
  id: "session",
  revision: 7,
  timeZone: "America/Argentina/Buenos_Aires",
} as CashSession;
const totals = {
  expectedCash: "300000.10",
  cardTotal: "8000.00",
  cardOperations: 2,
} as CashTotals;
const draft = (): CloseDraft => ({
  counted: "300.000,10",
  withdrawal: "250.000",
  reason: "",
  mode: "registered",
  posnetReason: "",
  lots: [
    {
      id: "draft-lot",
      number: "003",
      closedAt: "2026-10-27T23:10",
      operations: "2",
      total: "8.000",
      photo: { id: "private-photo", url: "/api/cash/photos/private-photo" },
    },
  ],
});
describe("cash close UI payload", () => {
  it("counts before withdrawal and sends canonical amounts, private photo identity and the reviewed revision", () => {
    const input = draft();
    expect(closingCommand(input, session, totals, true)).toEqual({
      command: {
        action: "close",
        sessionId: "session",
        expectedRevision: 7,
        counted: "300000.10",
        withdrawal: "250000.00",
        reason: "",
        posnet: {
          mode: "registered",
          reason: "",
          lots: [
            {
              number: "003",
              closedAt: "2026-10-28T02:10:00.000Z",
              operations: 2,
              total: "8000.00",
              photoId: "private-photo",
            },
          ],
        },
      },
    });
    expect(input).toEqual(draft());
  });
  it("requires a reason for one cent cash difference", () => {
    expect(
      closingCommand(
        { ...draft(), counted: "300.000,09" },
        session,
        totals,
        true,
      ).error,
    ).toMatch(/motivo.*efectivo/i);
  });
  it("requires a reason for a card operation count difference even when amounts match", () => {
    const input = draft();
    input.lots[0].operations = "1";
    expect(closingCommand(input, session, totals, true).error).toMatch(
      /motivo.*posnet/i,
    );
  });
  it("blocks registered lots without their privately uploaded evidence", () => {
    const input = draft();
    input.lots[0].photo = null;
    expect(closingCommand(input, session, totals, true).error).toMatch(/foto/i);
  });
  it("allows pending posnet only with a reason and never submits old lots", () => {
    expect(
      closingCommand({ ...draft(), mode: "pending" }, session, totals, true)
        .error,
    ).toMatch(/motivo/i);
    expect(
      closingCommand(
        { ...draft(), mode: "pending", posnetReason: "Equipo sin conexión" },
        session,
        totals,
        true,
      ).command?.posnet,
    ).toEqual({ mode: "pending", reason: "Equipo sin conexión", lots: [] });
  });
  it("prevents unauthorized or excessive withdrawals", () => {
    expect(closingCommand(draft(), session, totals, false).error).toMatch(
      /retiro/i,
    );
    expect(
      closingCommand(
        { ...draft(), withdrawal: "300.001" },
        session,
        totals,
        true,
      ).error,
    ).toMatch(/retiro/i);
  });
  it("does not require a lot when the app has no card operations", () => {
    expect(
      closingCommand(
        draft(),
        session,
        { ...totals, cardTotal: "0.00", cardOperations: 0 },
        true,
      ).command?.posnet,
    ).toEqual({ mode: "none", lots: [] });
  });
  it("can register a physical batch missing from the app with an explicit difference", () => {
    const input = {
      ...draft(),
      recordUnexpectedLot: true,
      posnetReason: "El cobro no se cargó en la app",
    };
    expect(
      closingCommand(
        input,
        session,
        { ...totals, cardTotal: "0.00", cardOperations: 0 },
        true,
      ).command?.posnet,
    ).toMatchObject({
      mode: "registered",
      reason: "El cobro no se cargó en la app",
    });
  });
  it("rejects a zero-operation registered lot before sending the server command", () => {
    const input = draft();
    input.lots[0].operations = "0";
    input.posnetReason = "Verificar";
    expect(closingCommand(input, session, totals, true).error).toMatch(
      /operaciones/i,
    );
  });
  it("keeps a refund-heavy negative card total signed while cash remains nonnegative", () => {
    const input = draft();
    input.lots[0].total = "-8.000";
    expect(
      closingCommand(input, session, { ...totals, cardTotal: "-8000.00" }, true)
        .command?.posnet.lots[0].total,
    ).toBe("-8000.00");
    expect(
      closingCommand({ ...input, counted: "-1" }, session, totals, true)
        .command,
    ).toBeUndefined();
  });
});
