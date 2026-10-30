import { z } from "zod";
import { getDb } from "@/db/client";
import { operationalActor } from "@/modules/branches/http";
import {
  requestInput,
  privateJson,
  errorResponse,
} from "@/modules/catalog/http";
import { identitySchemaReady } from "@/modules/identity/availability";
import { getAttendanceSnapshot } from "@/modules/attendance/queries";
import { runAttendanceCommand } from "@/modules/attendance/service";
import { AppError } from "@/lib/errors";
export const runtime = "nodejs";
export async function GET(request: Request) {
  try {
    const actor = await operationalActor(request),
      db = await getDb();
    if (!(await identitySchemaReady(db)))
      return privateJson({
        ready: false,
        message:
          "Asistencia todavía no fue habilitada en esta instalación. Administración debe completar la activación.",
      });
    const url = new URL(request.url),
      filters: Record<string, string> = {};
    for (const key of ["from", "to", "userId"])
      if (url.searchParams.has(key)) filters[key] = url.searchParams.get(key)!;
    return privateJson({
      ready: true,
      ...(await getAttendanceSnapshot(db, actor, filters)),
    });
  } catch (error) {
    return errorResponse(error);
  }
}
export async function POST(request: Request) {
  try {
    const input = z
      .object({ requestId: z.uuid(), command: z.unknown() })
      .strict()
      .parse(await requestInput(request, 32000));
    const actor = await operationalActor(request),
      db = await getDb();
    if (!(await identitySchemaReady(db)))
      throw new AppError(
        "ATTENDANCE_SETUP",
        "Administración debe completar la activación de Asistencia antes de guardar.",
        503,
      );
    return privateJson(
      await runAttendanceCommand(db, actor, input.requestId, input.command),
    );
  } catch (error) {
    return errorResponse(error);
  }
}
