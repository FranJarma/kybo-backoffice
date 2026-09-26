import { afterEach, it, expect, vi } from "vitest";
import { requestInput } from "../src/modules/catalog/http";

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
