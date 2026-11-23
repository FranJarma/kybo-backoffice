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
  it("uses a neutral palette for catalogue products without a supplied design", () => {
    const neutral = productAppearance("unknown");
    for (const id of [
      "e5860d4a-6aac-4669-bce0-906603c45199", // Cono is absent from both ZIPs.
      "c4faf0a3-a1d4-4166-832b-31bf9d10b66e", // Cookies are absent too.
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

    expect(html).toContain("linear-gradient(to bottom, #ce9d76 0");
    expect(html).toContain("#33231d 75% 87.5%, #33231d 87.5% 100%)");
    expect(html).not.toContain("repeating-linear-gradient");
  });
  it.each([
    ["c8f9f85d-fe9b-4b2b-9acc-11df3e7ad4a8", "taro-iced-latte"],
    ["f60e2f4d-e48a-46a4-aa74-25efff4b7a9c", "coffee-iced-latte"],
    ["8401749e-cd0d-40b8-b002-e98a483c47ba", "medialunas-cafe"],
    ["3217a420-1658-43ef-a84e-582a21146113", "flat-white"],
    ["cfa734c7-7957-43ac-8df8-aabeefdf4114", "mocca"],
    ["efb8602b-6695-4fad-9fb5-b58c86b347b3", "tostados"],
    ["b184da69-9a1e-44b3-8af2-45703879ccab", "tostados"],
  ])(
    "renders the supplied cutout for %s even with an old or missing media photo",
    (id, asset) => {
      for (const imageAssetId of [null, "old-white-background"]) {
        const html = renderToStaticMarkup(
          createElement(ProductCard, {
            product: productCardModel(
              row({ id, name: "Renamed product", imageAssetId }),
            ),
            onSelect: () => {},
          }),
        );
        expect(html).toContain(
          encodeURIComponent(`/images/pos-products/${asset}.webp`),
        );
        expect(html).not.toContain("/api/media/old-white-background");
        expect(html).toContain('sizes="100px"');
      }
    },
  );
  it("renders the supplied food circle in cream behind the cutout", () => {
    const html = renderToStaticMarkup(
      createElement(ProductCard, {
        product: productCardModel(
          row({ id: "a7af601e-e6cd-4ec9-9a2e-383c9ba68dc9" }),
        ),
        onSelect: () => {},
      }),
    );
    expect(html).toContain("linear-gradient(to bottom, #fff1d4 0");
    expect(html).toContain(
      encodeURIComponent("/images/pos-products/waffle-salado.webp"),
    );
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
