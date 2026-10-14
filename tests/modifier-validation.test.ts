import { describe, expect, it } from "vitest";
import {
  componentInput,
  parseGroup,
  bindingInput,
} from "@/modules/modifiers/validation";

const component = {
  itemId: "20b5bb38-ee82-4c2c-be22-260e9ca625c1",
  quantity: "1",
  baseUnit: "unit",
};
const group = {
  requestId: "f6db11a5-c91d-4f87-a94e-d2971a8ed4e8",
  name: "Endulzante",
  options: [
    {
      key: "azucar",
      name: "Azúcar en sobre",
      kind: "composition",
      instruction: "",
      components: [component],
    },
    {
      key: "edulcorante",
      name: "Edulcorante en sobre",
      kind: "composition",
      instruction: "",
      components: [
        { ...component, itemId: "4f7b2415-8dc2-4514-bdd3-ec4b6909067a" },
      ],
    },
  ],
};

describe("modifier surcharge defaults", () => {
  const parsePrices = (prices: Record<string, unknown>) =>
    bindingInput.parse({
      name: "Endulzante",
      min: 0,
      max: 3,
      factor: "1",
      options: [
        {
          optionKey: "azucar",
          enabled: true,
          defaultCount: 0,
          maxCount: 3,
          mode: "inherit",
          prices,
        },
      ],
    }).options[0].prices;

  it.each([
    {},
    { counter: "", pedidosya: "", ubereats: "" },
    { counter: null },
  ])("defaults absent or empty channel surcharges to zero: %j", (prices) => {
    expect(parsePrices(prices)).toEqual({
      counter: "0.00",
      pedidosya: "0.00",
      ubereats: "0.00",
    });
  });
  it("preserves explicit surcharges", () => {
    expect(parsePrices({ counter: "125,50" }).counter).toBe("125.50");
  });
  it.each(["-1", "abc"])("rejects invalid surcharges %s", (counter) => {
    expect(() => parsePrices({ counter })).toThrow();
  });
});

describe("modifier component waste validation", () => {
  it("accepts new group components with untouched waste fields as zero", () => {
    const parsed = parseGroup(JSON.parse(JSON.stringify(group)));
    expect(parsed.options.map((o) => o.components[0].wastePercent)).toEqual([
      "0.00",
      "0.00",
    ]);
    expect(parsed.options[0].components[0].quantity).toBe("1.000000");
  });

  it("also defaults waste in product-specific component overrides", () => {
    const parsed = bindingInput.parse({
      groupVersionId: "f6db11a5-c91d-4f87-a94e-d2971a8ed4e8",
      name: "Endulzante",
      min: 0,
      max: 3,
      factor: "1",
      options: [
        {
          optionKey: "azucar",
          enabled: true,
          defaultCount: 0,
          maxCount: 3,
          mode: "override",
          components: [component],
          prices: {},
        },
      ],
    });
    expect(parsed.options[0].components[0].wastePercent).toBe("0.00");
  });

  it("keeps explicitly entered waste", () => {
    expect(
      componentInput.parse({ ...component, wastePercent: "2,5" }).wastePercent,
    ).toBe("2.50");
  });

  it.each(["-1", "100", "texto"])(
    "rejects invalid waste %s",
    (wastePercent) => {
      expect(() =>
        componentInput.parse({ ...component, wastePercent }),
      ).toThrow();
    },
  );
});
