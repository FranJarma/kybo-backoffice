import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import {
  productCardModel,
  productAppearance,
} from "@/components/sales/pos-presentation";
import { ProductCard } from "@/components/sales/product-card";
import type { SaleLookup } from "@/modules/sales/types";

const row = (
  overrides: Partial<SaleLookup["rows"][number]> = {},
): SaleLookup["rows"][number] => ({
  id: "stable-tea",
  name: "Té con un nombre largo",
  price: "7500.00",
  configured: true,
  ...overrides,
});
describe("POS product presentation", () => {
  it("keeps a stable identity and a neutral fallback when a product is renamed or has no photo", () => {
    const first = productCardModel(row());
    const renamed = productCardModel(row({ name: "Otro nombre" }));
    expect(first.appearance).toEqual(renamed.appearance);
    expect(first.imageAssetId).toBeNull();
    expect(first.priceLabel).toMatch(/7[.]500/);
    expect(productAppearance("unknown")).toEqual(first.appearance);
  });
  it.each([
    [{ temporarilySoldOut: true }, "Agotado temporalmente"],
    [{ vatPending: true }, "Configurá el IVA del producto"],
    [{ configured: false }, "Falta completar la ficha"],
    [{ price: null }, "Sin precio"],
  ] as const)(
    "explains why an unavailable product cannot be added: %s",
    (overrides, message) => {
      const product = productCardModel(row(overrides));
      const html = renderToStaticMarkup(
        createElement(ProductCard, {
          product,
          quantity: 0,
          onSelect: () => {},
        }),
      );
      expect(product.selectable).toBe(false);
      expect(html).toContain("disabled");
      expect(html).toContain(message);
    },
  );
  it("preserves the approved palette if the product is renamed", () => {
    const id = "d8667694-d0b4-49ff-90cb-e72f3cc6aa17";
    const name = "Oreo Iced Latte";
    const approved = productCardModel(row({ id, name }));
    const renamed = productCardModel(row({ id, name: "Latte actualizado" }));
    const sameName = productCardModel(row({ name }));

    expect(renamed.appearance).toEqual(approved.appearance);
    expect(sameName.appearance).toEqual(productAppearance("unknown"));
    expect(approved.appearance).not.toEqual(sameName.appearance);
  });
  it("uses a neutral palette for catalogue products without an approved design", () => {
    const neutral = productAppearance("unknown");
    for (const id of [
      "c8f9f85d-fe9b-4b2b-9acc-11df3e7ad4a8", // Taro Iced Latte
      "9bb0cebb-c87b-48ce-8e17-d596ef1ec71c", // Matcha Iced Latte
      "4690a82f-c39d-4b89-9f0b-b386c727d8f9", // Kybo Tea
      "constructor",
    ]) {
      expect(productAppearance(id)).toEqual(neutral);
    }
  });
  it("renders the approved top and bottom bands without repeating the gradient", () => {
    const product = productCardModel(
      row({ id: "d8667694-d0b4-49ff-90cb-e72f3cc6aa17" }),
    );
    const html = renderToStaticMarkup(
      createElement(ProductCard, { product, onSelect: () => {} }),
    );

    expect(html).toContain("linear-gradient(to bottom, #E9CEAE 0");
    expect(html).toContain("#68432F 75% 87.5%, #352B26 87.5% 100%)");
    expect(html).not.toContain("repeating-linear-gradient");
  });
  it("shows the quantity from the actual order and the persisted photo without fetching business data", () => {
    const html = renderToStaticMarkup(
      createElement(ProductCard, {
        product: productCardModel(row({ imageAssetId: "approved-photo" })),
        quantity: 3,
        onSelect: () => {},
      }),
    );
    expect(html).toContain("3 en pedido");
    expect(html).toContain('aria-label="Agregar Té con un nombre largo"');
    expect(html).toContain("/api/media/approved-photo?size=thumbnail");
    expect(html).not.toContain("figma.com");
  });
});
