import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { salesResponse } from "@/modules/sales/http";
import { createSchema, parse } from "@/modules/sales/validation";
const session = vi.hoisted(() => ({ requireActor: vi.fn() }));
vi.mock("@/lib/auth", () => session);
beforeEach(() => {
  vi.stubEnv("BETTER_AUTH_URL", "https://kybo.example");
  vi.stubEnv("BETTER_AUTH_TRUSTED_ORIGINS", "");
  session.requireActor.mockResolvedValue({ id: "worker", role: "staff" });
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});
const request = (body: string) =>
  new Request("https://kybo.example/api/sales", {
    method: "POST",
    headers: {
      Origin: "https://kybo.example",
      "Content-Type": "application/json",
    },
    body,
  });
it("accepts a bounded 50-line order with long Unicode observations", async () => {
  const input = {
    requestId: randomUUID(),
    origin: "counter",
    channel: "counter",
    fulfillment: "takeaway",
    lines: Array.from({ length: 50 }, () => ({
      productId: randomUUID(),
      quantity: 1,
      price: "7000",
      expectedPrice: "7000.00",
      notes: "á".repeat(500),
      priceReason: "á".repeat(240),
    })),
  };
  const response = await salesResponse(
    request(JSON.stringify(input)),
    async (_actor, raw) => ({ lines: parse(createSchema, raw).lines.length }),
  );
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ lines: 50 });
});
it("rejects oversized sale bodies before invoking the operation", async () => {
  let wrote = false;
  const response = await salesResponse(
    request(JSON.stringify({ notes: "x".repeat(300001) })),
    async () => {
      wrote = true;
      return {};
    },
  );
  expect(response.status).toBe(413);
  expect(wrote).toBe(false);
});
