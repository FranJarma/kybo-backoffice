import { expect, it } from "vitest";
import { resolveComposition } from "@/modules/recipes/composition";
const component = (itemId: string, quantity: string) => ({
  itemId,
  name: itemId,
  baseUnit: "g" as const,
  quantity,
  archived: false,
});
const config = () => ({
  recipeVersionId: "v1",
  revision: 1,
  model: "configurable" as const,
  yieldQuantity: "2.000000",
  fixed: [component("milk", "600.000000")],
  groups: [
    {
      id: "g1",
      groupVersionId: "gv1",
      name: "Perlas",
      min: 1,
      max: 2,
      factor: "1.500000",
      options: [
        {
          id: "o1",
          key: "tapioca",
          name: "Tapioca",
          kind: "composition" as const,
          instruction: null,
          enabled: true,
          defaultCount: 1,
          maxCount: 2,
          mode: "inherit" as "inherit" | "override",
          components: [component("pearls", "40.000000")],
          prices: { counter: "500.00" },
        },
      ],
    },
  ],
});
it("scales inherited extras once and divides only fixed recipe yield", () => {
  const r = resolveComposition(
    config(),
    [{ recipeModifierOptionId: "o1", count: 2 }],
    "counter",
  );
  expect(r.components.map((x) => [x.itemId, x.quantity])).toEqual([
    ["milk", "300.000000"],
    ["pearls", "120.000000"],
  ]);
  expect(r.surcharge).toBe("1000.00");
});
it("uses complete override without inherited factor", () => {
  const c = config();
  c.groups[0].options[0].mode = "override";
  c.groups[0].options[0].components = [component("pearls", "50.000000")];
  expect(
    resolveComposition(
      c,
      [{ recipeModifierOptionId: "o1", count: 2 }],
      "counter",
    ).components[1].quantity,
  ).toBe("100.000000");
});
it("adds legitimate fixed item and extra instead of dropping duplicates", () => {
  const c = config();
  c.fixed = [component("pearls", "40.000000")];
  expect(
    resolveComposition(
      c,
      [{ recipeModifierOptionId: "o1", count: 1 }],
      "counter",
    ).components[0].quantity,
  ).toBe("80.000000");
});
for (const [name, choices] of [
  ["missing", []],
  ["foreign", [{ recipeModifierOptionId: "other", count: 1 }]],
  ["fraction", [{ recipeModifierOptionId: "o1", count: 1.5 }]],
  ["over", [{ recipeModifierOptionId: "o1", count: 3 }]],
  [
    "duplicate",
    [
      { recipeModifierOptionId: "o1", count: 1 },
      { recipeModifierOptionId: "o1", count: 1 },
    ],
  ],
] as const)
  it("rejects " + name, () =>
    expect(() =>
      resolveComposition(config(), [...choices], "counter"),
    ).toThrow(),
  );
it("rejects missing channel price", () =>
  expect(() =>
    resolveComposition(
      config(),
      [{ recipeModifierOptionId: "o1", count: 1 }],
      "pedidosya",
    ),
  ).toThrow());
it("rejects archived selected component", () => {
  const c = config();
  c.groups[0].options[0].components[0].archived = true;
  expect(() =>
    resolveComposition(
      c,
      [{ recipeModifierOptionId: "o1", count: 1 }],
      "counter",
    ),
  ).toThrow();
});
it("allows explicit empty composition", () => {
  const c = config();
  c.fixed = [];
  c.groups[0].options[0].components = [];
  c.groups[0].options[0].prices.counter = "0.00";
  expect(
    resolveComposition(
      c,
      [{ recipeModifierOptionId: "o1", count: 1 }],
      "counter",
    ),
  ).toMatchObject({ components: [], surcharge: "0.00" });
});
