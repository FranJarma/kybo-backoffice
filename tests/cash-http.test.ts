import { beforeEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({
  db: {},
  actor: vi.fn(),
  snapshot: vi.fn(),
  command: vi.fn(),
  settings: vi.fn(),
  configure: vi.fn(),
  upload: vi.fn(),
  read: vi.fn(),
  storage: {},
}));
vi.mock("@/db/client", () => ({ getDb: async () => m.db }));
vi.mock("@/modules/branches/http", () => ({ operationalActor: m.actor }));
vi.mock("@/lib/origins", () => ({
  configuredOrigins: () => ["http://localhost:3000"],
}));
vi.mock("@/modules/cash/queries", () => ({
  getCashSnapshot: m.snapshot,
  getCashSettings: m.settings,
}));
vi.mock("@/modules/cash/service", () => ({
  runCashCommand: m.command,
  runCashSettingsCommand: m.configure,
}));
vi.mock("@/modules/cash/photos", () => ({
  uploadCashPhoto: m.upload,
  readCashPhoto: m.read,
  MAX_CASH_PHOTO_BYTES: 10 * 1024 * 1024,
}));
vi.mock("@/modules/media/storage", () => ({ photoStorage: () => m.storage }));
import { GET, POST } from "@/app/api/cash/route";
import { POST as configure } from "@/app/api/settings/cash/route";
import { POST as photo } from "@/app/api/cash/photos/route";
import { GET as readPhoto } from "@/app/api/cash/photos/[id]/route";
const branchId = "11111111-1111-4111-8111-111111111111",
  photoId = "22222222-2222-4222-8222-222222222222",
  sessionId = "33333333-3333-4333-8333-333333333333";
beforeEach(() => {
  vi.clearAllMocks();
  m.actor.mockImplementation(async (request: Request) => ({
    id: "admin",
    role: "admin",
    branchId: request.headers.get("X-Kybo-Branch-Id") ?? branchId,
  }));
  m.snapshot.mockResolvedValue({ available: true, branchId });
  m.command.mockResolvedValue({ available: true, branchId });
  m.configure.mockResolvedValue({ available: true, branchId });
});
function json(body: unknown, origin = "http://localhost:3000") {
  return new Request("http://localhost:3000/api/cash", {
    method: "POST",
    headers: { "content-type": "application/json", origin },
    body: JSON.stringify(body),
  });
}
it("uses private no-store reads and rejects malformed session IDs", async () => {
  const result = await GET(new Request("http://localhost:3000/api/cash"));
  expect(result.status).toBe(200);
  expect(result.headers.get("cache-control")).toBe("private, no-store");
  expect(
    (await GET(new Request("http://localhost:3000/api/cash?sessionId=bad")))
      .status,
  ).toBe(400);
});
it("rejects foreign-origin cash or settings commands without execution", async () => {
  const body = {
    requestId: crypto.randomUUID(),
    command: { action: "open", amount: "0.00" },
  };
  expect((await POST(json(body, "http://untrusted.test"))).status).toBe(403);
  expect((await configure(json(body, "http://untrusted.test"))).status).toBe(
    403,
  );
  expect(m.command).not.toHaveBeenCalled();
  expect(m.configure).not.toHaveBeenCalled();
});
it("rejects extra identity fields and passes an explicit branch to the command", async () => {
  const body = {
    requestId: crypto.randomUUID(),
    command: { action: "open", amount: "0.00" },
  };
  expect((await POST(json({ ...body, role: "admin" }))).status).toBe(400);
  const request = json(body);
  request.headers.set("X-Kybo-Branch-Id", sessionId);
  expect((await POST(request)).status).toBe(200);
  expect(m.command).toHaveBeenCalledWith(
    m.db,
    expect.objectContaining({ branchId: sessionId }),
    body.requestId,
    body.command,
  );
});
it("bounds the actual receipt body and rejects unsupported content without storage", async () => {
  const url = `http://localhost:3000/api/cash/photos?sessionId=${sessionId}`;
  const headers = {
    origin: "http://localhost:3000",
    "content-type": "image/svg+xml",
  };
  expect(
    (await photo(new Request(url, { method: "POST", headers, body: "<svg/>" })))
      .status,
  ).toBe(400);
  expect(
    (
      await photo(
        new Request(url, {
          method: "POST",
          headers: { ...headers, "content-type": "image/png" },
          body: new Uint8Array(10 * 1024 * 1024 + 1),
        }),
      )
    ).status,
  ).toBe(413);
  expect(m.upload).not.toHaveBeenCalled();
});
it("pins private image reads to the branch in the image URL even if another tab changes selection", async () => {
  m.read.mockResolvedValue(
    new ReadableStream({
      start(controller) {
        controller.enqueue(new Uint8Array([1]));
        controller.close();
      },
    }),
  );
  const response = await readPhoto(
    new Request(
      `http://localhost:3000/api/cash/photos/${photoId}?branchId=${sessionId}`,
    ),
    { params: Promise.resolve({ id: photoId }) },
  );
  expect(response.status).toBe(200);
  expect(response.headers.get("cache-control")).toBe("private, no-store");
  expect(m.read).toHaveBeenCalledWith(
    m.db,
    expect.objectContaining({ branchId: sessionId }),
    photoId,
    m.storage,
  );
});
