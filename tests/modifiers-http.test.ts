import { beforeEach, afterEach, expect, it, vi } from "vitest";
const context = vi.hoisted(() => ({ requireActor: vi.fn(), getDb: vi.fn() }));
vi.mock("@/lib/auth", () => ({ requireActor: context.requireActor }));
vi.mock("@/db/client", () => ({ getDb: context.getDb }));
import { POST } from "@/app/api/modifier-groups/route";
import { POST as cost } from "@/app/api/recipes/[id]/cost/route";
beforeEach(() => {
  vi.stubEnv("BETTER_AUTH_URL", "https://kybo.example");
  context.requireActor.mockResolvedValue({ id: "staff", role: "staff" });
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});
const request = () =>
  new Request("https://kybo.example/api/modifier-groups", {
    method: "POST",
    headers: {
      origin: "https://kybo.example",
      "content-type": "application/json",
    },
    body: "{}",
  });
it("forbids staff group writes before opening database", async () => {
  const r = await POST(request());
  expect(r.status).toBe(403);
  expect(context.getDb).not.toHaveBeenCalled();
});
it("forbids staff simulation without revealing item costs", async () => {
  const r = await cost(request(), {
    params: Promise.resolve({ id: "10000000-0000-4000-8000-000000000001" }),
  });
  expect(r.status).toBe(403);
  expect(await r.text()).not.toMatch(/unitCost|components|knownSubtotal/);
});
it("rejects foreign origins for admin mutations", async () => {
  context.requireActor.mockResolvedValue({ id: "owner", role: "admin" });
  const r = await POST(
    new Request("https://kybo.example/api/modifier-groups", {
      method: "POST",
      headers: {
        origin: "https://other.example",
        "content-type": "application/json",
      },
      body: "{}",
    }),
  );
  expect(r.status).toBe(403);
  expect(context.getDb).not.toHaveBeenCalled();
});
