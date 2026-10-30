import { expect, it } from "vitest";
import { visibleNavigation } from "@/lib/navigation";
import { assertStoreHttpAccess } from "@/modules/branches/store-access";
import type { Actor } from "@/lib/access";
const store = { id: "counter", role: "staff", accountKind: "store" } as Actor;
it("limits store navigation to sales, tables, attendance QR and protected shift management", () => {
  expect(visibleNavigation(store).map((n) => n.href)).toEqual([
    "/sales",
    "/sales/tables",
    "/staff/attendance/qr",
    "/workplace",
  ]);
  expect(
    visibleNavigation({ role: "staff", accountKind: "personal" }).map(
      (n) => n.href,
    ),
  ).not.toContain("/staff/attendance/qr");
});
it("permits only concrete POS HTTP operations and never broadens privileges for a management token", () => {
  const request = (path: string, method = "GET") =>
    new Request(`https://kybo.example${path}`, {
      method,
      headers: { "X-Kybo-Management": "does-not-elevate" },
    });
  for (const [path, method] of [
    ["/api/sales", "GET"],
    ["/api/sales", "POST"],
    ["/api/sales/lookup", "GET"],
    ["/api/pickup", "GET"],
    ["/api/fulfillment/state", "GET"],
    ["/api/fulfillment/deliver", "POST"],
    ["/api/cash/status", "GET"],
    ["/api/attendance/qr", "GET"],
    ["/api/workplace", "POST"],
  ])
    expect(() =>
      assertStoreHttpAccess(store, request(path, method)),
    ).not.toThrow();
  for (const [path, method] of [
    ["/api/attendance", "GET"],
    ["/api/attendance/qr", "POST"],
    ["/api/identity", "POST"],
    ["/api/cash", "POST"],
    ["/api/settings/users", "POST"],
    ["/api/production", "GET"],
    ["/api/preparation", "GET"],
    ["/api/operations/day", "GET"],
    ["/api/fulfillment/complete", "POST"],
    ["/api/fulfillment/return", "POST"],
    ["/api/salesx", "GET"],
    ["/api/workplace/other", "POST"],
  ])
    expect(() => assertStoreHttpAccess(store, request(path, method))).toThrow();
  expect(() =>
    assertStoreHttpAccess(
      { id: "person", role: "staff", accountKind: "personal" },
      request("/api/attendance", "POST"),
    ),
  ).not.toThrow();
});
