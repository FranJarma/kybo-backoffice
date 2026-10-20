import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { AppError } from "@/lib/errors";
const mocks = vi.hoisted(() => ({ actor: vi.fn(), read: vi.fn() }));
vi.mock("@/modules/branches/http", () => ({ operationalActor: mocks.actor }));
vi.mock("@/db/client", () => ({ getDb: async () => ({}) }));
vi.mock("@/modules/overheads/break-even-service", () => ({
  getBreakEven: mocks.read,
}));
import { GET } from "@/app/api/finance/break-even/route";
beforeEach(() => {
  mocks.actor.mockResolvedValue({
    id: "manager",
    role: "manager",
    branchId: "branch",
  });
  mocks.read.mockResolvedValue({ month: "2026-10", products: [] });
});
afterEach(() => vi.clearAllMocks());
it("returns a private read scoped to the authenticated branch and month", async () => {
  const response = await GET(
    new Request("https://kybo.example/api/finance/break-even?month=2026-10"),
  );
  expect(response.status).toBe(200);
  expect(response.headers.get("cache-control")).toBe("private, no-store");
  expect(mocks.read).toHaveBeenCalledWith(
    {},
    { id: "manager", role: "manager", branchId: "branch" },
    "2026-10",
  );
});
it("does not expose financial data on authentication failures or provider errors", async () => {
  mocks.actor.mockRejectedValueOnce(
    new AppError("FORBIDDEN", "Acceso denegado", 403),
  );
  expect(
    (await GET(new Request("https://kybo.example/api/finance/break-even")))
      .status,
  ).toBe(403);
  expect(mocks.read).not.toHaveBeenCalled();
  mocks.read.mockRejectedValueOnce(
    new Error("private provider connection data"),
  );
  const response = await GET(
    new Request("https://kybo.example/api/finance/break-even"),
  );
  expect(response.status).toBe(503);
  expect(await response.text()).not.toContain("private provider");
});
