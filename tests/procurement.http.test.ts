import { beforeEach, afterEach, it, expect, vi } from "vitest";
const mock = vi.hoisted(() => ({
  actor: vi.fn(),
  snapshot: vi.fn(),
  create: vi.fn(),
  command: vi.fn(),
}));
vi.mock("@/modules/branches/http", () => ({ operationalActor: mock.actor }));
vi.mock("@/db/client", () => ({ getDb: async () => ({}) }));
vi.mock("@/modules/procurement/queries", () => ({
  getOrderSnapshot: mock.snapshot,
}));
vi.mock("@/modules/procurement/orders", () => ({
  createPurchaseDraft: mock.create,
  commandPurchaseOrder: mock.command,
}));
import { GET, POST } from "@/app/api/procurement/orders/route";
import { POST as change } from "@/app/api/procurement/orders/[id]/route";
const id = "11111111-1111-4111-8111-111111111111";
const req = (origin = "https://kybo.example") =>
  new Request("https://kybo.example/api/procurement/orders", {
    method: "POST",
    headers: { Origin: origin, "Content-Type": "application/json" },
    body: JSON.stringify({ requestId: id }),
  });
beforeEach(() => {
  vi.stubEnv("BETTER_AUTH_URL", "https://kybo.example");
  vi.stubEnv("BETTER_AUTH_TRUSTED_ORIGINS", "");
  mock.actor.mockResolvedValue({
    id: "manager",
    role: "manager",
    branchId: id,
  });
  mock.snapshot.mockResolvedValue({ available: true, orders: [] });
  mock.create.mockResolvedValue({ result: { id } });
  mock.command.mockResolvedValue({ result: { id } });
});
afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
});
it("returns an uncached order list and reports pending migration", async () => {
  const response = await GET(
    new Request("https://kybo.example/api/procurement/orders"),
  );
  expect(response.status).toBe(200);
  expect(response.headers.get("cache-control")).toBe("private, no-store");
  mock.snapshot.mockResolvedValue({ available: false, orders: [] });
  expect(
    await (
      await GET(new Request("https://kybo.example/api/procurement/orders"))
    ).json(),
  ).toMatchObject({ available: false });
});
it("blocks staff and external origins before writing", async () => {
  mock.actor.mockResolvedValue({ id: "staff", role: "staff" });
  expect((await POST(req())).status).toBe(403);
  expect(mock.create).not.toHaveBeenCalled();
  mock.actor.mockResolvedValue({ id: "manager", role: "manager" });
  expect((await POST(req("https://evil.example"))).status).toBe(403);
  expect(
    (
      await change(req("https://evil.example"), {
        params: Promise.resolve({ id }),
      })
    ).status,
  ).toBe(403);
  expect(mock.command).not.toHaveBeenCalled();
});
it("passes explicit confirmation to the command and validates path IDs", async () => {
  expect(
    (await change(req(), { params: Promise.resolve({ id }) })).status,
  ).toBe(200);
  expect(mock.command).toHaveBeenCalled();
  expect(
    (await change(req(), { params: Promise.resolve({ id: "bad" }) })).status,
  ).toBe(400);
});
