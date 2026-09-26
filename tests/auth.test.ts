import { afterEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb } from "./helpers/database";
import { operationalUsers, rateLimit, user } from "../src/db/schema";
import {
  actorFromHeaders,
  createAuth,
  handleAuthRequest,
  provisionUser,
} from "../src/lib/auth";

const origin = "http://localhost:3000";
const secret = "test-only-long-random-configuration-secret-123456789";
const password = "StrongPassword-12345!";
const contexts: Awaited<ReturnType<typeof createTestDb>>[] = [];

afterEach(async () => {
  await Promise.all(contexts.splice(0).map(({ close }) => close()));
});

async function setup() {
  const context = await createTestDb();
  contexts.push(context);
  const auth = createAuth(context.db, { secret, baseURL: origin });
  await provisionUser(context.db, {
    name: "Titular",
    email: "owner@example.test",
    password,
    role: "admin",
  });
  return { ...context, auth };
}

async function request(
  auth: ReturnType<typeof createAuth>,
  path: string,
  body: unknown,
  cookie?: string,
) {
  return auth.handler(
    new Request(`${origin}/api/auth${path}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin,
        ...(cookie ? { cookie } : {}),
      },
      body: JSON.stringify(body),
    }),
  );
}

describe("private authentication", () => {
  it.each([
    {
      email: "valid@example.test",
      password: "x".repeat(129),
      caseName: "a password longer than 128 characters",
    },
    {
      email: "a..b@example.test",
      password,
      caseName: "an email rejected by Better Auth",
    },
  ])("does not provision $caseName", async ({ email, password: candidate }) => {
    const context = await createTestDb();
    contexts.push(context);
    await expect(
      provisionUser(context.db, {
        name: "Invalid",
        email,
        password: candidate,
        role: "admin",
      }),
    ).rejects.toMatchObject({ code: "INVALID_INPUT", status: 400 });
    expect(await context.db.select().from(user)).toHaveLength(0);
  });

  it("rejects a bad password and creates no session cookie", async () => {
    const { auth, db } = await setup();
    const response = await request(auth, "/sign-in/email", {
      email: "owner@example.test",
      password: "wrong-password",
    });
    expect(response.status).toBeGreaterThanOrEqual(400);
    expect(response.headers.get("set-cookie") ?? "").not.toContain(
      "session_token",
    );
    expect((await db.select().from(rateLimit)).length).toBeGreaterThan(0);
  });

  it("rejects cross-origin sign-in requests", async () => {
    const { auth } = await setup();
    const response = await handleAuthRequest(
      new Request(`${origin}/api/auth/sign-in/email`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: "https://attacker.example",
        },
        body: JSON.stringify({ email: "owner@example.test", password }),
      }),
      auth,
      [origin],
    );
    expect(response.status).toBe(403);
    expect(response.headers.get("set-cookie") ?? "").not.toContain(
      "session_token",
    );
  });

  it("resolves a valid session against the server-owned role", async () => {
    const { auth, db } = await setup();
    const response = await request(auth, "/sign-in/email", {
      email: "owner@example.test",
      password,
    });
    expect(response.status).toBe(200);
    const cookie = response.headers.get("set-cookie")?.split(";")[0];
    expect(cookie).toBeTruthy();
    await expect(
      actorFromHeaders(new Headers({ cookie: cookie ?? "" }), db, auth),
    ).resolves.toMatchObject({ role: "admin" });
  });

  it("revokes business access immediately when a user is disabled", async () => {
    const { auth, db } = await setup();
    const response = await request(auth, "/sign-in/email", {
      email: "owner@example.test",
      password,
    });
    const cookie = response.headers.get("set-cookie")?.split(";")[0];
    const actor = await actorFromHeaders(
      new Headers({ cookie: cookie ?? "" }),
      db,
      auth,
    );
    expect(actor).not.toBeNull();
    await db
      .update(operationalUsers)
      .set({ disabled: true })
      .where(eq(operationalUsers.userId, actor!.id));
    await expect(
      actorFromHeaders(new Headers({ cookie: cookie ?? "" }), db, auth),
    ).resolves.toBeNull();
  });

  it("rejects public sign-up and cannot update its own operational role", async () => {
    const { auth, db } = await setup();
    const signup = await request(auth, "/sign-up/email", {
      name: "Intruder",
      email: "new@example.test",
      password,
    });
    expect(signup.status).toBeGreaterThanOrEqual(400);
    const login = await request(auth, "/sign-in/email", {
      email: "owner@example.test",
      password,
    });
    const cookie = login.headers.get("set-cookie")?.split(";")[0];
    await request(
      auth,
      "/update-user",
      { role: "staff", disabled: true },
      cookie,
    );
    await expect(
      actorFromHeaders(new Headers({ cookie: cookie ?? "" }), db, auth),
    ).resolves.toMatchObject({ role: "admin" });
  });
});
