import { describe, expect, it } from "vitest";
import {
  summarizeCash,
  reconcilePosnet,
  calculateCashClose,
} from "@/modules/cash/calculation";
const movement = (kind: string, amount: string, methodKind = "cash") => ({
  kind,
  amount,
  methodKind,
});
describe("cash accounting", () => {
  it("keeps cards/transfers outside the drawer and refunds signed", () => {
    expect(
      summarizeCash([
        movement("opening", "50000.00"),
        movement("collection", "452000.00"),
        movement("refund", "-5000.00"),
        movement("expense", "-6500.00"),
        movement("supplier", "-24000.00"),
        movement("withdrawal", "-125000.00"),
        movement("collection", "186000.00", "card"),
        movement("collection", "92500.00", "transfer"),
      ]),
    ).toMatchObject({
      expectedCash: "341500.00",
      cardTotal: "186000.00",
      cardOperations: 1,
      transferTotal: "92500.00",
    });
  });
  it("keeps a shortage when withdrawing enough to leave the target fund", () => {
    expect(calculateCashClose("305000.00", "300000.00", "250000.00")).toEqual({
      difference: "-5000.00",
      fund: "50000.00",
    });
    expect(() => calculateCashClose("100.00", "100.00", "101.00")).toThrow();
  });
  it("reconciles all lots and requires a reason for count or amount differences", () => {
    const lots = [
      {
        number: "001",
        closedAt: "2026-10-27T23:00:00Z",
        operations: 20,
        total: "100000.00",
        photoId: crypto.randomUUID(),
      },
      {
        number: "002",
        closedAt: "2026-10-27T23:00:00Z",
        operations: 12,
        total: "86000.00",
        photoId: crypto.randomUUID(),
      },
    ];
    expect(
      reconcilePosnet({ mode: "registered", lots }, "186000.00", 32),
    ).toMatchObject({
      total: "186000.00",
      difference: "0.00",
      needsReview: false,
    });
    expect(() =>
      reconcilePosnet({ mode: "registered", lots }, "186000.00", 33),
    ).toThrow();
    expect(
      reconcilePosnet(
        { mode: "registered", lots, reason: "Una operación debe revisarse" },
        "186000.00",
        33,
      ),
    ).toMatchObject({ needsReview: true });
    expect(() =>
      reconcilePosnet(
        { mode: "registered", lots: [lots[0], lots[0]] },
        "200000.00",
        40,
      ),
    ).toThrow();
    expect(() =>
      reconcilePosnet({ mode: "pending", lots: [], reason: "" }, "0.00", 1),
    ).toThrow();
  });
  it("permits a negative net card batch after a refund from a prior day", () => {
    expect(
      reconcilePosnet(
        {
          mode: "registered",
          lots: [
            {
              number: "003",
              closedAt: "2026-10-27T23:00:00Z",
              operations: 1,
              total: "-100.00",
              photoId: crypto.randomUUID(),
            },
          ],
        },
        "-100.00",
        1,
      ),
    ).toMatchObject({ difference: "0.00", needsReview: false });
  });
});
