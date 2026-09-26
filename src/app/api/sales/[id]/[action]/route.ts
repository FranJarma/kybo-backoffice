import { getDb } from "@/db/client";
import { AppError } from "@/lib/errors";
import { createSalesService } from "@/modules/sales/service";
import { salesResponse } from "@/modules/sales/http";
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string; action: string }> },
) {
  return salesResponse(request, async (actor, input) => {
    const { id, action } = await params,
      service = createSalesService(await getDb());
    if (action === "orders") return service.addOrder(actor, id, input);
    if (action === "payments") return service.pay(actor, id, input);
    if (action === "cancel") return service.cancel(actor, id, input);
    throw new AppError("NOT_FOUND", "La operación no existe.", 404);
  });
}
