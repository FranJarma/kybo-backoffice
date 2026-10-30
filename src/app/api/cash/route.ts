import { z } from "zod";
import { getDb } from "@/db/client";
import { operationalActor } from "@/modules/branches/http";
import {
  errorResponse,
  privateJson,
  requestInput,
} from "@/modules/catalog/http";
import { getCashSnapshot } from "@/modules/cash/queries";
import { runCashCommand } from "@/modules/cash/service";
export const runtime = "nodejs";
export async function GET(request: Request) {
  try {
    const actor = await operationalActor(request),
      sessionId = z
        .uuid()
        .optional()
        .parse(new URL(request.url).searchParams.get("sessionId") ?? undefined);
    return privateJson(await getCashSnapshot(await getDb(), actor, sessionId));
  } catch (error) {
    return errorResponse(error);
  }
}
export async function POST(request: Request) {
  try {
    const actor = await operationalActor(request),
      input = z
        .object({
          requestId: z.uuid(),
          command: z.unknown(),
          verificationId: z.uuid().optional(),
        })
        .strict()
        .parse(await requestInput(request, 64000));
    const db = await getDb();
    return privateJson(
      input.verificationId
        ? await runCashCommand(
            db,
            actor,
            input.requestId,
            input.command,
            undefined,
            input.verificationId,
          )
        : await runCashCommand(db, actor, input.requestId, input.command),
    );
  } catch (error) {
    return errorResponse(error);
  }
}
