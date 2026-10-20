import { z } from "zod";
import { getDb } from "@/db/client";
import {
  catalogContext,
  privateJson,
  errorResponse,
} from "@/modules/catalog/http";
import { productSetupOptions } from "@/modules/products/onboarding";
export async function GET(request: Request) {
  try {
    const { actor } = await catalogContext("products");
    const id = new URL(request.url).searchParams.get("productId");
    return privateJson(
      await productSetupOptions(
        await getDb(),
        actor,
        id ? z.uuid().parse(id) : undefined,
      ),
    );
  } catch (error) {
    return errorResponse(error);
  }
}
