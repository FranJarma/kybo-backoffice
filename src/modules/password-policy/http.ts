import { eq } from "drizzle-orm";
import type { AppDb } from "@/db/client";
import type { KyboAuth } from "@/lib/auth";
import type { Actor } from "@/lib/access";
import { operationalUsers } from "@/db/auth-schema";
import { AppError } from "@/lib/errors";
import { getStoreProfile } from "@/modules/workplace/access";
import { isPendingActivation } from "@/modules/invitations/queries";
import {
  requestInput,
  privateJson,
  errorResponse,
} from "@/modules/catalog/http";
import { passwordPolicyState, changeOwnPassword } from "./service";

/** The only expired-account read exception: own password status, never business data. */
export async function passwordActor(
  db: AppDb,
  auth: KyboAuth,
  headers: Headers,
): Promise<Actor> {
  const current = await auth.api.getSession({ headers });
  if (!current?.user?.id)
    throw new AppError("UNAUTHORIZED", "Iniciá sesión para continuar.", 401);
  const [access] = await db
    .select()
    .from(operationalUsers)
    .where(eq(operationalUsers.userId, current.user.id));
  if (
    !access ||
    access.disabled ||
    (await isPendingActivation(db, current.user.id))
  )
    throw new AppError(
      "UNAUTHORIZED",
      "La cuenta no está disponible. Consultá con Administración.",
      401,
    );
  if (await getStoreProfile(db, current.user.id))
    throw new AppError(
      "FORBIDDEN",
      "La cuenta del local se administra desde Usuarios.",
      403,
    );
  return {
    id: current.user.id,
    role: access.role,
    sessionId: current.session.id,
    accountKind: "personal",
  };
}
export async function handlePasswordRequest(
  request: Request,
  db: AppDb,
  auth: KyboAuth,
) {
  try {
    const input =
      request.method === "POST" ? await requestInput(request, 2048) : undefined;
    const actor = await passwordActor(db, auth, request.headers);
    if (request.method === "GET")
      return privateJson(await passwordPolicyState(db, actor.id));
    if (request.method !== "POST")
      return privateJson({ error: "Método no permitido." }, 405);
    await changeOwnPassword(db, actor, input);
    return privateJson({
      ok: true,
      state: await passwordPolicyState(db, actor.id),
    });
  } catch (error) {
    return errorResponse(error);
  }
}
