import { and, eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { requireActor } from "@/lib/auth";
import { requireCatalogManagement } from "@/modules/branches/context";
import {
  productFulfillments,
  productFulfillmentVersions,
} from "@/db/product-fulfillment-schema";
import { publishFulfillment } from "@/modules/products/fulfillment";
import {
  catalogResponse,
  privateJson,
  errorResponse,
} from "@/modules/catalog/http";
type Params = { params: Promise<{ id: string }> };
export async function GET(_request: Request, { params }: Params) {
  try {
    const actor = await requireActor(),
      db = await getDb(),
      { id } = await params;
    await requireCatalogManagement(db, actor);
    const [version] = await db
      .select({ version: productFulfillmentVersions })
      .from(productFulfillments)
      .innerJoin(
        productFulfillmentVersions,
        and(
          eq(productFulfillmentVersions.id, productFulfillments.versionId),
          eq(
            productFulfillmentVersions.productId,
            productFulfillments.productId,
          ),
        ),
      )
      .where(eq(productFulfillments.productId, id));
    return privateJson(version?.version ?? null);
  } catch (error) {
    return errorResponse(error);
  }
}
export async function POST(request: Request, { params }: Params) {
  return catalogResponse(request, async (actor, input) => {
    const { id } = await params;
    return (await getDb()).transaction((tx) =>
      publishFulfillment(
        tx,
        { actorId: actor.id, role: actor.role },
        id,
        input,
      ),
    );
  });
}
