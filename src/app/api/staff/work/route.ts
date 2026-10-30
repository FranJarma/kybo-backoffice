import { getDb } from "@/db/client";
import { operationalActor } from "@/modules/branches/http";
import { errorResponse, privateJson } from "@/modules/catalog/http";
import { getStaffWork } from "@/modules/staff-work/queries";

export async function GET(request: Request) {
  try {
    const actor = await operationalActor(request);
    return privateJson(await getStaffWork(await getDb(), actor));
  } catch (error) {
    return errorResponse(error);
  }
}
