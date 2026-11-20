import { getDb } from "@/db/client";
import { operationalActor } from "@/modules/branches/http";
import {
  requestInput,
  privateJson,
  errorResponse,
} from "@/modules/catalog/http";
import { identitySchemaReady } from "@/modules/identity/availability";
import { previewAssignmentPeriod } from "@/modules/attendance/period-planning";
import { AppError } from "@/lib/errors";

export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
    const input = await requestInput(request, 32000);
    const actor = await operationalActor(request);
    const db = await getDb();
    if (!(await identitySchemaReady(db)))
      throw new AppError(
        "ATTENDANCE_SETUP",
        "Administración debe completar la activación de Asistencia antes de asignar horarios.",
        503,
      );
    return privateJson(await previewAssignmentPeriod(db, actor, input));
  } catch (error) {
    return errorResponse(error);
  }
}
