import { getDb } from "@/db/client";
import { catalogResponse } from "@/modules/catalog/http";
import { createSourcingService } from "@/modules/sourcing/service";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ id: string }> };
export async function GET(_request: Request, context: Context) {
  return catalogResponse(null, async (actor) =>
    createSourcingService(await getDb()).list(actor, (await context.params).id),
  );
}
export async function POST(request: Request, context: Context) {
  return catalogResponse(request, async (actor, input) =>
    createSourcingService(await getDb()).write(
      actor,
      (await context.params).id,
      input,
    ),
  );
}
