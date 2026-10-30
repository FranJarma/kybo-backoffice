import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { betterAuth } from "better-auth";
import { username as usernamePlugin } from "better-auth/plugins/username";
import { branches, branchMemberships } from "../db/branch-schema";
import { hashPassword } from "better-auth/crypto";
import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { z } from "zod";
import type { AppDb } from "../db/client";
import type { Tx } from "../db/types";
import { getDb } from "../db/client";
import * as authSchema from "../db/auth-schema";
import {
  account,
  operationalUsers,
  user,
  session as authSession,
} from "../db/auth-schema";
import type { Actor } from "./access";
import { AppError } from "./errors";
import { trustedOrigins } from "./origins";
import { isPendingActivation } from "@/modules/invitations/queries";
import { finalizePasswordLogin } from "@/modules/invitations/authentication";
import { getStoreProfile } from "@/modules/workplace/access";

const authConfigurations = new WeakMap<object, { db: AppDb; secret: string }>();

export function createAuth(
  db: AppDb,
  options: { secret: string; baseURL: string; trustedOrigins?: string[] },
) {
  if (options.secret.length < 32)
    throw new Error("BETTER_AUTH_SECRET must contain at least 32 characters.");
  const auth = betterAuth({
    plugins: [usernamePlugin({ displayUsername: false })],
    database: drizzleAdapter(db, { provider: "pg", schema: authSchema }),
    secret: options.secret,
    baseURL: options.baseURL,
    trustedOrigins: trustedOrigins(options.baseURL, options.trustedOrigins),
    emailAndPassword: {
      enabled: true,
      disableSignUp: true,
      minPasswordLength: 8,
      maxPasswordLength: 128,
    },
    advanced: { useSecureCookies: process.env.NODE_ENV === "production" },
    rateLimit: {
      enabled: true,
      storage: "database",
      modelName: "rateLimit",
      window: 60,
      max: 60,
      customRules: {
        "/sign-in/email": { window: 60, max: 5 },
        "/sign-in/username": { window: 60, max: 5 },
      },
    },
  });
  authConfigurations.set(auth, { db, secret: options.secret });
  return auth;
}

export type KyboAuth = ReturnType<typeof createAuth>;

export async function handleAuthRequest(
  request: Request,
  auth: KyboAuth,
  allowedOrigins: string[],
): Promise<Response> {
  if (request.method !== "GET") {
    const origin = request.headers.get("origin");
    if (!origin || !allowedOrigins.includes(origin)) {
      return Response.json(
        { error: "Origen no permitido.", code: "FORBIDDEN" },
        {
          status: 403,
          headers: { "Cache-Control": "private, no-store" },
        },
      );
    }
  }
  const signIn =
    request.method === "POST" &&
    /^\/api\/auth\/sign-in\/(email|username)$/.test(
      new URL(request.url).pathname,
    );
  let password = "";
  if (signIn) {
    try {
      const raw = await request.clone().text();
      if (raw.length > 16000) throw new Error();
      const body = JSON.parse(raw);
      password = typeof body.password === "string" ? body.password : "";
    } catch {
      return Response.json(
        { error: "Revisá los datos de ingreso." },
        { status: 400, headers: { "Cache-Control": "private, no-store" } },
      );
    }
  }
  const response = await auth.handler(request);
  if (signIn && response.ok) {
    const config = authConfigurations.get(auth);
    const result = await response.clone().json();
    if (config && typeof result.token === "string") {
      try {
        const onboarding = await finalizePasswordLogin(config.db, {
          sessionToken: result.token,
          password,
          invitationToken: request.headers.get("X-Kybo-Invitation"),
          secret: config.secret,
          rpId: new URL(request.url).hostname,
        });
        const responseHeaders = new Headers(response.headers);
        responseHeaders.delete("Content-Length");
        responseHeaders.set("Cache-Control", "private, no-store");
        return Response.json(
          { ...result, onboarding },
          { status: response.status, headers: responseHeaders },
        );
      } catch (error) {
        // Never forward a cookie or token for a session whose activation failed.
        await config.db
          .delete(authSession)
          .where(eq(authSession.token, result.token));
        const status = error instanceof AppError ? error.status : 503;
        return Response.json(
          {
            error:
              error instanceof AppError
                ? error.message
                : "No pudimos completar el ingreso. Volvé a intentar.",
            code: error instanceof AppError ? error.code : "UNAVAILABLE",
          },
          { status, headers: { "Cache-Control": "private, no-store" } },
        );
      }
    }
  }
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}

let authPromise: Promise<KyboAuth> | undefined;

export async function getAuth(): Promise<KyboAuth> {
  if (!authPromise)
    authPromise = (async () => {
      const secret = process.env.BETTER_AUTH_SECRET;
      const baseURL = process.env.BETTER_AUTH_URL;
      if (!secret || !baseURL)
        throw new Error("BETTER_AUTH_SECRET and BETTER_AUTH_URL are required.");
      const trustedOrigins = process.env.BETTER_AUTH_TRUSTED_ORIGINS?.split(",")
        .map((origin) => origin.trim())
        .filter(Boolean);
      return createAuth(await getDb(), { secret, baseURL, trustedOrigins });
    })().catch((error: unknown) => {
      authPromise = undefined;
      throw error;
    });
  return authPromise;
}

export async function actorFromHeaders(
  requestHeaders: Headers,
  db: AppDb,
  auth: KyboAuth,
): Promise<Actor | null> {
  const session = await auth.api.getSession({ headers: requestHeaders });
  if (!session?.user?.id) return null;
  const [permissions] = await db
    .select({
      role: operationalUsers.role,
      disabled: operationalUsers.disabled,
      catalogManager: operationalUsers.catalogManager,
    })
    .from(operationalUsers)
    .where(eq(operationalUsers.userId, session.user.id))
    .limit(1);
  if (
    !permissions ||
    permissions.disabled ||
    (await isPendingActivation(db, session.user.id))
  )
    return null;
  const store = await getStoreProfile(db, session.user.id);
  if (
    store &&
    (!store.enabled ||
      permissions.role !== "staff" ||
      permissions.catalogManager)
  )
    return null;
  return permissions && !permissions.disabled
    ? {
        id: session.user.id,
        role: permissions.role,
        catalogManager: permissions.catalogManager,
        sessionId: session.session.id,
        accountKind: store ? "store" : "personal",
        ...(store ? { storeBranchId: store.branchId } : {}),
      }
    : null;
}

export async function requireActor(): Promise<Actor> {
  const actor = await actorFromHeaders(
    await headers(),
    await getDb(),
    await getAuth(),
  );
  if (!actor)
    throw new AppError("UNAUTHORIZED", "Iniciá sesión para continuar.", 401);
  return actor;
}

/** Internal provisioning. HTTP callers must first enforce live administrator authorization. */
export async function provisionUser(
  db: AppDb | Tx,
  input: {
    name: string;
    email?: string;
    username?: string;
    password: string;
    role: Actor["role"];
    branchId?: string;
  },
): Promise<string> {
  const name = input.name.trim();
  const username = input.username?.trim().toLowerCase();
  const suppliedEmail = input.email?.trim().toLowerCase();
  // Better Auth requires an email internally. This reserved domain cannot receive mail.
  const email = suppliedEmail || `${crypto.randomUUID()}@users.invalid`;
  if (
    !name ||
    (!suppliedEmail && !username) ||
    (input.username !== undefined &&
      (!username || !/^[a-z0-9_.]{3,30}$/.test(username))) ||
    !z.email().safeParse(email).success ||
    input.password.length < 8 ||
    input.password.length > 128 ||
    !(["admin", "manager", "staff"] as string[]).includes(input.role)
  ) {
    throw new AppError(
      "INVALID_INPUT",
      "Nombre, correo, contraseña o rol inválidos.",
      400,
    );
  }
  const passwordHash = await hashPassword(input.password);
  const id = crypto.randomUUID();
  await db.transaction(async (tx) => {
    if (input.branchId) {
      const [branch] = await tx
        .select()
        .from(branches)
        .where(eq(branches.id, input.branchId))
        .for("share");
      if (!branch || branch.archivedAt || input.role === "admin")
        throw new AppError("INVALID_INPUT", "Sucursal o rol inválidos.", 400);
    }
    await tx.insert(user).values({
      id,
      name,
      email,
      username,
      emailVerified: Boolean(suppliedEmail),
    });
    await tx.insert(account).values({
      id: crypto.randomUUID(),
      accountId: id,
      providerId: "credential",
      userId: id,
      password: passwordHash,
    });
    await tx.insert(operationalUsers).values({ userId: id, role: input.role });
    if (input.branchId)
      await tx
        .insert(branchMemberships)
        .values({ userId: id, branchId: input.branchId, role: input.role });
  });
  return id;
}
