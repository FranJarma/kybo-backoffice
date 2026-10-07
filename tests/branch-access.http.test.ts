import { beforeEach, expect, it, vi } from "vitest";
import { AppError } from "../src/lib/errors";
const mocks = vi.hoisted(() => ({
  actor: vi.fn(),
  context: vi.fn(),
  cookies: vi.fn(),
  db: {},
}));
vi.mock("../src/lib/auth", () => ({ requireActor: mocks.actor }));
vi.mock("../src/db/client", () => ({ getDb: async () => mocks.db }));
vi.mock("../src/modules/branches/context", () => ({
  requireOperationalContext: mocks.context,
}));
vi.mock("next/headers", () => ({
  cookies: mocks.cookies,
  headers: async () => new Headers(),
}));
import { operationalActor } from "../src/modules/branches/http";
beforeEach(() => {
  vi.clearAllMocks();
  mocks.actor.mockResolvedValue({ id: "session-user", role: "manager" });
  mocks.cookies.mockResolvedValue({ get: () => ({ value: "cookie-branch" }) });
});
it("uses the authenticated identity and explicit branch header, never the body role", async () => {
  mocks.context.mockResolvedValue({
    actorId: "session-user",
    branchId: "header-branch",
    timeZone: "UTC",
    role: "staff",
  });
  const actor = await operationalActor(
    new Request("https://kybo.example/api/sales", {
      method: "POST",
      headers: { "X-Kybo-Branch-Id": "header-branch" },
      body: JSON.stringify({
        actorId: "admin",
        branchId: "foreign",
        role: "admin",
      }),
    }),
  );
  expect(mocks.context).toHaveBeenCalledWith(
    mocks.db,
    { id: "session-user", role: "manager" },
    "header-branch",
  );
  expect(actor).toEqual({
    id: "session-user",
    branchId: "header-branch",
    timeZone: "UTC",
    role: "staff",
  });
});
it("does not construct an operational actor for a foreign branch", async () => {
  mocks.context.mockRejectedValue(
    new AppError("FORBIDDEN", "Sin membresía.", 403),
  );
  await expect(
    operationalActor(
      new Request("https://kybo.example", {
        headers: { "X-Kybo-Branch-Id": "foreign" },
      }),
    ),
  ).rejects.toMatchObject({ status: 403 });
});
