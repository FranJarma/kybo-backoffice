import { afterEach, it, expect, vi } from "vitest";
import { requestInput } from "../src/modules/catalog/http";
import { configuredOrigins, trustedOrigins } from "../src/lib/origins";

afterEach(() => vi.unstubAllEnvs());
it("accepts an explicitly configured alias for catalog mutations", async () => {
  vi.stubEnv("BETTER_AUTH_URL", "https://kybo.example");
  vi.stubEnv("BETTER_AUTH_TRUSTED_ORIGINS", "https://alias.kybo.example");
  const request = new Request("https://kybo.example/api/catalog/suppliers", {
    method: "POST",
    headers: {
      Origin: "https://alias.kybo.example",
      "Content-Type": "application/json",
    },
    body: '{"name":"Proveedor"}',
  });
  await expect(requestInput(request)).resolves.toEqual({ name: "Proveedor" });
});
it("rejects an origin that only shares the configured prefix", async () => {
  vi.stubEnv("BETTER_AUTH_URL", "https://kybo.example");
  vi.stubEnv("BETTER_AUTH_TRUSTED_ORIGINS", "https://alias.kybo.example");
  const request = new Request("https://kybo.example/api/catalog/suppliers", {
    method: "POST",
    headers: {
      Origin: "https://alias.kybo.example.attacker.test",
      "Content-Type": "application/json",
    },
    body: "{}",
  });
  await expect(requestInput(request)).rejects.toMatchObject({ status: 403 });
});

function localDevelopment() {
  vi.stubEnv("NODE_ENV", "development");
  vi.stubEnv("PORT", "8080");
  vi.stubEnv("BETTER_AUTH_URL", "http://localhost:3000");
  vi.stubEnv("BETTER_AUTH_TRUSTED_ORIGINS", "");
}

function costsRequest(origin?: string) {
  return new Request("http://localhost:8080/api/products/costs", {
    method: "POST",
    headers: {
      ...(origin === undefined ? {} : { Origin: origin }),
      "Content-Type": "application/json",
    },
    body: '{"ids":["product-id"]}',
  });
}

it("accepts the actual local development port for product cost requests and authentication", async () => {
  localDevelopment();
  await expect(
    requestInput(costsRequest("http://localhost:8080")),
  ).resolves.toEqual({ ids: ["product-id"] });
  expect(configuredOrigins()).toEqual([
    "http://localhost:3000",
    "http://localhost:8080",
  ]);
  expect(trustedOrigins("http://localhost:3000")).toEqual(configuredOrigins());
});

it.each(["127.0.0.1", "[::1]"])(
  "recognizes the runtime port for the explicit loopback host %s",
  (host) => {
    localDevelopment();
    const origin = `http://${host}:3000`;
    expect(trustedOrigins(origin)).toEqual([origin, `http://${host}:8080`]);
  },
);

it.each([
  undefined,
  "null",
  "http://localhost:8081",
  "http://localhost:8080.attacker.test",
  "http://localhost.attacker.test:8080",
  "http://127.0.0.1:8080",
  "https://localhost:8080",
  "https://attacker.example",
])("still rejects an unlisted development origin: %s", async (origin) => {
  localDevelopment();
  await expect(requestInput(costsRequest(origin))).rejects.toMatchObject({
    status: 403,
  });
});

it("does not infer any port in production", async () => {
  localDevelopment();
  vi.stubEnv("NODE_ENV", "production");
  expect(configuredOrigins()).toEqual(["http://localhost:3000"]);
  await expect(
    requestInput(costsRequest("http://localhost:8080")),
  ).rejects.toMatchObject({ status: 403 });
});

it("does not infer a development port for a remote canonical host", () => {
  localDevelopment();
  vi.stubEnv("BETTER_AUTH_URL", "https://kybo.example");
  expect(configuredOrigins()).toEqual(["https://kybo.example"]);
});

it.each(["", "0", "65536", "8080.attacker.test", "-1"])(
  "does not trust an invalid runtime port: %s",
  (port) => {
    localDevelopment();
    vi.stubEnv("PORT", port);
    expect(configuredOrigins()).toEqual(["http://localhost:3000"]);
  },
);
