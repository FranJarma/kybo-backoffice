import { describe, expect, it } from "vitest";
import { parseRecipe } from "@/modules/recipes/validation";

const recipe = {
  requestId: "b05a0e3e-b193-42d3-9130-a1172b4f5230",
  kind: "product",
  targetId: "4690a82f-c39d-4b89-9f0b-b386c727d8f9",
  targetUnit: "unit",
  yieldQuantity: "1",
  compositionModel: "configurable",
  lines: [
    {
      itemId: "1fb29983-8f8e-4bed-b13b-416af2ea6135",
      quantity: "200",
      baseUnit: "ml",
    },
    {
      itemId: "39e5ef96-08a0-4c2f-912f-bb09292e73cc",
      quantity: "150",
      baseUnit: "ml",
    },
    {
      itemId: "ccb46d05-e7da-45eb-a17b-380432eeb0fe",
      quantity: "1",
      baseUnit: "unit",
    },
    {
      itemId: "4766340f-92ee-4517-96ff-4219af08334f",
      quantity: "1",
      baseUnit: "unit",
    },
    {
      itemId: "66c6eb3d-c8ac-4f95-947a-33d51beac573",
      quantity: "1",
      baseUnit: "unit",
    },
  ].map((option) => ({ optional: false, options: [option] })),
  groups: [],
};

describe("recipe waste defaults", () => {
  it.each(["configurable", "legacy"])(
    "accepts untouched waste in %s recipes",
    (compositionModel) => {
      const parsed = parseRecipe({ ...recipe, compositionModel });
      expect(parsed.lines.map((line) => line.options[0].wastePercent)).toEqual(
        Array(5).fill("0.00"),
      );
      expect(parsed.lines.map((line) => line.options[0].quantity)).toEqual([
        "200.000000",
        "150.000000",
        "1.000000",
        "1.000000",
        "1.000000",
      ]);
    },
  );

  it("accepts preparations without explicit waste", () => {
    expect(
      parseRecipe({ ...recipe, kind: "preparation", targetUnit: "ml" }).lines[0]
        .options[0].wastePercent,
    ).toBe("0.00");
  });

  it("preserves explicit waste and rejects invalid percentages", () => {
    const withWaste = (wastePercent: string) => ({
      ...recipe,
      lines: [
        {
          optional: false,
          options: [{ ...recipe.lines[0].options[0], wastePercent }],
        },
      ],
    });
    expect(parseRecipe(withWaste("2,5")).lines[0].options[0].wastePercent).toBe(
      "2.50",
    );
    for (const invalid of ["-1", "100", "texto"])
      expect(() => parseRecipe(withWaste(invalid))).toThrow();
  });
});
