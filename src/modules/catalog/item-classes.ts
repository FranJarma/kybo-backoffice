export const itemClasses = [
  { value: "food", label: "Alimento" },
  { value: "beverage", label: "Bebida" },
  { value: "packaging", label: "Descartable" },
  { value: "cleaning", label: "Limpieza" },
  { value: "other", label: "Otro" },
];

export function itemClassLabel(value: unknown) {
  return (
    itemClasses.find((item) => item.value === value)?.label ?? "Sin clasificar"
  );
}

export function recipeSection(itemClass?: string | null) {
  if (itemClass === "packaging") return "Descartables";
  if (itemClass === "food" || itemClass === "beverage") return "Ingredientes";
  return "Otros componentes";
}
