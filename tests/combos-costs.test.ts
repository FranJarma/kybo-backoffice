import { expect, it } from "vitest";
import { comboCostRange } from "../src/modules/combos/costs";
import type { ComboDefinition } from "../src/modules/combos/service";
import type { ProductCost } from "../src/modules/catalog/product-cost-model";
const definition = {
  productId: "combo",
  groups: [
    {
      name: "Gaseosa a elección",
      quantity: 2,
      options: [
        { productId: "a", name: "Pepsi" },
        { productId: "b", name: "7up" },
      ],
    },
  ],
} as ComboDefinition;
const model = (id: string, min: string | null, max: string | null) =>
  ({ productId: id, min, max, referenceItems: [] }) as unknown as ProductCost;
it("excludes options unavailable in this branch", () => {
  const costs = new Map([
    ["a", model("a", "10.000000", "20.000000")],
    ["b", model("b", null, null)],
  ]);
  expect(comboCostRange(definition, costs, new Set(["a"]))).toMatchObject({
    min: "20.000000",
    max: "40.000000",
  });
  expect(comboCostRange(definition, costs, new Set())).toMatchObject({
    status: "pending",
  });
});
it("sums allowed ranges times component quantity, never sale prices", () => {
  expect(
    comboCostRange(
      definition,
      new Map([
        ["a", model("a", "10.000000", "20.000000")],
        ["b", model("b", "15.000000", "30.000000")],
      ]),
    ),
  ).toMatchObject({ min: "20.000000", max: "60.000000" });
});
it("does not treat an unknown alternative as zero", () => {
  expect(
    comboCostRange(
      definition,
      new Map([
        ["a", model("a", "10.000000", "20.000000")],
        ["b", model("b", null, null)],
      ]),
    ),
  ).toMatchObject({ status: "pending", min: null, max: null });
});
it("explains when a group has no products enabled in this branch", () => {
  const result = comboCostRange(definition, new Map(), new Set());
  expect(result.pendingReasons).toContain(
    "Gaseosa a elección: no hay opciones habilitadas y disponibles en esta sucursal (Pepsi, 7up).",
  );
});
it("identifies an unconfigured product instead of presenting an unexplained pending cost", () => {
  const unconfigured = {
    ...model("a", null, null),
    status: "unconfigured" as const,
  };
  const result = comboCostRange(
    definition,
    new Map([["a", unconfigured]]),
    new Set(["a"]),
  );
  expect(result.pendingReasons).toContain(
    "Pepsi: falta publicar su receta o vincular un artículo de venta directa.",
  );
});
it("distinguishes a missing cost from a missing product configuration", () => {
  const result = comboCostRange(
    definition,
    new Map([["a", { ...model("a", null, null), status: "pending" as const }]]),
    new Set(["a"]),
  );
  expect(result.pendingReasons).toContain(
    "Pepsi: hay ingredientes o artículos con costo pendiente. Revisá el costeo de ese producto.",
  );
});
