import { eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { user } from "@/db/auth-schema";
import { requireActor } from "@/lib/auth";
import { privateJson, errorResponse } from "@/modules/catalog/http";
import { onboardingState } from "@/modules/invitations/authentication";
export async function GET(request: Request) {
  try {
    const actor = await requireActor(),
      db = await getDb();
    const [profile] = await db
      .select({ name: user.name })
      .from(user)
      .where(eq(user.id, actor.id));
    return privateJson({
      name: profile?.name ?? "",
      onboarding: await onboardingState(
        db,
        actor,
        new URL(request.url).hostname,
      ),
    });
  } catch (error) {
    return errorResponse(error);
  }
}
