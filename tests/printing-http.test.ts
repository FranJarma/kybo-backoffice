import { expect, it, vi } from "vitest";
vi.mock("@/db/client", () => ({ getDb: async () => ({}) }));
vi.mock("@/modules/printing/connector", () => ({
  runConnectorCommand: async () => ({ printerName: "Café Ñ", ok: true }),
}));
import { POST } from "@/app/api/printing/connector/route";
import { assertStoreHttpAccess } from "@/modules/branches/store-access";
it("allows the store account printing panel without exposing setup or installer routes", () => {
  const actor = { accountKind: "store" as const };
  expect(() =>
    assertStoreHttpAccess(
      actor,
      new Request("https://kybo.example/api/printing?saleId=example"),
    ),
  ).not.toThrow();
  expect(() =>
    assertStoreHttpAccess(
      actor,
      new Request("https://kybo.example/api/printing", { method: "POST" }),
    ),
  ).not.toThrow();
  expect(() =>
    assertStoreHttpAccess(
      actor,
      new Request("https://kybo.example/api/printing/installer"),
    ),
  ).toThrow();
});
it("declares UTF-8 explicitly so Windows PowerShell 5.1 preserves Spanish names", async () => {
  const response = await POST(
    new Request("https://kybo.example/api/printing/connector", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "heartbeat" }),
    }),
  );
  expect(response.headers.get("content-type")).toMatch(/charset=utf-8/i);
  expect(await response.json()).toMatchObject({ printerName: "Café Ñ" });
});
it("rejects insecure non-loopback machine requests and oversized payloads", async () => {
  const insecure = await POST(
    new Request("http://kybo.example/api/printing/connector", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    }),
  );
  expect(insecure.status).toBe(403);
  const large = await POST(
    new Request("https://kybo.example/api/printing/connector", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ x: "x".repeat(12000) }),
    }),
  );
  expect(large.status).toBe(413);
});
