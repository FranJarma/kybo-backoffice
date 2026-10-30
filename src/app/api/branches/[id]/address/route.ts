import { getDb } from "@/db/client";
import { requireActor } from "@/lib/auth";
import {
  privateJson,
  requestInput,
  errorResponse,
} from "@/modules/catalog/http";
import {
  readBranchAddress,
  saveBranchAddress,
} from "@/modules/branches/address";
export const runtime = "nodejs";
type Params = { params: Promise<{ id: string }> };
export async function GET(_request: Request, { params }: Params) {
  try {
    return privateJson(
      await readBranchAddress(
        await getDb(),
        await requireActor(),
        (await params).id,
      ),
    );
  } catch (error) {
    return errorResponse(error);
  }
}
export async function PUT(request: Request, { params }: Params) {
  try {
    const input = await requestInput(request, 8000);
    return privateJson(
      await saveBranchAddress(
        await getDb(),
        await requireActor(),
        (await params).id,
        input,
      ),
    );
  } catch (error) {
    return errorResponse(error);
  }
}
