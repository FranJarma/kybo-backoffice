import QRCode from "qrcode";
import { z } from "zod";
import { getDb } from "@/db/client";
import { AppError } from "@/lib/errors";
import { relyingParty } from "@/modules/identity/crypto";
import { operationalActor } from "@/modules/branches/http";
import {
  errorResponse,
  privateJson,
  requestInput,
} from "@/modules/catalog/http";
import { requireStoreAccount } from "@/modules/workplace/access";
import { getAttendancePolicy } from "@/modules/attendance/access";
import { issueAttendanceQr } from "@/modules/attendance/qr-token";
import { attendanceQrPath } from "@/modules/attendance/qr-link";
import {
  openAttendanceQrAttempt,
  requireQrAccessReady,
} from "@/modules/attendance/qr";
export const runtime = "nodejs";
export async function GET(request: Request) {
  try {
    const actor = await operationalActor(request),
      db = await getDb();
    await requireQrAccessReady(db);
    const store = await requireStoreAccount(db, actor);
    const policy = await getAttendancePolicy(db, store.branchId);
    if (!policy.enabled)
      throw new AppError(
        "ATTENDANCE_DISABLED",
        "Administración debe habilitar Asistencia en esta sucursal antes de mostrar el QR.",
        409,
      );
    const now = new Date();
    const token = issueAttendanceQr(
      store.branchId,
      policy.revision,
      process.env.BETTER_AUTH_SECRET ?? "",
      now,
    );
    const origin = relyingParty(process.env.BETTER_AUTH_URL ?? "").origin;
    const url = origin + attendanceQrPath(token.code);
    return privateJson({
      ...token,
      url,
      now: now.toISOString(),
      qrDataUrl: await QRCode.toDataURL(url, {
        errorCorrectionLevel: "M",
        margin: 4,
        width: 560,
        color: { dark: "#071b42", light: "#ffffff" },
      }),
    });
  } catch (error) {
    return errorResponse(error);
  }
}
export async function POST(request: Request) {
  try {
    const input = z
      .object({ code: z.string().min(1).max(180), requestId: z.uuid() })
      .strict()
      .parse(await requestInput(request, 2048));
    const actor = await operationalActor(request);
    return privateJson(
      await openAttendanceQrAttempt(await getDb(), actor, input),
    );
  } catch (error) {
    return errorResponse(error);
  }
}
