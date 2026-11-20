import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  request: vi.fn(),
  verify: vi.fn(),
  reset: vi.fn(),
  ready: vi.fn(),
}));
vi.mock("@/modules/password-recovery/service", () => ({
  createRecoveryService: () => ({
    request: mocks.request,
    verify: mocks.verify,
    reset: mocks.reset,
  }),
}));
vi.mock("@/modules/password-recovery/contacts", () => ({
  recoverySchemaReady: mocks.ready,
}));
import type { AppDb } from "@/db/client";
import {
  handleRecoveryRequest,
  recoveryClientKey,
} from "@/modules/password-recovery/http";
const config = {
  secret: "fake-private-key-for-recovery-32-characters",
  accessToken: "fake-token-only",
  phoneNumberId: "123456789",
  apiVersion: "v25.0",
  templateName: "test_template",
  language: "es_AR",
};
const db = {} as AppDb,
  sender = { sendCode: vi.fn() },
  jobs: Array<() => Promise<void>> = [];
const id = "11111111-1111-4111-8111-111111111111";
const request = (body: unknown, origin = "http://localhost:3000") =>
  new Request("http://localhost:3000/api/account/recovery", {
    method: "POST",
    headers: { Origin: origin, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
const run = (req: Request, configured: typeof config | null = config) =>
  handleRecoveryRequest(req, db, configured, sender, (job) => {
    jobs.push(job);
  });
beforeEach(() => {
  vi.clearAllMocks();
  jobs.length = 0;
  vi.stubEnv("BETTER_AUTH_URL", "http://localhost:3000");
  mocks.ready.mockResolvedValue(true);
  mocks.request.mockResolvedValue({
    challengeId: id,
    expiresIn: 300,
    retryAfter: 60,
    message: "Respuesta uniforme",
    deliver: vi.fn(),
  });
  mocks.verify.mockResolvedValue({ token: "a".repeat(43), expiresIn: 300 });
  mocks.reset.mockResolvedValue(undefined);
});
it("keeps request data private and schedules delivery after the response", async () => {
  const response = await run(
    request({ action: "request", identifier: "test_user" }),
  );
  expect(response.status).toBe(200);
  expect(response.headers.get("cache-control")).toContain("no-store");
  expect(await response.json()).toEqual({
    challengeId: id,
    expiresIn: 300,
    retryAfter: 60,
    message: "Respuesta uniforme",
  });
  expect(jobs).toHaveLength(1);
  const deliver = (await mocks.request.mock.results[0].value).deliver;
  expect(deliver).not.toHaveBeenCalled();
  await jobs[0]();
  expect(deliver).toHaveBeenCalledOnce();
});
it("does not expose delivery errors or log their private message", async () => {
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  mocks.request.mockResolvedValue({
    challengeId: id,
    deliver: async () => {
      throw new Error("private code and provider token");
    },
  });
  await run(request({ action: "request", identifier: "test_user" }));
  await expect(jobs[0]()).resolves.toBeUndefined();
  expect(log).not.toHaveBeenCalled();
  log.mockRestore();
});
it("rejects requests from other origins before touching the service", async () => {
  expect(
    (
      await run(
        request(
          { action: "request", identifier: "test_user" },
          "https://evil.invalid",
        ),
      )
    ).status,
  ).toBe(403);
  expect(mocks.request).not.toHaveBeenCalled();
});
it("rejects oversized JSON and extra phone destinations", async () => {
  expect(
    (
      await run(
        request({
          action: "request",
          identifier: "test_user",
          phone: "+5491100000001",
        }),
      )
    ).status,
  ).toBe(400);
  expect(
    (await run(request({ action: "request", identifier: "a".repeat(5000) })))
      .status,
  ).toBe(413);
  expect(mocks.request).not.toHaveBeenCalled();
});
it("reports real unavailability when transport or migration is absent", async () => {
  expect(
    (await run(request({ action: "request", identifier: "test_user" }), null))
      .status,
  ).toBe(503);
  mocks.ready.mockResolvedValue(false);
  expect(
    (await run(request({ action: "request", identifier: "test_user" }))).status,
  ).toBe(503);
  expect(mocks.request).not.toHaveBeenCalled();
});
it("only returns a reset grant after code verification", async () => {
  const response = await run(
    request({ action: "verify", challengeId: id, code: "012345" }),
  );
  expect(await response.json()).toEqual({
    token: "a".repeat(43),
    expiresIn: 300,
  });
  expect(response.headers.get("set-cookie")).toBeNull();
});
it("validates confirmation before resetting and never logs the user in", async () => {
  const input = {
    action: "reset",
    challengeId: id,
    token: "a".repeat(43),
    newPassword: "Test-only-password-123",
    confirmPassword: "different-password",
  };
  expect((await run(request(input))).status).toBe(400);
  expect(mocks.reset).not.toHaveBeenCalled();
  const response = await run(
    request({ ...input, confirmPassword: input.newPassword }),
  );
  expect(await response.json()).toEqual({ ok: true });
  expect(response.headers.get("set-cookie")).toBeNull();
});
it("uses trusted Vercel forwarding only on Vercel; local callers cannot invent identities", () => {
  const req = new Request("http://localhost:3000/api/account/recovery", {
    headers: {
      "x-vercel-forwarded-for": "203.0.113.8",
      "x-forwarded-for": "203.0.113.9",
    },
  });
  expect(recoveryClientKey(req, false)).toBe("local-shared");
  expect(recoveryClientKey(req, true)).toBe("203.0.113.8");
});
