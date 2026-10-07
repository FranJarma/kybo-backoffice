import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { AppError } from "../src/lib/errors";
import { inventoryResponse } from "../src/modules/inventory/http";

const session = vi.hoisted(() => ({ requireActor: vi.fn() }));
vi.mock("../src/lib/auth", () => session);
vi.mock("../src/modules/branches/http", () => ({
  operationalActor: session.requireActor,
}));

beforeEach(() => {
  vi.stubEnv("BETTER_AUTH_URL", "https://kybo.example");
  vi.stubEnv("BETTER_AUTH_TRUSTED_ORIGINS", "");
  session.requireActor.mockResolvedValue({ id: "owner", role: "admin" });
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

it("denies anonymous inventory reads before executing the business operation", async () => {
  session.requireActor.mockRejectedValue(
    new AppError("UNAUTHORIZED", "Ingresá.", 401),
  );
  let ran = false;
  const response = await inventoryResponse(null, async () => {
    ran = true;
    return { privateData: true };
  });
  expect(response.status).toBe(401);
  expect(ran).toBe(false);
  expect(response.headers.get("cache-control")).toBe("private, no-store");
});

it("denies staff read access at the HTTP boundary", async () => {
  session.requireActor.mockResolvedValue({ id: "worker", role: "staff" });
  const response = await inventoryResponse(null, async () => ({
    privateData: true,
  }));
  expect(response.status).toBe(403);
  expect(await response.json()).not.toHaveProperty("privateData");
});

it("rejects foreign Origin before a purchase can be written", async () => {
  let writes = 0;
  const request = new Request("https://kybo.example/api/purchases", {
    method: "POST",
    headers: {
      Origin: "https://attacker.example",
      "Content-Type": "application/json",
    },
    body: "{}",
  });
  const response = await inventoryResponse(request, async () => {
    writes++;
    return { saved: true };
  });
  expect(response.status).toBe(403);
  expect(writes).toBe(0);
});

it("delivers parsed JSON and server actor to an authorized mutation", async () => {
  const request = new Request("https://kybo.example/api/purchases", {
    method: "POST",
    headers: {
      Origin: "https://kybo.example",
      "Content-Type": "application/json",
    },
    body: '{"quantity":"2"}',
  });
  const response = await inventoryResponse(request, async (actor, input) => ({
    owner: actor.id,
    input,
  }));
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({
    owner: "owner",
    input: { quantity: "2" },
  });
});

it("does not disclose database details in an operational error", async () => {
  const response = await inventoryResponse(null, async () => {
    throw new Error("postgres://secret@db vendor private data");
  });
  expect(response.status).toBe(503);
  expect(await response.text()).not.toContain("secret");
});
