import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { appendCartLine, Cart, type CartLine } from "@/components/sales/cart";
import { ProductConfigurator } from "@/components/sales/product-configurator";
import {
  filterCatalogue,
  simpleComboSelection,
} from "@/components/sales/touch-selection";
import type { PublicConfiguration } from "@/modules/recipes/configuration";
import { SalesManager } from "@/components/sales/sales-manager";
vi.stubGlobal("React", React);
const line = (extra: Partial<CartLine> = {}): CartLine => ({
  productId: "tea",
  name: "Tea",
  quantity: 1,
  price: "1200",
  expectedPrice: "1200.00",
  priceReason: "",
  notes: "",
  expectedFulfillmentVersionId: "physical1",
  expectedRecipeVersionId: "recipe1",
  modifiers: [
    { recipeModifierOptionId: "pearls", count: 1 },
    { recipeModifierOptionId: "sugar", count: 2 },
  ],
  ...extra,
});
const config = (
  groups: PublicConfiguration["groups"] = [],
): PublicConfiguration => ({
  model: "configurable",
  recipeVersionId: "recipe1",
  fulfillmentVersionId: "physical1",
  basePrice: "1200.00",
  groups,
});
describe("tactile cart consolidation", () => {
  it("merges same selections regardless of array order without mutating input", () => {
    const original = [line()];
    const result = appendCartLine(
      original,
      line({ price: "1200,00", modifiers: [...line().modifiers!].reverse() }),
    );
    expect(result).toHaveLength(1);
    expect(result[0].quantity).toBe(2);
    expect(original[0].quantity).toBe(1);
  });
  it.each([
    { notes: "Sin hielo" },
    { price: "1300" },
    { expectedPrice: "1300.00" },
    { priceReason: "Descuento" },
    { expectedRecipeVersionId: "recipe2" },
    { expectedFulfillmentVersionId: "physical2" },
    { modifiers: [{ recipeModifierOptionId: "pearls", count: 2 }] },
  ])("keeps variants/version/price/note differences separate: %j", (extra) => {
    expect(appendCartLine([line()], line(extra))).toHaveLength(2);
  });
  it("canonicalizes combo group and modifier order, keeping child versions distinct", () => {
    const a = line({
      expectedComboVersionId: "combo1",
      comboChoices: [
        {
          groupId: "g",
          optionId: "o",
          expectedFulfillmentVersionId: "physical1",
          expectedRecipeVersionId: "recipe1",
          modifiers: line().modifiers!,
        },
      ],
    });
    const b = {
      ...a,
      comboChoices: [
        { ...a.comboChoices![0], modifiers: [...line().modifiers!].reverse() },
      ],
    };
    expect(appendCartLine([a], b)).toHaveLength(1);
    expect(
      appendCartLine([a], {
        ...b,
        comboChoices: [
          { ...b.comboChoices![0], expectedRecipeVersionId: "other" },
        ],
      }),
    ).toHaveLength(2);
  });
  it("does not exceed quantity or line limits or lose overflow", () => {
    const full = [line({ quantity: 999 })];
    expect(appendCartLine(full, line())).toBe(full);
    const lines = Array.from({ length: 50 }, (_, i) =>
      line({ productId: String(i) }),
    );
    expect(appendCartLine(lines, line())).toBe(lines);
    expect(appendCartLine(lines, line({ productId: "0" }))[0].quantity).toBe(2);
  });
});
it("places the product before modifiers and keeps price editing secondary", () => {
  const cartProps: React.ComponentProps<typeof Cart> = {
    lines: [line({ modifierLabels: ["Perlas mango"] })],
    locked: false,
    allowPrice: true,
    total: "1200.00",
    onChange: vi.fn(),
    children: "Cobrar",
  };
  const html = renderToStaticMarkup(React.createElement(Cart, cartProps));
  expect(html.indexOf(">Tea<")).toBeLessThan(html.indexOf("Perlas mango"));
  expect(html).not.toContain("<details");
  expect(html).not.toContain('aria-label="Precio de Tea"');
  expect(html).not.toContain('placeholder="Sin hielo, para compartir…"');
  expect(html).toContain('aria-label="Editar precio de Tea"');
  expect(html).toContain('aria-label="Editar observaciones de Tea"');
  expect(html).toContain("min-h-12");
  expect(html).toContain("overflow-y-auto");
});
it("keeps stock help and order note forms outside the register until requested", () => {
  const html = renderToStaticMarkup(
    React.createElement(SalesManager, {
      actorId: "test",
      branchId: "branch",
      role: "admin",
    }),
  );
  expect(html).toContain("Ayuda de stock");
  expect(html).not.toContain("Al confirmar se reserva el stock");
  expect(html).not.toContain('placeholder="Aclaraciones para el pedido"');
});
it("shows required groups before collapsed optional groups with touch counters", () => {
  const option = {
    id: "sugar",
    name: "Azúcar",
    defaultCount: 0,
    maxCount: 3,
    available: true,
    price: "0.00",
  };
  const html = renderToStaticMarkup(
    React.createElement(ProductConfigurator, {
      config: config([
        {
          id: "optional",
          name: "Endulzante",
          min: 0,
          max: 3,
          options: [option],
        },
        {
          id: "required",
          name: "Perlas",
          min: 1,
          max: 1,
          options: [
            {
              ...option,
              id: "pearls",
              name: "Mango",
              defaultCount: 1,
              maxCount: 1,
            },
          ],
        },
      ]),
      onCancel: vi.fn(),
      onConfirm: vi.fn(),
    }),
  );
  expect(html.indexOf("Perlas")).toBeLessThan(html.indexOf("Endulzante"));
  expect(html).toMatch(/<details[^>]*>[\s\S]*Endulzante/);
  expect(html).toContain('aria-label="Aumentar Azúcar"');
});
it("commits a simple combo component immediately with published versions and no surcharge", () => {
  expect(
    simpleComboSelection("group", "option", {
      model: "unavailable",
      recipeVersionId: null,
      fulfillmentVersionId: "physical1",
      basePrice: "1200.00",
      groups: [],
    }),
  ).toEqual({
    choice: {
      groupId: "group",
      optionId: "option",
      expectedFulfillmentVersionId: "physical1",
      expectedRecipeVersionId: null,
      modifiers: [],
    },
    extra: "0.00",
    labels: [],
  });
  expect(
    simpleComboSelection(
      "group",
      "option",
      config([{ id: "g", name: "Perlas", min: 1, max: 1, options: [] }]),
    ),
  ).toBeNull();
  expect(
    simpleComboSelection("group", "option", {
      ...config(),
      fulfillmentVersionId: null,
    } as unknown as PublicConfiguration),
  ).toBeNull();
});

it("filters the loaded catalogue locally by category and accented product name", () => {
  const rows = [
    { id: "milk", name: "Té chai", categoryId: "drinks" },
    { id: "waffle", name: "Waffle", categoryId: null },
  ];
  expect(filterCatalogue(rows, "te chai", "drinks")).toEqual([rows[0]]);
  expect(filterCatalogue(rows, "", "none")).toEqual([rows[1]]);
  expect(filterCatalogue(rows, "waffle", "drinks")).toEqual([]);
});
