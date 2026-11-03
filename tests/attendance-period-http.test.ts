import { beforeEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({
  db: {},
  actor: vi.fn(),
  preview: vi.fn(),
  ready: vi.fn(),
}));
vi.mock("@/db/client", () => ({ getDb: async () => m.db }));
vi.mock("@/modules/branches/http", () => ({ operationalActor: m.actor }));
vi.mock("@/lib/origins", () => ({
  configuredOrigins: () => ["http://localhost:3000"],
}));
vi.mock("@/modules/attendance/period-planning", () => ({
  previewAssignmentPeriod: m.preview,
}));
vi.mock("@/modules/identity/availability", () => ({
  identitySchemaReady: m.ready,
}));
import { POST } from "@/app/api/attendance/schedule-preview/route";
beforeEach(() => {
  vi.clearAllMocks();
  m.ready.mockResolvedValue(true);
  m.actor.mockResolvedValue({
    id: "manager",
    role: "manager",
    branchId: "11111111-1111-4111-8111-111111111111",
  });
  m.preview.mockResolvedValue({ shift: { revision: 1 }, rows: [] });
});
function request(origin = "http://localhost:3000") {
  return new Request("http://localhost:3000/api/attendance/schedule-preview", {
    method: "POST",
    headers: { origin, "content-type": "application/json" },
    body: JSON.stringify({
      userId: "person",
      shiftId: crypto.randomUUID(),
      from: "2026-11-02",
      to: "2026-11-08",
      weekdays: [1],
    }),
  });
}
it("serves a private, uncached preview with the authenticated branch actor", async () => {
  const response = await POST(request());
  expect(response.status).toBe(200);
  expect(response.headers.get("cache-control")).toBe("private, no-store");
  expect(m.preview).toHaveBeenCalledWith(
    m.db,
    expect.objectContaining({ id: "manager" }),
    expect.objectContaining({ userId: "person" }),
  );
});
it("rejects foreign origins and an unavailable attendance schema without planning", async () => {
  expect((await POST(request("https://untrusted.example"))).status).toBe(403);
  expect(m.preview).not.toHaveBeenCalled();
  m.ready.mockResolvedValue(false);
  expect((await POST(request())).status).toBe(503);
  expect(m.preview).not.toHaveBeenCalled();
});
