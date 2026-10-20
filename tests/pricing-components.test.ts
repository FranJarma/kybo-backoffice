import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import { ProductConfigurator } from "../src/components/sales/product-configurator";
import { ProductPricePreview } from "../src/components/products/price-preview";
vi.stubGlobal("React", React);
it("adds final modifiers without applying another VAT surcharge", () => {
  const html = renderToStaticMarkup(
    React.createElement(ProductConfigurator, {
      config: {
        model: "configurable",
        fulfillmentVersionId: "f",
        recipeVersionId: "r",
        basePrice: "0.01",
        catalogBasePrice: "0.01",
        vatRate: "21.00",
        groups: [
          {
            id: "g",
            name: "Extras",
            min: 0,
            max: 2,
            options: [
              {
                id: "o",
                name: "Extra",
                defaultCount: 2,
                maxCount: 2,
                price: "0.01",
                available: true,
              },
            ],
          },
        ],
      },
      onConfirm: () => {},
      onCancel: () => {},
    }),
  );
  expect(html).toMatch(/text-xl[^>]*>[^<]*0,03/);
});
it("previews the final amount and never substitutes zero for pending VAT", () => {
  expect(
    renderToStaticMarkup(
      React.createElement(ProductPricePreview, {
        price: "10000",
        rate: "10,5",
        label: "Mostrador",
      }),
    ),
  ).toContain("10.000,00");
  expect(
    renderToStaticMarkup(
      React.createElement(ProductPricePreview, {
        price: "10000",
        rate: "",
        label: "Mostrador",
      }),
    ),
  ).toContain("Falta configurar");
});
it("keeps an excessive configured price readable instead of crashing the modal", () => {
  expect(() =>
    renderToStaticMarkup(
      React.createElement(ProductConfigurator, {
        config: {
          model: "configurable",
          fulfillmentVersionId: "f",
          recipeVersionId: "r",
          basePrice: "968000000000.00",
          catalogBasePrice: "800000000000.00",
          vatRate: "21.00",
          groups: [
            {
              id: "g",
              name: "Extra",
              min: 1,
              max: 1,
              options: [
                {
                  id: "o",
                  name: "Large",
                  price: "100000000000.00",
                  defaultCount: 1,
                  maxCount: 1,
                  available: true,
                },
              ],
            },
          ],
        },
        onConfirm: () => {},
        onCancel: () => {},
      }),
    ),
  ).not.toThrow();
});
