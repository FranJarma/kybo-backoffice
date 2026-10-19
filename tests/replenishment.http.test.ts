import { afterEach, beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  actor: vi.fn(),
  snapshot: vi.fn(),
  command: vi.fn(),
}));
vi.mock("@/modules/branches/http", () => ({ operationalActor: mocks.actor }));
vi.mock("@/db/client", () => ({ getDb: async () => ({}) }));
vi.mock("@/modules/replenishment/service", () => ({
  getReplenishmentSnapshot: mocks.snapshot,
  saveReplenishmentPolicy: vi.fn(),
}));
vi.mock("@/modules/operations/command", () => ({
  executeCommand: mocks.command,
}));
import { GET, POST } from "@/app/api/inventory/replenishment/route";

beforeEach(() => {
  vi.stubEnv("BETTER_AUTH_URL", "https://kybo.example");
  vi.stubEnv("BETTER_AUTH_TRUSTED_ORIGINS", "");
  mocks.actor.mockResolvedValue({
    id: "abi",
    role: "staff",
    branchId: "branch",
  });
  mocks.snapshot.mockResolvedValue({
    alerts: [],
    policies: [],
    items: [],
    locations: [],
    asOf: "2026-10-18",
  });
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});
const read = () =>
  new Request("https://kybo.example/api/inventory/replenishment");
const write = (origin = "https://kybo.example") =>
  new Request(read(), {
    method: "POST",
    headers: { Origin: origin, "Content-Type": "application/json" },
    body: JSON.stringify({
      requestId: "c1abe7ce-2b8e-41b6-bfd0-9db4b388f9d1",
      policy: {},
    }),
  });

it("permite leer al empleado y desactiva el caché HTTP", async () => {
  const response = await GET(read());
  expect(response.status).toBe(200);
  expect(response.headers.get("cache-control")).toBe("private, no-store");
  expect(await response.json()).toHaveProperty("alerts", []);
});
it("rechaza configurar desde un empleado antes de ejecutar la operación", async () => {
  const response = await POST(write());
  expect(response.status).toBe(403);
  expect(mocks.command).not.toHaveBeenCalled();
});
it("rechaza un origen externo incluso para el encargado", async () => {
  mocks.actor.mockResolvedValue({
    id: "manager",
    role: "manager",
    branchId: "branch",
  });
  expect((await POST(write("https://external.example"))).status).toBe(403);
  expect(mocks.command).not.toHaveBeenCalled();
});
it("una migración pendiente es un error explícito, nunca una lista vacía de avisos", async () => {
  mocks.snapshot.mockRejectedValue({
    cause: { code: "42P01", message: "private database details" },
  });
  const response = await GET(read());
  expect(response.status).toBe(503);
  expect(await response.json()).toMatchObject({
    code: "REPLENISHMENT_NOT_READY",
  });
});
