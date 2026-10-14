import { expect, it } from "vitest";
import { parseInput } from "../src/modules/catalog/validation";

const water = {
  code: "AGUA-CANILLA",
  name: "Agua de la canilla",
  class: "beverage",
  baseUnit: "ml",
  purchasable: "false",
  recipeUsable: "true",
  unitCost: "0",
};
it("mantiene control de stock por defecto", () => {
  expect(parseInput("items", water).stockTracked).toBe(true);
});
it("permite agua en recetas sin controlar inventario", () => {
  expect(
    parseInput("items", { ...water, stockTracked: "false" }),
  ).toMatchObject({
    stockTracked: false,
    recipeUsable: true,
    unitCost: "0.000000",
  });
});
