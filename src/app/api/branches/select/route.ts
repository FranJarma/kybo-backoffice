import { cookies } from "next/headers";
import { z } from "zod";
import { requireActor } from "@/lib/auth";
import { AppError } from "@/lib/errors";
import { getDb } from "@/db/client";
import { requireOperationalContext } from "@/modules/branches/context";
import {
  privateJson,
  errorResponse,
  requestInput,
} from "@/modules/catalog/http";
export async function POST(request: Request) {
  try {
    const actor = await requireActor();
    if (actor.role === "staff")
      throw new AppError(
        "FORBIDDEN",
        "Tu sucursal la asigna el encargado.",
        403,
      );
    const { branchId } = z
      .object({ branchId: z.uuid() })
      .strict()
      .parse(await requestInput(request));
    await requireOperationalContext(await getDb(), actor, branchId);
    (await cookies()).set("kybo-branch", branchId, {
      sameSite: "lax",
      secure: new URL(request.url).protocol === "https:",
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
    });
    return privateJson({ branchId });
  } catch (error) {
    return errorResponse(error);
  }
}
