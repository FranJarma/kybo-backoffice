import { cookies } from "next/headers";
import { getDb } from "@/db/client";
import { catalogResponse } from "@/modules/catalog/http";
import { catalogProductCosts } from "@/modules/catalog/product-costs";
export async function POST(request: Request) {
  return catalogResponse(null, async (actor) => {
    const { requestInput } = await import("@/modules/catalog/http");
    const input = await requestInput(request);
    return catalogProductCosts(
      await getDb(),
      { ...actor, branchId: (await cookies()).get("kybo-branch")?.value },
      input,
    );
  });
}
