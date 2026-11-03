import { z } from "zod";
import { getDb } from "@/db/client";
import { operationalActor } from "@/modules/branches/http";
import {
  errorResponse,
  privateJson,
  requestInput,
} from "@/modules/catalog/http";
import {
  getPrintingSnapshot,
  runPrintingCommand,
} from "@/modules/printing/service";
export const runtime = "nodejs";
export async function GET(request: Request) {
  try {
    return privateJson(
      await getPrintingSnapshot(
        await getDb(),
        await operationalActor(request),
        new URL(request.url).searchParams.get("saleId") ?? undefined,
      ),
    );
  } catch (error) {
    return errorResponse(error);
  }
}
export async function POST(request: Request) {
  try {
    const input = z
      .object({ requestId: z.uuid(), command: z.unknown() })
      .strict()
      .parse(await requestInput(request, 12000));
    return privateJson(
      await runPrintingCommand(
        await getDb(),
        await operationalActor(request),
        input.requestId,
        input.command,
      ),
    );
  } catch (error) {
    return errorResponse(error);
  }
}
