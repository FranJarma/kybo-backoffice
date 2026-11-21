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
describe("modifier rows", () => {
  type Option = PublicConfiguration["groups"][number]["options"][number];
  const option = (extra: Partial<Option> = {}): Option => ({
    id: "binding",
    name: "Chocolate",
    defaultCount: 0,
    maxCount: 1,
    available: true,
    price: "0.00",
    ...extra,
  });
  const renderOptions = (
    options: Option[],
    props: Partial<React.ComponentProps<typeof ProductConfigurator>> = {},
    limits = { min: 1, max: 1 },
  ) =>
    renderToStaticMarkup(
      React.createElement(ProductConfigurator, {
        config: config([{ id: "group", name: "Perlas", ...limits, options }]),
        onCancel: vi.fn(),
        onConfirm: vi.fn(),
        ...props,
      }),
    );

  it("continues labeling a recipe default after it is deselected", () => {
    const html = renderOptions([option({ defaultCount: 1 })], {
      initialSelection: [],
    });
    expect(html).toContain("Viene incluida en la receta");
    expect(html).not.toContain('checked=""');
    expect(html).toContain("Perlas: elegí entre 1 y 1.");
  });

  it("labels and prices a paid recipe default and shows native checked state", () => {
    const html = renderOptions([option({ defaultCount: 1, price: "200.00" })]);
    expect(html).toContain("Viene incluida en la receta");
    expect(html).toMatch(/\+ [^<]*200,00/);
    expect(html).toContain('checked=""');
  });

  it("describes a free nondefault option without claiming recipe membership", () => {
    const html = renderOptions([option()]);
    expect(html).toContain("Sin cargo");
    expect(html).not.toContain("Viene incluida en la receta");
  });

  it.each([
    ["chocolate", "#956545"],
    ["954f6731-0128-40d1-8f0c-4063fee07617", "#513A34"],
    ["1875fd4b-bae4-407e-9ca8-f70fc2c76850", "#956545"],
    ["84f02641-0f52-463c-8833-49e01818704e", "#C94254"],
    ["b07eb534-9c5d-4dc0-975b-7e74c434c53c", "#F5BD35"],
    ["a5f1e6b0-4a9a-4fb5-a1db-d2f21b8d1aa6", "#F5CA52"],
    ["0f7efef8-b1d1-46f8-9605-fed632473170", "#74478C"],
    ["0eff36cf-ebf1-4d10-850a-f738ea164a28", "#D68A4A"],
    ["3283b742-82be-4a8b-9718-51e5e60316d6", "#956545"],
    ["f11c17a9-d65e-4d37-82b7-cfcb0843c6d6", "#A86238"],
    ["e00338f0-8ae3-4988-b8af-dd9ac86d7bfe", "#C94254"],
    ["93648086-71f4-494c-8266-b608083c8e12", "#F7E8CC"],
    ["9150176f-fdd7-46ea-b252-53196b068892", "#956545"],
    ["14fcc687-670f-4512-8c97-79d3b863c062", "#A86238"],
    ["795dce84-b27e-4db5-a8fd-feeb499726e9", "#C94254"],
    ["americana", "#F7E8CC"],
    ["caramelo", "#D68A4A"],
    ["dulce-de-leche", "#A86238"],
    ["frutilla", "#C94254"],
    ["frutos-rojos", "#74478C"],
  ])("uses the persisted flavor key %s after a rename", (key, color) => {
    expect(
      renderOptions([option({ key, name: "Edición de temporada" })]),
    ).toContain(`background-color:${color}`);
  });

  it("keeps an unrelated option named Chocolate neutral", () => {
    const unknown = renderOptions([
      option({
        key: "85fbc266-bcc3-4e93-921f-9c2de730a0db",
        name: "Chocolate",
      }),
    ]);
    expect(unknown).toContain('data-modifier-visual="swatch"');
    expect(unknown).toContain("background-color:#D5E1E8");
  });

  it("uses an X for the known no-pearls keys only", () => {
    for (const key of ["no-pearls", "229be374-c4bf-4f7c-a4f9-0cc4e5f84700"]) {
      expect(
        renderOptions([option({ key, name: "Sin agregado de perlas" })]),
      ).toContain('data-modifier-visual="no-pearls"');
    }
    for (const key of [
      "no-sauce",
      "sin-salsa",
      "9bf66daa-1dd6-4cfc-a5d9-e99116c46a67",
    ]) {
      const html = renderOptions([option({ key, name: "Sin perlas" })]);
      expect(html).toContain('data-modifier-visual="swatch"');
      expect(html).toContain("background-color:#D5E1E8");
    }
  });

  it("keeps unavailable options visible and their single-choice controls disabled", () => {
    const html = renderOptions([option({ available: false })]);
    expect(html).toContain("No disponible");
    expect(html).toMatch(
      /<input[^>]*(?:type="radio"[^>]*disabled|disabled[^>]*type="radio")/,
    );
  });

  it("disables a radio when the option limit allows zero selections", () => {
    const html = renderOptions([option({ maxCount: 0 })]);
    expect(html).toMatch(
      /<input[^>]*(?:type="radio"[^>]*disabled|disabled[^>]*type="radio")/,
    );
  });

  it("preserves initial counts and prevents increments at the option and group limits", () => {
    const options = [
      option({ id: "cocoa", defaultCount: 0 }),
      option({ id: "mango", name: "Mango", maxCount: 3 }),
    ];
    const atOptionLimit = renderOptions(
      options,
      { initialSelection: [{ recipeModifierOptionId: "cocoa", count: 1 }] },
      { min: 2, max: 3 },
    );
    expect(atOptionLimit).toContain("Perlas: elegí entre 2 y 3.");
    expect(atOptionLimit).toMatch(
      /aria-label="Cantidad Chocolate"[^>]*>1<\/output>/,
    );
    expect(atOptionLimit).toMatch(/aria-label="Aumentar Chocolate" disabled/);
    expect(atOptionLimit).not.toMatch(/aria-label="Aumentar Mango" disabled/);

    const atGroupLimit = renderOptions(
      options,
      { initialSelection: [{ recipeModifierOptionId: "mango", count: 3 }] },
      { min: 2, max: 3 },
    );
    expect(atGroupLimit).toMatch(/aria-label="Aumentar Chocolate" disabled/);
    expect(atGroupLimit).toMatch(/aria-label="Aumentar Mango" disabled/);
  });
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
