import { beforeEach, expect, it, vi } from "vitest";
import { AppError } from "@/lib/errors";

const mocks = vi.hoisted(() => ({
  actor: vi.fn(),
  lock: vi.fn(),
  insert: vi.fn(),
  remove: vi.fn(),
  profile: vi.fn(),
  revoke: vi.fn(),
}));
vi.mock("@/modules/workplace/access", () => ({
  getStoreProfile: mocks.profile,
  workplaceSchemaReady: async () => true,
}));
vi.mock("@/lib/auth", () => ({ requireActor: mocks.actor }));
vi.mock("@/modules/users/service", () => ({
  lockUserAdministration: mocks.lock,
}));
vi.mock("@/db/client", () => ({
  getDb: async () => ({
    transaction: async (run: (tx: unknown) => unknown) =>
      run({
        insert: mocks.insert,
        delete: () => ({ where: mocks.remove }),
        update: () => ({ set: () => ({ where: mocks.revoke }) }),
      }),
  }),
}));
import { PUT } from "@/app/api/branches/[id]/members/route";
const branchId = crypto.randomUUID();
const request = () =>
  new Request(`http://localhost:3000/api/branches/${branchId}/members`, {
    method: "PUT",
    headers: {
      Origin: "http://localhost:3000",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ userId: "employee", role: "staff", revoked: false }),
  });
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("BETTER_AUTH_URL", "http://localhost:3000");
  mocks.actor.mockResolvedValue({ id: "owner", role: "admin" });
  mocks.lock.mockResolvedValue([{ userId: "employee", disabled: false }]);
  mocks.insert.mockReturnValue({
    values: () => ({ onConflictDoUpdate: async () => undefined }),
  });
  mocks.profile.mockResolvedValue(null);
});
it("uses the shared administration locks before changing branch access", async () => {
  expect(
    (await PUT(request(), { params: Promise.resolve({ id: branchId }) }))
      .status,
  ).toBe(200);
  expect(mocks.lock).toHaveBeenCalledWith(expect.anything(), {
    id: "owner",
    role: "admin",
  });
  expect(mocks.lock).toHaveBeenCalledBefore(mocks.insert);
  expect(mocks.remove).toHaveBeenCalledOnce();
  expect(mocks.revoke).toHaveBeenCalledOnce();
});
it("does not change memberships after administrator revocation", async () => {
  mocks.lock.mockRejectedValue(
    new AppError("FORBIDDEN", "Acceso revocado", 403),
  );
  expect(
    (await PUT(request(), { params: Promise.resolve({ id: branchId }) }))
      .status,
  ).toBe(403);
  expect(mocks.insert).not.toHaveBeenCalled();
});
