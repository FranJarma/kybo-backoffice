import { isIP } from "node:net";
import type { AppDb } from "@/db/client";
import {
  errorResponse,
  privateJson,
  requestInput,
} from "@/modules/catalog/http";
import { recoverySchemaReady } from "./contacts";
import { recoveryUnavailable, type CodeSender } from "./provider";
import type { RecoveryContext } from "./types";
import { createRecoveryService } from "./service";
import { recoveryInput } from "./validation";

export function recoveryClientKey(
  request: Request,
  vercel = process.env.VERCEL === "1",
) {
  if (!vercel) return "local-shared";
  const ip = (request.headers.get("x-vercel-forwarded-for") ?? "")
    .split(",")[0]
    .trim();
  return isIP(ip) ? ip : "vercel-missing-ip";
}
export async function handleRecoveryRequest(
  request: Request,
  db: AppDb | null,
  config: RecoveryContext | null,
  sender: CodeSender | null,
  schedule: (job: () => Promise<void>) => void,
) {
  try {
    if (request.method === "GET")
      return privateJson({
        available:
          !!config && !!db && !!sender && (await recoverySchemaReady(db)),
      });
    if (request.method !== "POST")
      return privateJson({ error: "Método no permitido." }, 405);
    const input = recoveryInput.parse(await requestInput(request, 2048));
    if (!config || !db || !sender || !(await recoverySchemaReady(db)))
      throw recoveryUnavailable();
    const service = createRecoveryService(db, config, sender),
      client = recoveryClientKey(request);
    if (input.action === "request") {
      const { deliver, ...result } = await service.request(
        input.identifier,
        client,
      );
      // Next keeps this callback alive after responding. Never leak callback errors
      // into logs; a failed/unfinished send requires a new request, not blind retries.
      schedule(async () => {
        try {
          await deliver();
        } catch {
          /* Sanitized, no user secrets logged. */
        }
      });
      return privateJson(result);
    }
    if (input.action === "verify")
      return privateJson(
        await service.verify(input.challengeId, input.code, client),
      );
    await service.reset(
      input.challengeId,
      input.token,
      input.newPassword,
      client,
    );
    return privateJson({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
