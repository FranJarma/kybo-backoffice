import { expect, it } from "vitest";
import { preparationGuideSchema } from "@/modules/recipes/preparation-guide";

it("validates ordered preparation instructions and optional duration", () => {
  expect(
    preparationGuideSchema.parse({
      steps: [" Agregar leche ", "Mezclar"],
      estimatedMinutes: 3,
      observations: " Servir frío ",
    }),
  ).toEqual({
    steps: ["Agregar leche", "Mezclar"],
    estimatedMinutes: 3,
    observations: "Servir frío",
  });
  expect(
    preparationGuideSchema.parse({
      steps: [],
      estimatedMinutes: null,
      observations: "",
    }).estimatedMinutes,
  ).toBeNull();
});
it.each([0, -1, 1.5, 1441])(
  "rejects invalid preparation time %s",
  (estimatedMinutes) => {
    expect(() =>
      preparationGuideSchema.parse({
        steps: [],
        estimatedMinutes,
        observations: "",
      }),
    ).toThrow();
  },
);
it("rejects blank steps and oversized instructions", () => {
  expect(() =>
    preparationGuideSchema.parse({
      steps: [" "],
      estimatedMinutes: null,
      observations: "",
    }),
  ).toThrow();
  expect(() =>
    preparationGuideSchema.parse({
      steps: ["x".repeat(1001)],
      estimatedMinutes: null,
      observations: "",
    }),
  ).toThrow();
});
