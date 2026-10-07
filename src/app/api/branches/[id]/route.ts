import { z } from "zod";
import { getDb } from "@/db/client";
import { requireActor } from "@/lib/auth";
import { archiveBranch } from "@/modules/branches/service";
import {
  privateJson,
  errorResponse,
  requestInput,
} from "@/modules/catalog/http";

// Logical archival only. The service rejects stock and unresolved work.
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const input = z
      .object({ revision: z.number().int().positive() })
      .strict()
      .parse(await requestInput(request));
    return privateJson(
      await archiveBranch(
        await getDb(),
        await requireActor(),
        z.uuid().parse(id),
        input.revision,
      ),
    );
  } catch (error) {
    return errorResponse(error);
  }
}
