import {
  catalogContext,
  privateJson,
  errorResponse,
  requestInput,
} from "@/modules/catalog/http";
export const dynamic = "force-dynamic";
export async function PATCH(
  request: Request,
  context: { params: Promise<{ entity: string; id: string }> },
) {
  try {
    const params = await context.params;
    const { actor, entity, service } = await catalogContext(params.entity);
    const input = await requestInput(request);
    return privateJson({
      row: await service.updateRecord(actor, entity, params.id, input),
    });
  } catch (error) {
    return errorResponse(error);
  }
}
