import { it, expect } from "vitest";
import { diffGroupVersions } from "@/modules/modifiers/diff";
it("shows same-key quantity, instruction, added and removed option changes", () => {
  const before = {
    name: "Perlas",
    options: [
      {
        key: "a",
        name: "A",
        kind: "composition",
        instruction: null,
        components: [
          {
            itemId: "i",
            name: "Tapioca",
            baseUnit: "g",
            quantity: "40.000000",
          },
        ],
      },
      {
        key: "old",
        name: "Vieja",
        kind: "instruction",
        instruction: "Antigua",
        components: [],
      },
    ],
  };
  const after = {
    name: "Perlas",
    options: [
      {
        ...before.options[0],
        components: [
          {
            itemId: "i",
            name: "Tapioca",
            baseUnit: "g",
            quantity: "80.000000",
          },
        ],
      },
      {
        key: "new",
        name: "Nueva",
        kind: "instruction",
        instruction: "Servir frío",
        components: [],
      },
    ],
  };
  expect(diffGroupVersions(before, after)).toEqual(
    expect.arrayContaining([
      expect.stringContaining("40.000000 g → 80.000000 g"),
      expect.stringContaining("Retirada: Vieja"),
      expect.stringContaining("Agregada: Nueva"),
    ]),
  );
});
