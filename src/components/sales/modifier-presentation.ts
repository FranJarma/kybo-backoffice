type ModifierSwatch = {
  kind: "swatch";
  color: string;
  checkColor: string;
};

export type ModifierAppearance = ModifierSwatch | { kind: "no-pearls" };

const navy = "#013E5E";
const white = "#FFFFFF";

function swatch(color: string, checkColor: string): ModifierSwatch {
  return { kind: "swatch", color, checkColor };
}

const palette = {
  neutral: swatch("#D5E1E8", navy),
  tapioca: swatch("#513A34", white),
  chocolate: swatch("#956545", white),
  strawberry: swatch("#C94254", white),
  mango: swatch("#F5BD35", navy),
  passionFruit: swatch("#F5CA52", navy),
  blackberry: swatch("#74478C", white),
  caramel: swatch("#D68A4A", navy),
  dulceDeLeche: swatch("#A86238", white),
  cream: swatch("#F7E8CC", navy),
  noPearls: { kind: "no-pearls" },
} satisfies Record<string, ModifierAppearance>;

const appearanceByKey = new Map<string, keyof typeof palette>([
  ["chocolate", "chocolate"],
  ["mango", "mango"],
  ["passion-fruit", "passionFruit"],
  ["blackberry", "blackberry"],
  ["strawberry", "strawberry"],
  ["no-pearls", "noPearls"],

  // Persisted keys from Perlas a elección.
  ["954f6731-0128-40d1-8f0c-4063fee07617", "tapioca"],
  ["1875fd4b-bae4-407e-9ca8-f70fc2c76850", "chocolate"],
  ["84f02641-0f52-463c-8833-49e01818704e", "strawberry"],
  ["b07eb534-9c5d-4dc0-975b-7e74c434c53c", "mango"],
  ["a5f1e6b0-4a9a-4fb5-a1db-d2f21b8d1aa6", "passionFruit"],
  ["0f7efef8-b1d1-46f8-9605-fed632473170", "blackberry"],
  ["229be374-c4bf-4f7c-a4f9-0cc4e5f84700", "noPearls"],

  // Persisted keys from Salsa a elección and Salsa para Kybo Soft Cono.
  ["0eff36cf-ebf1-4d10-850a-f738ea164a28", "caramel"],
  ["3283b742-82be-4a8b-9718-51e5e60316d6", "chocolate"],
  ["f11c17a9-d65e-4d37-82b7-cfcb0843c6d6", "dulceDeLeche"],
  ["e00338f0-8ae3-4988-b8af-dd9ac86d7bfe", "strawberry"],
  ["9bf66daa-1dd6-4cfc-a5d9-e99116c46a67", "neutral"],
  ["caramelo", "caramel"],
  ["frutilla", "strawberry"],
  ["frutos-rojos", "blackberry"],
  ["sin-salsa", "neutral"],

  // Persisted keys from Helado a elección and the Kybo Soft flavor group.
  ["93648086-71f4-494c-8266-b608083c8e12", "cream"],
  ["9150176f-fdd7-46ea-b252-53196b068892", "chocolate"],
  ["14fcc687-670f-4512-8c97-79d3b863c062", "dulceDeLeche"],
  ["795dce84-b27e-4db5-a8fd-feeb499726e9", "strawberry"],
  ["americana", "cream"],
  ["dulce-de-leche", "dulceDeLeche"],
]);

export function modifierAppearance(key?: string): ModifierAppearance {
  if (!key) return palette.neutral;
  return palette[appearanceByKey.get(key) ?? "neutral"];
}
