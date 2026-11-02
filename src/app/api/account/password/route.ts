import { getDb } from "@/db/client";
import { getAuth } from "@/lib/auth";
import { handlePasswordRequest } from "@/modules/password-policy/http";
export const runtime = "nodejs";
async function handle(request: Request) {
  const [db, auth] = await Promise.all([getDb(), getAuth()]);
  const response = await handlePasswordRequest(request, db, auth);
  response.headers.set("X-Kybo-Password-Policy", "24h-v1");
  return response;
}
export async function GET(request: Request) {
  return handle(request);
}
export async function POST(request: Request) {
  return handle(request);
}
