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
  it("uses explicit stable-ID metadata rather than the visible name", () => {
    const appearance = {
      stripes: ["#E9CEAE", "#D2A775", "#A87345", "#68432F"] as const,
    };
    expect(
      productAppearance("stable-tea", { "stable-tea": appearance }),
    ).toEqual(appearance);
    expect(
      productAppearance("another-id", { "stable-tea": appearance }),
    ).not.toEqual(appearance);
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
