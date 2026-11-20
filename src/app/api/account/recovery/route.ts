import { after } from "next/server";
import { getDb } from "@/db/client";
import { errorResponse } from "@/modules/catalog/http";
import { handleRecoveryRequest } from "@/modules/password-recovery/http";
import {
  createGmailCodeSender,
  readEmailRecoveryConfig,
} from "@/modules/password-recovery/gmail-provider";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;
async function handle(request: Request) {
  try {
    const config = readEmailRecoveryConfig();
    return handleRecoveryRequest(
      request,
      config ? await getDb() : null,
      config,
      config ? createGmailCodeSender(config) : null,
      (job) => after(job),
    );
  } catch (error) {
    return errorResponse(error);
  }
}
export const GET = handle;
export const POST = handle;
