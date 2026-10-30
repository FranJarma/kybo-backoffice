"use client";

import type {
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
} from "@simplewebauthn/browser";
export class RequestFailure extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}
export async function privateRequest<T>(
  url: string,
  branchId: string,
  body?: unknown,
  signal?: AbortSignal,
): Promise<T> {
  const response = await fetch(url, {
    method: body === undefined ? "GET" : "POST",
    credentials: "same-origin",
    cache: "no-store",
    signal,
    headers: {
      "X-Kybo-Branch-Id": branchId,
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const result = await response.json();
  if (!response.ok)
    throw new RequestFailure(
      (typeof result.error === "string"
        ? result.error
        : result.error?.message) ??
        result.message ??
        "No pudimos completar la operación. Volvé a intentar.",
      response.status,
    );
  return result;
}
function compatible() {
  if (!window.isSecureContext || !window.PublicKeyCredential)
    throw new Error(
      "Usá un celular compatible y abrí Kybo con una conexión HTTPS para verificar tu identidad.",
    );
}
function deviceError(error: unknown): never {
  if (error instanceof RequestFailure) throw error;
  if (
    error instanceof Error &&
    (error.name === "NotAllowedError" || error.name === "AbortError")
  )
    throw new Error(
      "La verificación se canceló o venció. La operación no se realizó.",
    );
  if (error instanceof Error && error.name === "InvalidStateError")
    throw new Error(
      "Este dispositivo ya tiene una credencial registrada para esta cuenta.",
    );
  throw error;
}
export async function enrollIdentity(
  branchId: string,
  password: string,
  name: string,
) {
  compatible();
  const api = await import("@simplewebauthn/browser");
  try {
    const start = await privateRequest<{
      challengeId: string;
      options: PublicKeyCredentialCreationOptionsJSON;
    }>("/api/identity", branchId, {
      action: "register-options",
      password,
      name,
    });
    const response = await api.startRegistration({
      optionsJSON: start.options,
    });
    return await privateRequest("/api/identity", branchId, {
      action: "register-response",
      challengeId: start.challengeId,
      response,
    });
  } catch (error) {
    deviceError(error);
  }
}
export async function verifyIdentity(
  branchId: string,
  action: "attendance-punch" | "production-start" | "cash-close",
  requestId: string,
  payload: unknown,
) {
  compatible();
  const api = await import("@simplewebauthn/browser");
  try {
    const start = await privateRequest<{
      challengeId: string;
      options: PublicKeyCredentialRequestOptionsJSON;
    }>("/api/identity", branchId, {
      action: "verification-options",
      binding: { action, requestId, payload },
    });
    const response = await api.startAuthentication({
      optionsJSON: start.options,
    });
    const proof = await privateRequest<{ proofId: string }>(
      "/api/identity",
      branchId,
      {
        action: "verification-response",
        challengeId: start.challengeId,
        response,
      },
    );
    return proof.proofId;
  } catch (error) {
    deviceError(error);
  }
}
export function currentLocation(): Promise<{
  latitude: number;
  longitude: number;
  accuracy: number;
  measuredAt: string;
}> {
  if (!navigator.geolocation)
    return Promise.reject(
      new Error(
        "Este dispositivo no permite consultar la ubicación. Pedí ayuda al encargado.",
      ),
    );
  return new Promise((resolve, reject) =>
    navigator.geolocation.getCurrentPosition(
      (position) =>
        resolve({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
          measuredAt: new Date(position.timestamp).toISOString(),
        }),
      (error) =>
        reject(
          new Error(
            error.code === 1
              ? "Permití el acceso a la ubicación para fichar junto al local."
              : "No pudimos obtener una ubicación precisa. Acercate al local y volvé a intentar.",
          ),
        ),
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 },
    ),
  );
}
export async function operationConfirmation(
  action: "production-start" | "cash-close",
  requestId: string,
  payload: unknown,
  selectedBranch = "",
) {
  const branchId =
    selectedBranch ||
    document.cookie
      .split("; ")
      .find((c) => c.startsWith("kybo-branch="))
      ?.slice("kybo-branch=".length) ||
    "";
  const policy = await privateRequest<{ branchId: string; required: boolean }>(
    "/api/identity/policy",
    branchId,
  );
  if (!policy.required) return undefined;
  return verifyIdentity(policy.branchId, action, requestId, payload);
}
