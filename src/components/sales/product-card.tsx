"use client";

import { Button } from "@/components/ui/button";
import { ProductPhoto } from "@/components/products/photo";
import type { ProductCardModel } from "./pos-presentation";

export function ProductCard({
  product,
  quantity = 0,
  locked = false,
  onSelect,
}: {
  product: ProductCardModel;
  quantity?: number;
  locked?: boolean;
  onSelect: () => void;
}) {
  const stripes = product.appearance.stripes;
  return (
    <Button
      type="button"
      variant="outline"
      className="pos-product-card"
      aria-label={`Agregar ${product.name}`}
      data-in-order={quantity > 0}
      disabled={locked || !product.selectable}
      onClick={onSelect}
    >
      <span className="pos-product-name">{product.name}</span>
      <span className="pos-product-price">{product.priceLabel}</span>
      {product.unavailableReason && (
        <span className="pos-product-availability">
          {product.unavailableReason}
        </span>
      )}
      {quantity > 0 && (
        <span className="pos-product-count">{quantity} en pedido</span>
      )}
      <span
        className="pos-product-stripes"
        aria-hidden="true"
        style={{
          background: `repeating-linear-gradient(to bottom, ${stripes[0]} 0 16px, ${stripes[1]} 16px 32px, ${stripes[2]} 32px 48px, ${stripes[3]} 48px 64px)`,
        }}
      />
      <span className="pos-product-photo">
        <ProductPhoto
          id={product.imageAssetId}
          name={product.name}
          variant="thumbnail"
        />
      </span>
    </Button>
  );
}
