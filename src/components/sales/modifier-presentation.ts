type ModifierSwatch = {
  kind: "swatch";
  color: string;
  checkColor: string;
};

export type ModifierAppearance = ModifierSwatch | { kind: "no-pearls" };

const navy = "#013E5E";
const white = "#FFFFFF";
const neutralSwatch: ModifierSwatch = {
  kind: "swatch",
  color: "#D5E1E8",
  checkColor: navy,
};
const swatches = new Map<string, ModifierSwatch>([
  ["chocolate", { kind: "swatch", color: "#956545", checkColor: white }],
  ["mango", { kind: "swatch", color: "#F5BD35", checkColor: navy }],
  ["passion-fruit", { kind: "swatch", color: "#F5CA52", checkColor: navy }],
  ["blackberry", { kind: "swatch", color: "#74478C", checkColor: white }],
  ["strawberry", { kind: "swatch", color: "#C94254", checkColor: white }],
]);

export function modifierAppearance(key?: string): ModifierAppearance {
  if (key === "no-pearls") return { kind: "no-pearls" };
  return (key && swatches.get(key)) || neutralSwatch;
}
