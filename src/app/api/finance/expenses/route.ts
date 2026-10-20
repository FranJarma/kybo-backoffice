import { z } from "zod";
import { getDb } from "@/db/client";
import { operationalActor } from "@/modules/branches/http";
import {
  errorResponse,
  privateJson,
  requestInput,
} from "@/modules/catalog/http";
import { executeCommand } from "@/modules/operations/command";
import { expenseCommand, getExpenses } from "@/modules/overheads/service";
import {
  expenseValidationFeedback,
  ExpenseValidationError,
} from "@/modules/overheads/validation";
export async function GET(request: Request) {
  try {
    const actor = await operationalActor(request);
    return privateJson(
      await getExpenses(
        await getDb(),
        actor,
        new URL(request.url).searchParams.get("month") ?? undefined,
      ),
    );
  } catch (e) {
    if (e instanceof ExpenseValidationError)
      return privateJson(
        { error: e.message, fields: e.fields, code: e.code },
        e.status,
      );
    if (e instanceof z.ZodError)
      return privateJson(
        { ...expenseValidationFeedback(e), code: "VALIDATION" },
        400,
      );
    return errorResponse(e);
  }
}
export async function POST(request: Request) {
  try {
    const actor = await operationalActor(request);
    const { requestId, command } = z
      .object({ requestId: z.uuid(), command: z.unknown() })
      .strict()
      // A month allows 100 concepts with 1,000 Unicode characters of notes each.
      .parse(await requestInput(request, 512 * 1024));
    return privateJson(
      await executeCommand(
        await getDb(),
        actor,
        actor.branchId!,
        { requestId },
        "business-expenses",
        command,
        (tx, ctx, id) => expenseCommand(tx, ctx, id, command),
      ),
    );
  } catch (e) {
    if (e instanceof ExpenseValidationError)
      return privateJson(
        { error: e.message, fields: e.fields, code: e.code },
        e.status,
      );
    if (e instanceof z.ZodError)
      return privateJson(
        { ...expenseValidationFeedback(e), code: "VALIDATION" },
        400,
      );
    return errorResponse(e);
  }
}
