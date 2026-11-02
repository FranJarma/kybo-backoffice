import { getDb } from "@/db/client";
import { operationalActor } from "@/modules/branches/http";
import { requireAdministrator } from "@/modules/branches/context";
import { errorResponse } from "@/modules/catalog/http";
import { printingInstaller } from "@/modules/printing/installer";
export const runtime = "nodejs";
export async function GET(request: Request) {
  try {
    const actor = await operationalActor(request);
    await requireAdministrator(await getDb(), actor);
    return new Response(await printingInstaller(), {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Content-Disposition":
          'attachment; filename="Instalar-Kybo-Impresion.ps1"',
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
