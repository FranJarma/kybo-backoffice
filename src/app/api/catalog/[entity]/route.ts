import {
  catalogContext,
  privateJson,
  errorResponse,
  requestInput,
} from "@/modules/catalog/http";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ entity: string }> };
export async function GET(request: Request, context: Context) {
  try {
    const { actor, entity, service } = await catalogContext(
      (await context.params).entity,
    );
    const url = new URL(request.url);
    return privateJson(
      await service.listRecords(
        actor,
        entity,
        url.searchParams.get("q") ?? "",
        url.searchParams.get("archived") === "1",
      ),
    );
  } catch (error) {
    return errorResponse(error);
  }
}
export async function POST(request: Request, context: Context) {
  try {
    const { actor, entity, service } = await catalogContext(
      (await context.params).entity,
    );
    const input = await requestInput(request);
    return privateJson(
      { row: await service.createRecord(actor, entity, input) },
      201,
    );
  } catch (error) {
    return errorResponse(error);
  }
}
