import { beforeEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({
  db: {},
  actor: vi.fn(),
  snapshot: vi.fn(),
  command: vi.fn(),
  ready: vi.fn(),
}));
vi.mock("@/db/client", () => ({ getDb: async () => m.db }));
vi.mock("@/modules/branches/http", () => ({ operationalActor: m.actor }));
vi.mock("@/lib/origins", () => ({
  configuredOrigins: () => ["http://localhost:3000"],
}));
vi.mock("@/modules/attendance/queries", () => ({
  getAttendanceSnapshot: m.snapshot,
}));
vi.mock("@/modules/attendance/service", () => ({
  runAttendanceCommand: m.command,
}));
vi.mock("@/modules/identity/availability", () => ({
  identitySchemaReady: m.ready,
}));
import { GET, POST } from "@/app/api/attendance/route";
beforeEach(() => {
  vi.clearAllMocks();
  m.ready.mockResolvedValue(true);
  m.actor.mockResolvedValue({
    id: "staff",
    role: "staff",
    branchId: "11111111-1111-4111-8111-111111111111",
  });
  m.snapshot.mockResolvedValue({ events: [], manualRequests: [] });
  m.command.mockResolvedValue({ id: crypto.randomUUID() });
});
function json(body: unknown, origin = "http://localhost:3000") {
  return new Request("http://localhost:3000/api/attendance", {
    method: "POST",
    headers: { origin, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}
it("serves private no-store attendance and passes filters within the session scope", async () => {
  const result = await GET(
    new Request(
      "http://localhost:3000/api/attendance?from=2026-10-29&to=2026-10-30",
    ),
  );
  expect(result.status).toBe(200);
  expect(result.headers.get("cache-control")).toBe("private, no-store");
  expect(m.snapshot).toHaveBeenCalledWith(
    m.db,
    expect.objectContaining({ id: "staff" }),
    { from: "2026-10-29", to: "2026-10-30" },
  );
});
it("rejects foreign origins and injected actor fields without executing mutations", async () => {
  const body = {
    requestId: crypto.randomUUID(),
    command: { action: "punch", kind: "entry" },
  };
  expect((await POST(json(body, "https://untrusted.example"))).status).toBe(
    403,
  );
  expect((await POST(json({ ...body, actorId: "admin" }))).status).toBe(400);
  expect(m.command).not.toHaveBeenCalled();
});
it("reports an installation awaiting activation without creating tables or reading missing relations", async () => {
  m.ready.mockResolvedValue(false);
  const result = await GET(new Request("http://localhost:3000/api/attendance"));
  expect((await result.json()).ready).toBe(false);
  expect(m.snapshot).not.toHaveBeenCalled();
});
