import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { AppError } from "@/lib/errors";
import { z } from "zod";
const mocks = vi.hoisted(() => ({
  actor: vi.fn(),
  command: vi.fn(),
  read: vi.fn(),
}));
vi.mock("@/modules/branches/http", () => ({ operationalActor: mocks.actor }));
vi.mock("@/db/client", () => ({ getDb: async () => ({}) }));
vi.mock("@/modules/overheads/service", () => ({
  getExpenses: mocks.read,
  expenseCommand: vi.fn(),
}));
vi.mock("@/modules/operations/command", () => ({
  executeCommand: mocks.command,
}));
import { GET, POST } from "@/app/api/finance/expenses/route";
beforeEach(() => {
  vi.stubEnv("BETTER_AUTH_URL", "https://kybo.example");
  vi.stubEnv("BETTER_AUTH_TRUSTED_ORIGINS", "");
  mocks.actor.mockResolvedValue({
    id: "manager",
    role: "manager",
    branchId: "branch",
  });
  mocks.command.mockResolvedValue({ result: { revision: 1 } });
  mocks.read.mockResolvedValue({ month: "2026-09" });
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});
const request = (command: unknown, origin = "https://kybo.example") =>
  new Request("https://kybo.example/api/finance/expenses", {
    method: "POST",
    headers: { Origin: origin, "Content-Type": "application/json" },
    body: JSON.stringify({
      requestId: "c1abe7ce-2b8e-41b6-bfd0-9db4b388f9d1",
      command,
    }),
  });
it("accepts the full allowed monthly document including Unicode observations", async () => {
  const command = {
    action: "save",
    month: "2026-09",
    revision: 0,
    expectedUnits: 4000,
    entries: Array.from({ length: 100 }, () => ({
      category: "other",
      concept: "費".repeat(120),
      budget: "2000",
      actual: "2100",
      notes: "費".repeat(1000),
    })),
  };
  expect((await POST(request(command))).status).toBe(200);
  expect(mocks.command).toHaveBeenCalled();
});
it("keeps a bounded payload and checks origin and authentication", async () => {
  expect((await POST(request({ notes: "x".repeat(600000) }))).status).toBe(413);
  expect((await POST(request({}, "https://external.example"))).status).toBe(
    403,
  );
  expect(mocks.command).not.toHaveBeenCalled();
  mocks.actor.mockRejectedValue(
    new AppError("UNAUTHORIZED", "Iniciá sesión", 401),
  );
  const response = await GET(
    new Request("https://kybo.example/api/finance/expenses"),
  );
  expect(response.status).toBe(401);
  expect(response.headers.get("cache-control")).toBe("private, no-store");
});

it("identifies the exact invalid expense field instead of returning a generic error", async () => {
  mocks.command.mockRejectedValueOnce(
    new z.ZodError([
      {
        code: "too_small",
        origin: "string",
        minimum: 1,
        inclusive: true,
        path: ["entries", 0, "concept"],
        message: "Describí el gasto al elegir «Otros».",
      },
    ]),
  );
  const response = await POST(request({}));
  expect(response.status).toBe(400);
  expect(await response.json()).toMatchObject({
    error: "Descripción del gasto 1: Describí el gasto al elegir «Otros».",
    fields: { "entries.0.concept": "Describí el gasto al elegir «Otros»." },
  });
});
