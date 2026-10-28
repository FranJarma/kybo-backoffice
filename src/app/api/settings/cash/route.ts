import { z } from "zod";
import { getDb } from "@/db/client";
import { operationalActor } from "@/modules/branches/http";
import {
  errorResponse,
  privateJson,
  requestInput,
} from "@/modules/catalog/http";
import { getCashSettings } from "@/modules/cash/queries";
import { runCashSettingsCommand } from "@/modules/cash/service";
export async function GET(request: Request) {
  try {
    return privateJson(
      await getCashSettings(await getDb(), await operationalActor(request)),
    );
  } catch (error) {
    return errorResponse(error);
  }
}
export async function POST(request: Request) {
  try {
    const actor = await operationalActor(request),
      input = z
        .object({ requestId: z.uuid(), command: z.unknown() })
        .strict()
        .parse(await requestInput(request));
    return privateJson(
      await runCashSettingsCommand(
        await getDb(),
        actor,
        input.requestId,
        input.command,
      ),
    );
  } catch (error) {
    return errorResponse(error);
  }
}
