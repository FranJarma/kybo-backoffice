import { describe, expect, it } from "vitest";
import { PosRequestCache } from "../src/components/sales/request-cache";
import { cashChange } from "../src/components/sales/payment-math";

describe("POS request cache", () => {
  it("deduplicates requests and refreshes expired results", async () => {
    const cache = new PosRequestCache<number>(100, 5);
    let calls = 0;
    const load = async () => ++calls;
    const a = cache.get("branch:channel:product:version", load, 0);
    expect(cache.get("branch:channel:product:version", load, 1)).toBe(a);
    expect(await a).toBe(1);
    expect(await cache.get("branch:channel:product:version", load, 101)).toBe(
      2,
    );
  });
  it("isolates scope keys and never caches failures", async () => {
    const cache = new PosRequestCache<number>();
    await expect(
      cache.get("a", async () => {
        throw new Error("offline");
      }),
    ).rejects.toThrow("offline");
    expect(await cache.get("a", async () => 1)).toBe(1);
    expect(await cache.get("other-branch:a", async () => 2)).toBe(2);
    cache.clear();
    expect(await cache.get("a", async () => 3)).toBe(3);
  });
  it("does not let an old rejection evict a newer request", async () => {
    const cache = new PosRequestCache<number>(10);
    let fail!: (e: Error) => void;
    const old = cache.get(
      "a",
      () =>
        new Promise((_, reject) => {
          fail = reject;
        }),
      0,
    );
    expect(await cache.get("a", async () => 2, 11)).toBe(2);
    fail(new Error("late"));
    await expect(old).rejects.toThrow("late");
    expect(await cache.get("a", async () => 3, 12)).toBe(2);
  });
});
describe("cash received is separate from the collection", () => {
  it("calculates change without increasing collected revenue", () => {
    expect(cashChange("10000", "8500")).toEqual({
      valid: true,
      change: "1500.00",
    });
    expect(cashChange("8000", "8500").valid).toBe(false);
    expect(cashChange("", "8500")).toEqual({ valid: true, change: null });
    expect(cashChange("inválido", "8500").valid).toBe(false);
  });
});
