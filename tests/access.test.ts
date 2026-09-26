import { describe, expect, it } from "vitest";
import { requireCatalogAccess } from "../src/lib/access";

describe("catalog permissions", () => {
  it("rejects missing sessions", () => {
    expect(() => requireCatalogAccess(null)).toThrowError(
      expect.objectContaining({ code: "UNAUTHORIZED", status: 401 }),
    );
  });

  it("rejects staff", () => {
    expect(() =>
      requireCatalogAccess({ id: "employee", role: "staff" }),
    ).toThrowError(expect.objectContaining({ code: "FORBIDDEN", status: 403 }));
  });

  it("fails closed for an unexpected role value", () => {
    expect(() =>
      requireCatalogAccess({ id: "tampered", role: "unknown" as "staff" }),
    ).toThrowError(expect.objectContaining({ code: "FORBIDDEN", status: 403 }));
  });

  it.each(["admin", "manager"] as const)("allows %s", (role) => {
    expect(() =>
      requireCatalogAccess({ id: "authorized", role }),
    ).not.toThrow();
  });
});
