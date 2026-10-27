import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { AppError } from "@/lib/errors";
const mocks = vi.hoisted(() => ({
  actor: vi.fn(),
  snapshot: vi.fn(),
  command: vi.fn(),
  reconcile: vi.fn(),
}));
vi.mock("@/modules/branches/http", () => ({ operationalActor: mocks.actor }));
vi.mock("@/db/client", () => ({ getDb: async () => ({}) }));
vi.mock("@/modules/daily-operations/queries", () => ({
  getDailyOperationSnapshot: mocks.snapshot,
}));
vi.mock("@/modules/daily-operations/commands", () => ({
  runTaskCommand: mocks.command,
}));
vi.mock("@/modules/daily-operations/reconcile", () => ({
  reconcileDailyOperations: mocks.reconcile,
}));
import { GET } from "@/app/api/operations/day/route";
import { POST } from "@/app/api/operations/day/reconcile/route";
beforeEach(() => {
  vi.stubEnv("BETTER_AUTH_URL", "https://kybo.example");
  mocks.actor.mockResolvedValue({ id: "a", role: "manager", branchId: "b" });
  mocks.snapshot.mockResolvedValue({ tasks: [], stock: [] });
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetAllMocks();
});
it("requires authentication and returns private snapshots", async () => {
  const req = new Request("https://kybo.example/api/operations/day");
  const response = await GET(req);
  expect(response.headers.get("cache-control")).toBe("private, no-store");
  mocks.actor.mockRejectedValue(
    new AppError("UNAUTHORIZED", "Iniciá sesión.", 401),
  );
  expect((await GET(req)).status).toBe(401);
});
it("missing migration is explicitly unavailable with no provider details", async () => {
  mocks.snapshot.mockRejectedValue({
    cause: { code: "42P01", message: "secret" },
  });
  const r = await GET(new Request("https://kybo.example/api/operations/day"));
  expect(r.status).toBe(503);
  expect(await r.json()).toMatchObject({ code: "DAILY_NOT_READY" });
});
it("rejects malformed filters, foreign branch access and cross-origin writes", async () => {
  expect(
    (
      await GET(
        new Request("https://kybo.example/api/operations/day?offset=bad"),
      )
    ).status,
  ).toBe(400);
  mocks.actor.mockRejectedValueOnce(
    new AppError("FORBIDDEN", "Otra sucursal", 403),
  );
  expect(
    (await GET(new Request("https://kybo.example/api/operations/day"))).status,
  ).toBe(403);
  expect(
    (
      await POST(
        new Request("https://kybo.example/api/operations/day/reconcile", {
          method: "POST",
          headers: {
            origin: "https://evil.example",
            "content-type": "application/json",
          },
          body: JSON.stringify({
            requestId: "11111111-1111-4111-8111-111111111111",
          }),
        }),
      )
    ).status,
  ).toBe(403);
});
