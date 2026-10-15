import { expect, it } from "vitest";
import {
  locationCreateSchema,
  branchSchema,
  locationSchema,
} from "@/modules/branches/validation";

it("generates distinct valid internal codes for locations with the same name", () => {
  const first = locationCreateSchema.parse({ name: " Depósito " });
  const second = locationCreateSchema.parse({ name: "Depósito" });
  expect(first.name).toBe("Depósito");
  expect(first.code).toMatch(/^LOC-[A-Z0-9-]+$/);
  expect(first.code.length).toBeLessThanOrEqual(64);
  expect(first.code).not.toBe(second.code);
  expect(locationSchema.parse(first)).toEqual(first);
});
it("preserves supplied codes for existing integrations", () => {
  expect(
    locationCreateSchema.parse({ name: "Barra", code: "BARRA" }).code,
  ).toBe("BARRA");
});
it("generates the first location code when opening a branch", () => {
  const branch = branchSchema.parse({
    name: "Local",
    code: "LOCAL",
    timeZone: "America/Argentina/Buenos_Aires",
    locations: [{ name: "Depósito" }],
  });
  expect(branch.code).toBe("LOCAL");
  expect(branch.locations[0].code).toMatch(/^LOC-/);
});
it("still rejects empty names and invalid explicit codes", () => {
  expect(() => locationCreateSchema.parse({ name: " " })).toThrow();
  expect(() =>
    locationCreateSchema.parse({ name: "Barra", code: "?" }),
  ).toThrow();
});
