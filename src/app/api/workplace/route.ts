import { z } from "zod";
import { getDb } from "@/db/client";
import { requireActor } from "@/lib/auth";
import { operationalActor } from "@/modules/branches/http";
import {
  errorResponse,
  privateJson,
  requestInput,
} from "@/modules/catalog/http";
import {
  authorizeManagement,
  createStoreAccount,
  getManagementSnapshot,
  getWorkplaceSummary,
  runManagementCommand,
} from "@/modules/workplace/service";
export const runtime = "nodejs";
export async function GET(request: Request) {
  try {
    const actor = await operationalActor(request),
      params = new URL(request.url).searchParams;
    if (params.get("view") === "summary")
      return privateJson(await getWorkplaceSummary(await getDb(), actor));
    const date = z.iso.date().parse(params.get("date"));
    return privateJson(
      await getManagementSnapshot(
        await getDb(),
        actor,
        request.headers.get("X-Kybo-Management") ?? "",
        date,
      ),
    );
  } catch (error) {
    return errorResponse(error);
  }
}
export async function POST(request: Request) {
  try {
    const raw = await requestInput(request);
    const envelope = z.object({ action: z.string() }).passthrough().parse(raw);
    if (envelope.action === "createStore") {
      const input = {
        requestId: envelope.requestId,
        branchId: envelope.branchId,
        name: envelope.name,
        username: envelope.username,
        password: envelope.password,
      };
      return privateJson(
        await createStoreAccount(await getDb(), await requireActor(), input),
      );
    }
    const actor = await operationalActor(request),
      db = await getDb();
    if (envelope.action === "authorize") {
      const input = z
        .object({
          action: z.literal("authorize"),
          identifier: z.string(),
          password: z.string(),
        })
        .strict()
        .parse(raw);
      return privateJson(
        await authorizeManagement(db, actor, {
          identifier: input.identifier,
          password: input.password,
        }),
      );
    }
    return privateJson(
      await runManagementCommand(
        db,
        actor,
        request.headers.get("X-Kybo-Management") ?? "",
        raw,
      ),
    );
  } catch (error) {
    return errorResponse(error);
  }
}
