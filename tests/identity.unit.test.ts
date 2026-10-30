import { expect, it } from "vitest";
import {
  canonicalHash,
  sealCode,
  unsealCode,
  hashCode,
  codeMatches,
  relyingParty,
} from "@/modules/identity/crypto";
const secret = "test-only-attendance-secret-at-least-32-characters";
it("fingerprints the exact intent independent of object key order", () => {
  expect(canonicalHash({ a: 1, b: { z: 2, a: "x" } })).toBe(
    canonicalHash({ b: { a: "x", z: 2 }, a: 1 }),
  );
  expect(canonicalHash({ amount: "100" })).not.toBe(
    canonicalHash({ amount: "101" }),
  );
  expect(canonicalHash(["a", "b"])).not.toBe(canonicalHash(["b", "a"]));
});
it("encrypts one-time codes with request-bound authenticated encryption", () => {
  const cipher = sealCode("123456", "request-1", secret);
  expect(cipher).not.toContain("123456");
  expect(unsealCode(cipher, "request-1", secret)).toBe("123456");
  expect(() => unsealCode(cipher, "request-2", secret)).toThrow();
  expect(() =>
    unsealCode(cipher.slice(0, -8) + "abcdefgh", "request-1", secret),
  ).toThrow();
  expect(sealCode("123456", "request-1", secret)).not.toBe(cipher);
});
it("matches keyed hashes without allowing a code to cross requests", () => {
  const hash = hashCode("123456", "request-1", secret);
  expect(codeMatches("123456", "request-1", hash, secret)).toBe(true);
  expect(codeMatches("000000", "request-1", hash, secret)).toBe(false);
  expect(codeMatches("123456", "request-2", hash, secret)).toBe(false);
  expect(() => sealCode("123456", "request-1", "short")).toThrow();
});
it("derives the RP from an exact configured origin, requiring HTTPS away from localhost", () => {
  expect(relyingParty("https://kybo.example")).toEqual({
    origin: "https://kybo.example",
    rpId: "kybo.example",
  });
  expect(relyingParty("http://localhost:3000").rpId).toBe("localhost");
  expect(() => relyingParty("http://kybo.example")).toThrow();
  expect(() => relyingParty("https://kybo.example/path")).toThrow();
});
