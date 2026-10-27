import { afterEach, beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  actor: vi.fn(),
  snapshot: vi.fn(),
  command: vi.fn(),
}));
vi.mock("@/modules/branches/http", () => ({ operationalActor: mocks.actor }));
vi.mock("@/db/client", () => ({ getDb: async () => ({}) }));
vi.mock("@/modules/supply-alerts/service", () => ({
  getSupplySnapshot: mocks.snapshot,
  saveSupplyPolicy: vi.fn(),
}));
vi.mock("@/modules/operations/command", () => ({
  executeCommand: mocks.command,
}));
import { GET, POST } from "@/app/api/inventory/supply-alerts/route";
beforeEach(() => {
  vi.stubEnv("BETTER_AUTH_URL", "https://kybo.example");
  vi.stubEnv("BETTER_AUTH_TRUSTED_ORIGINS", "");
  mocks.actor.mockResolvedValue({
    id: "manager",
    role: "manager",
    branchId: "branch",
  });
  mocks.snapshot.mockResolvedValue({
    available: true,
    policies: [],
    alerts: [],
  });
});
afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
});
const read = () =>
  new Request("https://kybo.example/api/inventory/supply-alerts");
const write = (origin = "https://kybo.example") =>
  new Request(read(), {
    method: "POST",
    headers: { Origin: origin, "Content-Type": "application/json" },
    body: JSON.stringify({
      requestId: "c1abe7ce-2b8e-41b6-bfd0-9db4b388f9d1",
      policy: {},
    }),
  });
it("returns private uncached coverage to managers", async () => {
  const response = await GET(read());
  expect(response.status).toBe(200);
  expect(response.headers.get("cache-control")).toBe("private, no-store");
});
it("rejects staff before reads or commands and rejects external write origins", async () => {
  mocks.actor.mockResolvedValue({ id: "staff", role: "staff" });
  expect((await GET(read())).status).toBe(403);
  expect((await POST(write())).status).toBe(403);
  expect(mocks.snapshot).not.toHaveBeenCalled();
  expect(mocks.command).not.toHaveBeenCalled();
  mocks.actor.mockResolvedValue({
    id: "manager",
    role: "manager",
    branchId: "branch",
  });
  expect((await POST(write("https://external.example"))).status).toBe(403);
});
it("reports pending activation explicitly, never a healthy empty list", async () => {
  mocks.snapshot.mockResolvedValue({
    available: false,
    policies: [],
    alerts: [],
  });
  expect(await (await GET(read())).json()).toMatchObject({ available: false });
});
