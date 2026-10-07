import { z } from "zod";
import { getDb } from "@/db/client";
import { inventoryResponse } from "@/modules/inventory/http";
import { createTransferService } from "@/modules/transfers/service";
import { AppError } from "@/lib/errors";
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string; action: string }> },
) {
  return inventoryResponse(request, async (actor, input) => {
    const { id, action } = await params;
    z.uuid().parse(id);
    const service = createTransferService(await getDb());
    if (action === "cancel")
      return service.cancel(
        actor,
        actor.branchId!,
        id,
        z
          .object({
            requestId: z.uuid(),
            expectedRevision: z.number().int().positive(),
          })
          .strict()
          .parse(input),
      );
    if (action === "dispatch")
      return service.dispatch(
        actor,
        actor.branchId!,
        id,
        z
          .object({
            requestId: z.uuid(),
            expectedRevision: z.number().int().positive(),
          })
          .strict()
          .parse(input),
      );
    if (action === "receive")
      return service.receive(actor, actor.branchId!, id, input);
    if (action === "resolve")
      return service.resolveDifference(actor, actor.branchId!, id, input);
    throw new AppError("NOT_FOUND", "La acción no existe.", 404);
  });
}
