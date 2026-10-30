import type { Actor } from "@/lib/access";
import { AppError } from "@/lib/errors";

/** A manager token is deliberately irrelevant to the ordinary operational API. */
export function assertStoreHttpAccess(actor: Partial<Actor>, request: Request) {
  if (actor.accountKind !== "store") return;
  const path = new URL(request.url).pathname,
    method = request.method.toUpperCase();
  const pos =
    /^\/api\/sales(?:\/|$)/.test(path) || /^\/api\/pickup(?:\/|$)/.test(path);
  const permitted =
    (pos && ["GET", "POST"].includes(method)) ||
    (path === "/api/fulfillment/state" && method === "GET") ||
    (path === "/api/fulfillment/deliver" && method === "POST") ||
    (path === "/api/cash/status" && method === "GET") ||
    (path === "/api/attendance/qr" && method === "GET") ||
    (path === "/api/workplace" && ["GET", "POST"].includes(method));
  if (!permitted)
    throw new AppError(
      "FORBIDDEN",
      "La cuenta del local solo permite atender pedidos, mostrar el QR y autorizar la gestión del turno.",
      403,
    );
}
