import { money } from "@/lib/number-format";
import type { SaleLookup } from "@/modules/sales/types";

export type ProductAppearance = {
  stripes: readonly [string, string, string, string];
};

const neutralAppearance: ProductAppearance = {
  stripes: ["#E7EDF0", "#D5E1E8", "#C5D4DC", "#B6C9D4"],
};

/** Visual metadata follows persistent identities, independently of product names. */
export function productAppearance(
  productId: string,
  overrides: Readonly<Record<string, ProductAppearance>> = {},
): ProductAppearance {
  return Object.hasOwn(overrides, productId)
    ? overrides[productId]
    : neutralAppearance;
}

export type ProductCardModel = {
  id: string;
  name: string;
  priceLabel: string;
  imageAssetId: string | null;
  selectable: boolean;
  unavailableReason: string | null;
  appearance: ProductAppearance;
};

export function productCardModel(
  row: SaleLookup["rows"][number],
): ProductCardModel {
  const unavailableReason = row.temporarilySoldOut
    ? "Agotado temporalmente"
    : row.vatPending
      ? "Configurá el IVA del producto"
      : row.configured === false
        ? "Falta completar la ficha"
        : row.price == null
          ? "Sin precio"
          : null;

  return {
    id: row.id,
    name: row.name,
    priceLabel: row.vatPending
      ? "IVA pendiente"
      : row.price == null
        ? "Sin precio"
        : money(row.price),
    imageAssetId: row.imageAssetId ?? null,
    selectable: unavailableReason === null,
    unavailableReason,
    appearance: productAppearance(row.id),
  };
}
