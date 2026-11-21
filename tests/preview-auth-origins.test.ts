import { afterEach, expect, it, vi } from "vitest";
import { handleAuthRequest, type KyboAuth } from "../src/lib/auth";
import { configuredOrigins } from "../src/lib/origins";

const deployment = "kybo-backoffice-1vnjntrhv-franjarmaprojects.vercel.app";
const branch =
  "kybo-backoffice-git-feature-ux-ui-pos-2f4359-franjarmaprojects.vercel.app";

afterEach(() => vi.unstubAllEnvs());

it.each([deployment, branch])(
  "lets the current preview %s reach credential validation",
  async (host) => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("VERCEL", "1");
    vi.stubEnv("VERCEL_ENV", "preview");
    vi.stubEnv("VERCEL_URL", deployment);
    vi.stubEnv("VERCEL_BRANCH_URL", branch);
    vi.stubEnv("BETTER_AUTH_URL", "https://kybo.example");
    vi.stubEnv("BETTER_AUTH_TRUSTED_ORIGINS", "");
    // No credentials or database: reaching the handler is the origin gate's contract.
    const handler = vi.fn(async () =>
      Response.json({ code: "INVALID_INPUT" }, { status: 400 }),
    );
    const auth = { handler } as unknown as KyboAuth;
    const response = await handleAuthRequest(
      new Request(`https://${host}/api/auth/sign-in/username`, {
        method: "POST",
        headers: {
          Origin: `https://${host}`,
          "Content-Type": "application/json",
        },
        body: "{}",
      }),
      auth,
      configuredOrigins(),
    );
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ code: "INVALID_INPUT" });
    expect(handler).toHaveBeenCalledOnce();

    const denied = await handleAuthRequest(
      new Request(`https://${host}/api/auth/sign-in/username`, {
        method: "POST",
        headers: {
          Origin: "https://another-project.vercel.app",
          "Content-Type": "application/json",
        },
        body: "{}",
      }),
      auth,
      configuredOrigins(),
    );
    expect(denied.status).toBe(403);
    await expect(denied.json()).resolves.toMatchObject({ code: "FORBIDDEN" });
    expect(handler).toHaveBeenCalledOnce();
  },
);
