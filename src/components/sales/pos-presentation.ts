import { money } from "@/lib/number-format";
import type { SaleLookup } from "@/modules/sales/types";

type StripeColor = `#${string}`;

export type ProductAppearance = {
  stripes: readonly [
    StripeColor,
    StripeColor,
    StripeColor,
    StripeColor,
    StripeColor,
    StripeColor,
    StripeColor,
    StripeColor,
  ];
};

const neutralAppearance: ProductAppearance = {
  stripes: [
    "#E7EDF0",
    "#E7EDF0",
    "#D5E1E8",
    "#D5E1E8",
    "#C5D4DC",
    "#C5D4DC",
    "#B6C9D4",
    "#B6C9D4",
  ],
};

// Each entry contains the eight 19px rows of its 152px Figma semicircle.
const productAppearances: Readonly<Record<string, ProductAppearance>> = {
  "d8667694-d0b4-49ff-90cb-e72f3cc6aa17": {
    stripes: [
      "#E9CEAE",
      "#E9CEAE",
      "#D2A775",
      "#D2A775",
      "#A87345",
      "#A87345",
      "#68432F",
      "#352B26",
    ],
  },
  "36145bed-d3f4-4ddc-9289-1097992cd692": {
    stripes: [
      "#F6E3BF",
      "#F6E3BF",
      "#EDD0A0",
      "#EDD0A0",
      "#EDD0A0",
      "#DAB57F",
      "#DAB57F",
      "#C29560",
    ],
  },
  "a83e25f6-8b50-493f-a9fe-57ba74a03533": {
    stripes: [
      "#F1E4D1",
      "#F1E4D1",
      "#DAC4AA",
      "#DAC4AA",
      "#DAC4AA",
      "#9F7C60",
      "#614A3B",
      "#342C27",
    ],
  },
  "d47f268b-2d57-4642-a9ff-5695aa0c2ce7": {
    stripes: [
      "#E7DAF0",
      "#E7DAF0",
      "#C4A4E4",
      "#C4A4E4",
      "#C4A4E4",
      "#A67ACB",
      "#A67ACB",
      "#71518D",
    ],
  },
  "30a9fd90-2f51-41b1-839c-8760f54b20a6": {
    stripes: [
      "#FFE29A",
      "#FFE29A",
      "#FFC14A",
      "#FFC14A",
      "#FFC14A",
      "#FFA329",
      "#E87325",
      "#DC4C36",
    ],
  },
  "35f4099a-a0d5-4f0d-afa5-ab5dfff9b1c9": {
    stripes: [
      "#F0D4BA",
      "#F0D4BA",
      "#B98666",
      "#B98666",
      "#B98666",
      "#956043",
      "#69422D",
      "#493026",
    ],
  },
  "1685d383-5581-459f-a5c4-2777331c243e": {
    stripes: [
      "#FFE0DF",
      "#FFE0DF",
      "#F6B1BC",
      "#F6B1BC",
      "#F6B1BC",
      "#ED849C",
      "#D95776",
      "#B53859",
    ],
  },
  "1bee7489-5ee8-4e93-a586-d85629cef23f": {
    stripes: [
      "#F1D4E4",
      "#F1D4E4",
      "#D99DB8",
      "#D99DB8",
      "#D99DB8",
      "#B66794",
      "#914468",
      "#693950",
    ],
  },
  "3efc7be3-52af-402e-9990-350d0f1599f4": {
    stripes: [
      "#F6E1BE",
      "#F6E1BE",
      "#E8BE8F",
      "#E8BE8F",
      "#E8BE8F",
      "#C38D5B",
      "#A26B43",
      "#795037",
    ],
  },
};

/** Visual metadata follows persistent identities, independently of product names. */
export function productAppearance(productId: string): ProductAppearance {
  return Object.hasOwn(productAppearances, productId)
    ? productAppearances[productId]
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
