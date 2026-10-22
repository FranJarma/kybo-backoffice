import { z } from "zod";
import { getDb } from "@/db/client";
import { operationalActor } from "@/modules/branches/http";
import {
  errorResponse,
  privateJson,
  requestInput,
} from "@/modules/catalog/http";
import { runTaskCommand } from "@/modules/daily-operations/commands";
import { dailyOperationError } from "@/modules/daily-operations/http";
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const actor = await operationalActor(request),
      id = z.uuid().parse((await params).id);
    return privateJson(
      await runTaskCommand(
        await getDb(),
        actor,
        id,
        await requestInput(request),
      ),
    );
  } catch (e) {
    return errorResponse(dailyOperationError(e));
  }
}
