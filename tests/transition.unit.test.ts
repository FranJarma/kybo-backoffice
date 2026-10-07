import { describe, expect, it } from "vitest";
import { transitionMappingSchema } from "../src/modules/transition/mapping";
const branchId = "d908e81a-7248-4d42-85c9-596b44c14d8b";
const mapping = {
  initialBranch: {
    id: branchId,
    code: "CENTRO",
    name: "Centro",
    timeZone: "America/Argentina/Salta",
  },
  initialLocation: {
    id: "6fcb4cd5-1a29-4210-a3d5-cfcefd3b6f08",
    code: "DEPOSITO",
    name: "Depósito",
  },
  memberships: [{ userId: "u1", branchId, role: "manager" }],
  catalogManagers: ["u1"],
  itemClassifications: [
    {
      id: "4e4474aa-af08-426c-983e-f203512f9e3d",
      code: "HARINA",
      class: "food",
      purchasable: true,
      recipeUsable: true,
    },
  ],
  cutoverAt: "2026-09-28T12:00:00-03:00",
};
describe("reviewed transition mapping", () => {
  it("accepts an explicit initial scope without inferring permissions", () => {
    expect(transitionMappingSchema.parse(mapping).memberships).toEqual(
      mapping.memberships,
    );
  });
  it("rejects duplicated codes and cross-branch memberships", () => {
    expect(
      transitionMappingSchema.safeParse({
        ...mapping,
        itemClassifications: [
          ...mapping.itemClassifications,
          mapping.itemClassifications[0],
        ],
      }).success,
    ).toBe(false);
    expect(
      transitionMappingSchema.safeParse({
        ...mapping,
        memberships: [
          { ...mapping.memberships[0], branchId: mapping.initialLocation.id },
        ],
      }).success,
    ).toBe(false);
  });
  it("does not make cleaning materials recipe ingredients", () => {
    expect(
      transitionMappingSchema.safeParse({
        ...mapping,
        itemClassifications: [
          { ...mapping.itemClassifications[0], class: "cleaning" },
        ],
      }).success,
    ).toBe(false);
  });
});
