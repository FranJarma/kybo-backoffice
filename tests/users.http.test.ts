import { beforeEach, expect, it, vi } from "vitest";
import { AppError } from "@/lib/errors";
const mocks = vi.hoisted(() => ({
  actor: vi.fn(),
  guard: vi.fn(),
  list: vi.fn(),
  save: vi.fn(),
}));
vi.mock("@/lib/auth", () => ({ requireActor: mocks.actor }));
vi.mock("@/db/client", () => ({ getDb: async () => ({}) }));
vi.mock("@/modules/users/service", () => ({
  requireUserAdministrator: mocks.guard,
  listUsers: mocks.list,
  saveUser: mocks.save,
}));
import { GET, POST } from "@/app/api/settings/users/route";
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("BETTER_AUTH_URL", "http://localhost:3000");
  mocks.actor.mockResolvedValue({ id: "admin", role: "admin" });
  mocks.guard.mockResolvedValue(undefined);
  mocks.list.mockResolvedValue({
    currentUserId: "admin",
    rows: [],
    branches: [],
  });
  mocks.save.mockResolvedValue({ id: "employee", replayed: false });
});
it("keeps the user list and successful writes private", async () => {
  expect((await GET()).headers.get("cache-control")).toContain("no-store");
  const response = await POST(
    new Request("http://localhost:3000/api/settings/users", {
      method: "POST",
      headers: {
        Origin: "http://localhost:3000",
        "Content-Type": "application/json",
      },
      body: "{}",
    }),
  );
  expect(response.status).toBe(200);
  expect(response.headers.get("cache-control")).toContain("no-store");
  expect(mocks.guard).toHaveBeenCalledBefore(mocks.save);
});
it("denies anonymous access and checks administrator rights before reading mutation input", async () => {
  mocks.actor.mockRejectedValueOnce(
    new AppError("UNAUTHORIZED", "Ingresá", 401),
  );
  expect((await GET()).status).toBe(401);
  mocks.guard.mockRejectedValue(
    new AppError("FORBIDDEN", "Solo administradores", 403),
  );
  const response = await POST(
    new Request("http://localhost:3000/api/settings/users", { method: "POST" }),
  );
  expect(response.status).toBe(403);
  expect(mocks.save).not.toHaveBeenCalled();
});
it("rejects unrelated origins and never performs the mutation", async () => {
  const response = await POST(
    new Request("http://localhost:3000/api/settings/users", {
      method: "POST",
      headers: {
        Origin: "https://otro.example",
        "Content-Type": "application/json",
      },
      body: "{}",
    }),
  );
  expect(response.status).toBe(403);
  expect(mocks.save).not.toHaveBeenCalled();
});
