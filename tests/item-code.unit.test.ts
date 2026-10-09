import { expect, it } from "vitest";
import { parseInput } from "../src/modules/catalog/validation";

const ingredient = {
  name: "Té chai",
  code: "TE-CHAI",
  class: "food",
  baseUnit: "g",
  unitCost: "",
  purchasable: true,
  recipeUsable: true,
};

it("permite nombres con tildes y espacios y códigos válidos", () => {
  expect(parseInput("items", ingredient)).toMatchObject({ name: "Té chai", code: "TE-CHAI" });
});

it.each(["Té chai", "TE CHAI", "TÉ-CHAI", "-CHAI", "TE/CHAI"])(
  "explica en español el formato del código inválido %s",
  (code) => {
    expect(() => parseInput("items", { ...ingredient, code })).toThrow(
      "El código debe empezar con una letra de A a Z o un número. Usá letras de A a Z, números, puntos, guiones o guiones bajos; sin espacios, tildes ni ñ. Ejemplo: TE-CHAI.",
    );
  },
);
