import { beforeEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({
  db: {},
  actor: vi.fn(),
  ready: vi.fn(),
  list: vi.fn(),
  beginRegistration: vi.fn(),
  finishRegistration: vi.fn(),
  beginVerification: vi.fn(),
  finishVerification: vi.fn(),
  revoke: vi.fn(),
}));
vi.mock("@/db/client", () => ({ getDb: async () => m.db }));
vi.mock("@/modules/branches/http", () => ({ operationalActor: m.actor }));
vi.mock("@/lib/origins", () => ({
  configuredOrigins: () => ["http://localhost:3000"],
}));
vi.mock("@/modules/identity/availability", () => ({
  identitySchemaReady: m.ready,
}));
vi.mock("@/modules/identity/service", () => ({
  listCredentials: m.list,
  beginRegistration: m.beginRegistration,
  finishRegistration: m.finishRegistration,
  beginVerification: m.beginVerification,
  finishVerification: m.finishVerification,
  revokeCredential: m.revoke,
}));
import { GET, POST } from "@/app/api/identity/route";
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv(
    "BETTER_AUTH_SECRET",
    "identity-http-test-secret-at-least-32-characters",
  );
  m.ready.mockResolvedValue(true);
  m.actor.mockResolvedValue({
    id: "staff",
    role: "staff",
    branchId: "11111111-1111-4111-8111-111111111111",
  });
  m.list.mockResolvedValue([]);
  m.beginVerification.mockResolvedValue({
    challengeId: crypto.randomUUID(),
    options: {},
  });
});
function json(body: unknown, origin = "http://localhost:3000") {
  return new Request("http://localhost:3000/api/identity", {
    method: "POST",
    headers: { origin, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}
it("does not cache credential metadata or use unconfigured origins for RP identity", async () => {
  expect(
    (await GET(new Request("http://localhost:3000/api/identity"))).headers.get(
      "cache-control",
    ),
  ).toBe("private, no-store");
  expect(
    (
      await POST(
        json(
          { action: "register-options", password: "x", name: "Phone" },
          "https://evil.example",
        ),
      )
    ).status,
  ).toBe(403);
  expect(m.beginRegistration).not.toHaveBeenCalled();
});
it("binds an operation to the session branch and rejects an injected user or branch", async () => {
  const body = {
    action: "verification-options",
    binding: {
      action: "attendance-punch",
      requestId: crypto.randomUUID(),
      payload: { action: "punch", kind: "entry" },
    },
  };
  expect((await POST(json(body))).status).toBe(200);
  expect(m.beginVerification).toHaveBeenCalledWith(
    m.db,
    expect.objectContaining({ id: "staff" }),
    expect.objectContaining({
      branchId: "11111111-1111-4111-8111-111111111111",
    }),
    expect.objectContaining({
      rpId: "localhost",
      origin: "http://localhost:3000",
    }),
  );
  expect((await POST(json({ ...body, userId: "admin" }))).status).toBe(400);
  expect(
    (
      await POST(
        json({
          ...body,
          binding: { ...body.binding, branchId: crypto.randomUUID() },
        }),
      )
    ).status,
  ).toBe(400);
});
