import { beforeEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({
  actor: vi.fn(),
  store: vi.fn(),
  policy: vi.fn(),
  attempt: vi.fn(),
  ready: vi.fn(),
}));
vi.mock("@/db/client", () => ({ getDb: async () => ({}) }));
vi.mock("@/modules/branches/http", () => ({ operationalActor: m.actor }));
vi.mock("@/modules/workplace/access", () => ({ requireStoreAccount: m.store }));
vi.mock("@/modules/attendance/access", () => ({
  getAttendancePolicy: m.policy,
}));
vi.mock("@/modules/attendance/qr", () => ({
  openAttendanceQrAttempt: m.attempt,
  requireQrAccessReady: m.ready,
}));
vi.mock("@/lib/origins", () => ({
  configuredOrigins: () => ["http://localhost:3000"],
}));
import { GET, POST } from "@/app/api/attendance/qr/route";
const branchId = "11111111-1111-4111-8111-111111111111";
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("BETTER_AUTH_URL", "http://localhost:3000");
  vi.stubEnv(
    "BETTER_AUTH_SECRET",
    "a-test-only-secret-with-thirty-two-characters",
  );
  m.actor.mockResolvedValue({
    id: "store",
    role: "staff",
    accountKind: "store",
    branchId,
  });
  m.store.mockResolvedValue({ branchId });
  m.policy.mockResolvedValue({ enabled: true, revision: 1 });
  m.ready.mockResolvedValue(undefined);
  m.attempt.mockResolvedValue({
    id: crypto.randomUUID(),
    branchId,
    expiresAt: new Date(Date.now() + 120000).toISOString(),
  });
});
it("serves a private QR using configured origin and never a request-host override", async () => {
  const res = await GET(
    new Request("http://untrusted.example/api/attendance/qr"),
  );
  expect(res.status).toBe(200);
  expect(res.headers.get("cache-control")).toBe("private, no-store");
  const body = await res.json();
  expect(body.url).toMatch(
    /^http:\/\/localhost:3000\/staff\/attendance\/scan\?code=/,
  );
  expect(body.qrDataUrl).toMatch(/^data:image\/png;base64,/);
  expect(m.store).toHaveBeenCalled();
});
it("requires live store authorization and withdraws a disabled-branch QR", async () => {
  m.policy.mockResolvedValue({ enabled: false, revision: 1 });
  expect(
    (await GET(new Request("http://localhost:3000/api/attendance/qr"))).status,
  ).toBe(409);
  m.store.mockRejectedValue(
    Object.assign(new Error("denied"), { code: "FORBIDDEN", status: 403 }),
  );
  expect(
    (await GET(new Request("http://localhost:3000/api/attendance/qr"))).status,
  ).not.toBe(200);
});
it("uses only authenticated identity when opening a personal attempt and blocks foreign origins", async () => {
  const input = { code: "example", requestId: crypto.randomUUID() };
  const post = (body: unknown, origin = "http://localhost:3000") =>
    POST(
      new Request("http://localhost:3000/api/attendance/qr", {
        method: "POST",
        headers: { origin, "content-type": "application/json" },
        body: JSON.stringify(body),
      }),
    );
  expect((await post(input, "https://evil.example")).status).toBe(403);
  expect((await post({ ...input, userId: "other" })).status).toBe(400);
  expect(m.attempt).not.toHaveBeenCalled();
  expect((await post(input)).status).toBe(200);
  expect(m.attempt).toHaveBeenCalledWith(
    {},
    expect.objectContaining({ id: "store" }),
    input,
  );
});
