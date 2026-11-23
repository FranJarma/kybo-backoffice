import { productVisualAssets } from "./product-visual-assets";
import { money } from "@/lib/number-format";
import type { SaleLookup } from "@/modules/sales/types";

type StripeColor = `#${string}`;

export type ProductAppearance = {
  photoSrc?: string;
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

// Product UUIDs keep photos and palettes stable when catalogue names change.
const productVisualKeys: Readonly<
  Record<string, keyof typeof productVisualAssets>
> = {
  "b3143b9a-c1e7-4b68-bfc3-cc9c06c5d3a2": "bubble-sunrise",
  "a7af601e-e6cd-4ec9-9a2e-383c9ba68dc9": "waffle-salado",
  "31d93726-3ff4-4ac5-a14e-405e3a27f9f7": "waffle-salado",
  "a83e25f6-8b50-493f-a9fe-57ba74a03533": "kybo-shake-oreo",
  "36145bed-d3f4-4ddc-9289-1097992cd692": "kybo-shake-americana",
  "d47f268b-2d57-4642-a9ff-5695aa0c2ce7": "kybo-shake-taro",
  "4690a82f-c39d-4b89-9f0b-b386c727d8f9": "kybo-tea",
  "d066dc77-aa59-4570-ae75-b9d585addc9b": "blueberry-bubble",
  "9bb0cebb-c87b-48ce-8e17-d596ef1ec71c": "iced-matcha",
  "02236be3-4f5a-4e9a-ba21-4c544f0c1c1e": "red-matcha",
  "6b810ba8-0dd9-419f-ab47-b8ddd6062ce3": "tropical-matcha",
  "cdbab2df-9424-4ea9-8358-35a1b91a09a7": "blue-iced-matcha",
  "c8f9f85d-fe9b-4b2b-9acc-11df3e7ad4a8": "taro-iced-latte",
  "d8667694-d0b4-49ff-90cb-e72f3cc6aa17": "oreo-iced-latte",
  "f60e2f4d-e48a-46a4-aa74-25efff4b7a9c": "coffee-iced-latte",
  "30a9fd90-2f51-41b1-839c-8760f54b20a6": "frozen-mango-y-durazno",
  "35f4099a-a0d5-4f0d-afa5-ab5dfff9b1c9": "kybo-soft-chocolate",
  "1685d383-5581-459f-a5c4-2777331c243e": "kybo-soft-frutilla",
  "1bee7489-5ee8-4e93-a586-d85629cef23f": "kybo-soft-frutos-rojos",
  "f002ff81-014c-4390-a8d4-77c183884cc6": "americano",
  "3efc7be3-52af-402e-9990-350d0f1599f4": "cappuccino",
  "39a056ac-0e6d-41da-acd5-31925ce6e977": "matcha-caliente",
  "0f221035-8cc3-4607-bda6-a36c45645eef": "taro-caliente",
  "0b426839-f812-4915-9dff-5936e1ac352c": "superpancho",
  "002e76fd-0563-4eb2-adce-9c770516864d": "medialunas",
  "9776c111-accd-4776-9169-032d8b8edca7": "waffle-cafe",
  "8401749e-cd0d-40b8-b002-e98a483c47ba": "medialunas-cafe",
  "31059181-4ddb-427e-b568-328588b388c0": "waffle-lata-de-gaseosa",
  "d7ae8902-aff7-40f4-9779-14875082ffce": "2-waffles-gaseosa",
  "4245713e-7ac8-40e6-b3f9-155ee4edff05": "2-superpanchos-gaseosa",
  "d1fdc5d2-0fd7-4f60-8bbb-781e658a60ec": "superpancho-lata-de-gaseosa",
  "3d3dc3c9-45d5-414f-9a0b-419dc3f34ca6": "box-waffle-para-4",
  // Visual equivalences explicitly approved by the catalogue owner.
  "3217a420-1658-43ef-a84e-582a21146113": "flat-white",
  "cfa734c7-7957-43ac-8df8-aabeefdf4114": "mocca",
  "efb8602b-6695-4fad-9fb5-b58c86b347b3": "tostados",
  "b184da69-9a1e-44b3-8af2-45703879ccab": "tostados",
};

/** Visual metadata follows persistent identities, independently of product names. */
export function productAppearance(productId: string): ProductAppearance {
  return Object.hasOwn(productVisualKeys, productId)
    ? productVisualAssets[productVisualKeys[productId]]
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
