import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { AppError } from "@/lib/errors";

const mocks = vi.hoisted(() => ({
  actor: vi.fn(),
  read: vi.fn(),
  storage: {},
}));
vi.mock("@/lib/auth", () => ({ requireActor: mocks.actor }));
vi.mock("@/db/client", () => ({ getDb: async () => ({}) }));
vi.mock("@/modules/media/service", () => ({ readPhoto: mocks.read }));
vi.mock("@/modules/media/storage", () => ({
  photoStorage: () => mocks.storage,
}));
import { GET } from "@/app/api/media/[id]/route";

const id = "d33b24b6-17ae-44f8-822e-300fab371b38";
const request = (query = "", headers?: HeadersInit) =>
  new Request(`http://localhost/api/media/${id}${query}`, { headers });
const context = { params: Promise.resolve({ id }) };
beforeEach(() => {
  mocks.actor.mockResolvedValue({ id: "owner", role: "admin" });
  mocks.read.mockImplementation(async () => new Response("webp fixture").body);
});
afterEach(() => vi.resetAllMocks());

it("allows private browser reuse and varies by the signed-in session", async () => {
  const response = await GET(request("?size=thumbnail"), context);
  expect(response.status).toBe(200);
  expect(response.headers.get("cache-control")).toMatch(
    /private.*max-age=86400.*immutable/,
  );
  expect(response.headers.get("vary")).toBe("Cookie");
  expect(response.headers.get("content-type")).toBe("image/webp");
  expect(response.headers.get("etag")).toBeTruthy();
  expect(mocks.read).toHaveBeenCalledWith(
    {},
    { id: "owner", role: "admin" },
    id,
    mocks.storage,
    "thumbnail",
  );
});

it("uses different validators for thumbnail and preview, and revalidates without a body", async () => {
  const thumbnail = await GET(request("?size=thumbnail"), context);
  const preview = await GET(request("?size=preview"), context);
  expect(thumbnail.headers.get("etag")).not.toBe(preview.headers.get("etag"));
  const repeated = await GET(
    request("?size=thumbnail", {
      "If-None-Match": thumbnail.headers.get("etag")!,
    }),
    context,
  );
  expect(repeated.status).toBe(304);
  expect(await repeated.text()).toBe("");
});

it("keeps original URLs working and rejects arbitrary resize sizes", async () => {
  expect((await GET(request(), context)).status).toBe(200);
  expect(mocks.read).toHaveBeenLastCalledWith(
    {},
    expect.anything(),
    id,
    mocks.storage,
    "original",
  );
  mocks.read.mockClear();
  expect((await GET(request("?size=999999"), context)).status).toBe(400);
  expect(mocks.read).not.toHaveBeenCalled();
});

it("does not cache missing photos, failures or anonymous responses, even with a validator", async () => {
  const etag = (await GET(request(), context)).headers.get("etag")!;
  mocks.actor.mockRejectedValueOnce(
    new AppError("UNAUTHORIZED", "Ingresá", 401),
  );
  const anonymous = await GET(request("", { "If-None-Match": etag }), context);
  expect(anonymous.status).toBe(401);
  expect(anonymous.headers.get("cache-control")).toBe("private, no-store");
  mocks.read.mockResolvedValueOnce(null);
  const missing = await GET(request(), context);
  expect(missing.status).toBe(404);
  expect(missing.headers.get("cache-control")).toBe("private, no-store");
  mocks.read.mockRejectedValueOnce(new Error("provider failure"));
  const failure = await GET(request(), context);
  expect(failure.status).toBe(503);
  expect(failure.headers.get("cache-control")).toBe("private, no-store");
});
