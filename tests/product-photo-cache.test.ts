import { expect, it, vi } from "vitest";
import { createPhotoCache } from "../src/modules/media/photo-cache";

it("shares an in-flight read and reuses bytes for the same immutable photo", async () => {
  const cache = createPhotoCache();
  let release!: (data: Buffer) => void;
  const load = vi.fn(
    () =>
      new Promise<Buffer>((resolve) => {
        release = resolve;
      }),
  );
  const first = cache.read("a", load);
  const second = cache.read("a", load);
  await Promise.resolve();
  expect(load).toHaveBeenCalledTimes(1);
  release(Buffer.from("photo"));
  expect(await first).toEqual(Buffer.from("photo"));
  expect(await second).toEqual(Buffer.from("photo"));
  expect(await cache.read("a", load)).toEqual(Buffer.from("photo"));
  expect(load).toHaveBeenCalledTimes(1);
});

it("evicts the least recently used bytes before exceeding its memory budget", async () => {
  const cache = createPhotoCache({ maxBytes: 6 });
  const a = vi.fn(async () => Buffer.from("aaa"));
  const b = vi.fn(async () => Buffer.from("bbb"));
  await cache.read("a", a);
  await cache.read("b", b);
  await cache.read("a", a);
  await cache.read("c", async () => Buffer.from("ccc"));
  await cache.read("a", a);
  expect(a).toHaveBeenCalledTimes(1);
  await cache.read("b", b);
  expect(b).toHaveBeenCalledTimes(2);
});

it("bounds entry count and expires old photos", async () => {
  let now = 1000;
  const cache = createPhotoCache({ maxEntries: 2, ttlMs: 100, now: () => now });
  const load = vi.fn(async () => Buffer.from("x"));
  await cache.read("a", load);
  await cache.read("b", load);
  await cache.read("c", load);
  await cache.read("a", load);
  expect(load).toHaveBeenCalledTimes(4);
  now += 101;
  await cache.read("a", load);
  expect(load).toHaveBeenCalledTimes(5);
});

it("never retains oversized photos, missing photos or failed reads", async () => {
  const cache = createPhotoCache({ maxBytes: 2 });
  const oversized = vi.fn(async () => Buffer.from("large"));
  const missing = vi.fn(async () => null);
  const failure = vi.fn(async () => {
    throw new Error("temporary failure");
  });
  for (let i = 0; i < 2; i++) {
    expect(await cache.read("large", oversized)).toEqual(Buffer.from("large"));
    expect(await cache.read("missing", missing)).toBeNull();
    await expect(cache.read("failed", failure)).rejects.toThrow(
      "temporary failure",
    );
  }
  expect(oversized).toHaveBeenCalledTimes(2);
  expect(missing).toHaveBeenCalledTimes(2);
  expect(failure).toHaveBeenCalledTimes(2);
});
