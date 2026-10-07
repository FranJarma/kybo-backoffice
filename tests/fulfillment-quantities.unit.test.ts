import { describe, expect, it } from "vitest";
import {
  transitionLine,
  cancellationDisposition,
  completionPortion,
} from "../src/modules/fulfillment/quantities";
describe("physical fulfillment", () => {
  it("preserves all fractional residues for the final completion", () => {
    const first = completionPortion(1_000_000n, 1, 3);
    const second = completionPortion(1_000_000n - first, 1, 2);
    const last = completionPortion(1_000_000n - first - second, 1, 1);
    expect([first, second, last]).toEqual([333333n, 333333n, 333334n]);
    expect(completionPortion(1n, 1, 3)).toBe(0n);
    expect(() => completionPortion(1n, 2, 1)).toThrow();
  });
  const line = {
    mode: "recipe" as const,
    ordered: 5,
    completed: 0,
    delivered: 0,
    cancelled: 0,
  };
  it("consumes just the completed quantity and never consumes again on delivery", () => {
    const completed = transitionLine(line, "complete", 2);
    expect(completed.consume).toBe(2);
    expect(completed.next.completed).toBe(2);
    expect(transitionLine(completed.next, "deliver", 2).consume).toBe(0);
    expect(() => transitionLine(completed.next, "deliver", 3)).toThrow();
  });
  it("consumes resale on delivery and rejects kitchen completion", () => {
    const direct = { ...line, mode: "direct" as const };
    expect(transitionLine(direct, "deliver", 2).consume).toBe(2);
    expect(() => transitionLine(direct, "complete", 1)).toThrow();
  });
  it("does not turn cancellation into a physical refund", () => {
    expect(cancellationDisposition("pending", 5, 0)).toEqual({
      release: 5,
      pending: 0,
    });
    expect(cancellationDisposition("preparing", 5, 2)).toEqual({
      release: 0,
      pending: 3,
    });
    expect(cancellationDisposition("ready", 5, 5)).toEqual({
      release: 0,
      pending: 0,
    });
  });
  it("rejects negative, duplicate completion and fractional quantities", () => {
    for (const n of [-1, 0, 1.5, 6, NaN])
      expect(() => transitionLine(line, "complete", n)).toThrow();
    expect(() =>
      transitionLine({ ...line, completed: 5 }, "complete", 1),
    ).toThrow();
  });
});
