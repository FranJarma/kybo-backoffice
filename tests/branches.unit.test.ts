import { describe, expect, it } from "vitest";
import { businessDate } from "../src/modules/operations/business-date";
import {
  authorizeBranch,
  authorizeCatalog,
} from "../src/modules/branches/authorization";
describe("branch boundaries", () => {
  it("uses the branch business day at midnight boundaries", () => {
    expect(
      businessDate(new Date("2026-09-28T02:00:00Z"), "America/Argentina/Salta"),
    ).toBe("2026-09-27");
    expect(businessDate(new Date("2026-09-28T02:00:00Z"), "Asia/Tokyo")).toBe(
      "2026-09-28",
    );
  });
  it("never extends a global manager role to a new branch", () => {
    expect(() =>
      authorizeBranch(
        { role: "manager", disabled: false, catalogManager: true },
        null,
      ),
    ).toThrow();
    expect(
      authorizeBranch(
        { role: "manager", disabled: false, catalogManager: true },
        "staff",
      ),
    ).toBe("staff");
  });
  it("checks disabled administrators and revoked memberships", () => {
    expect(() =>
      authorizeBranch(
        { role: "admin", disabled: true, catalogManager: true },
        "manager",
      ),
    ).toThrow();
    expect(
      authorizeBranch(
        { role: "admin", disabled: false, catalogManager: false },
        null,
      ),
    ).toBe("admin");
    expect(() => authorizeBranch(null, "manager")).toThrow();
  });
  it("treats catalog management as an independent permission", () => {
    expect(() =>
      authorizeCatalog({
        role: "manager",
        disabled: false,
        catalogManager: false,
      }),
    ).toThrow();
    expect(() =>
      authorizeCatalog({
        role: "staff",
        disabled: false,
        catalogManager: true,
      }),
    ).not.toThrow();
  });
});
