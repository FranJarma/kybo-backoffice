import { getDb } from "@/db/client";
import { operationalActor } from "@/modules/branches/http";
import { errorResponse, privateJson } from "@/modules/catalog/http";
import { getCashStatus } from "@/modules/cash/queries";
export async function GET(request: Request) {
  try {
    return privateJson(
      await getCashStatus(await getDb(), await operationalActor(request)),
    );
  } catch (error) {
    return errorResponse(error);
  }
}
