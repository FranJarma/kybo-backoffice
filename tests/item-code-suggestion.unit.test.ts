import { expect, it } from "vitest";
import { suggestItemCode } from "../src/modules/items/code";

it.each([
  ["Té chai", "TE-CHAI"],
  ["  Preparado de café frío  ", "PREPARADO-DE-CAFE-FRIO"],
  ["Piña / maracuyá", "PINA-MARACUYA"],
  ["Leche   entera", "LECHE-ENTERA"],
  ["---", ""],
  ["", ""],
])("sugiere un código para %s", (name, code) => {
  expect(suggestItemCode(name)).toBe(code);
});
it("respeta el límite de 64 caracteres y no termina en guion", () => {
  expect(suggestItemCode("a".repeat(63) + " bbb")).toBe("A".repeat(63));
});
