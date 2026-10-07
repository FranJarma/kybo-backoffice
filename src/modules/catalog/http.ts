import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { requireActor } from "@/lib/auth";
import { AppError } from "@/lib/errors";
import { configuredOrigins } from "@/lib/origins";
import { entities, type Entity } from "./types";
import { createCatalogService } from "./service";
import type { Actor } from "@/lib/access";
import { ZodError } from "zod";
import { headers, cookies } from "next/headers";
import { operationalActor } from "../branches/http";

export function entityFromParam(value: string): Entity {
  if (!entities.includes(value as Entity))
    throw new AppError("NOT_FOUND", "El módulo no existe.", 404);
  return value as Entity;
}

export function privateJson(data: unknown, status = 200) {
  return NextResponse.json(data, {
    status,
    headers: {
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

export function errorResponse(error: unknown) {
  if (error instanceof ZodError)
    return privateJson(
      { error: "Revisá los campos ingresados.", code: "VALIDATION" },
      400,
    );
  if (error instanceof AppError)
    return privateJson(
      { error: error.message, code: error.code },
      error.status,
    );
  // SQL/provider errors may contain customer data. Do not echo or log them here.
  return privateJson(
    {
      error: "No pudimos guardar o consultar los datos. Volvé a intentar.",
      code: "UNAVAILABLE",
    },
    503,
  );
}

export async function requestInput(
  request: Request,
  maxBytes = 20000,
): Promise<unknown> {
  const origin = request.headers.get("origin");
  if (!origin || !configuredOrigins().includes(origin))
    throw new AppError(
      "FORBIDDEN",
      "El origen de la solicitud no está autorizado.",
      403,
    );
  if (!request.headers.get("content-type")?.includes("application/json"))
    throw new AppError("VALIDATION", "Se requiere JSON.", 400);
  const reader = request.body?.getReader();
  if (!reader) throw new AppError("VALIDATION", "Faltan los datos.", 400);
  const parts: Uint8Array[] = [];
  let length = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    length += value.length;
    if (length > maxBytes) {
      await reader.cancel();
      throw new AppError(
        "VALIDATION",
        "La solicitud es demasiado grande.",
        413,
      );
    }
    parts.push(value);
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const part of parts) {
    bytes.set(part, offset);
    offset += part.length;
  }
  try {
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new AppError("VALIDATION", "Los datos no son JSON válido.", 400);
  }
}

export async function catalogContext(value: string) {
  const actor = await requireActor();
  if (actor.role !== "admin" && !actor.catalogManager)
    actor.branchId =
      (await headers()).get("X-Kybo-Branch-Id") ??
      (await cookies()).get("kybo-branch")?.value;
  const entity = entityFromParam(value);
  return { actor, entity, service: createCatalogService(await getDb()) };
}
export async function catalogResponse(
  request: Request | null,
  action: (actor: Actor, input: unknown) => Promise<unknown>,
) {
  try {
    let actor = await requireActor();
    if (actor.role !== "admin" && actor.catalogManager !== true) {
      const readOnly =
        !request || new URL(request.url).pathname.endsWith("/cost");
      if (!readOnly)
        throw new AppError(
          "FORBIDDEN",
          "No tenés permiso para gestionar el catálogo compartido.",
          403,
        );
      actor = await operationalActor(request);
      if (actor.role === "staff")
        throw new AppError(
          "FORBIDDEN",
          "Se requiere permiso de encargado.",
          403,
        );
    }
    return privateJson(
      await action(actor, request ? await requestInput(request) : undefined),
    );
  } catch (error) {
    return errorResponse(error);
  }
}
