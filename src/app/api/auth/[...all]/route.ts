import { getAuth, handleAuthRequest } from "@/lib/auth";
import { configuredOrigins } from "@/lib/origins";

export const dynamic = "force-dynamic";

async function handle(request: Request): Promise<Response> {
  const auth = await getAuth();
  return handleAuthRequest(request, auth, configuredOrigins());
}

export { handle as GET, handle as POST };
