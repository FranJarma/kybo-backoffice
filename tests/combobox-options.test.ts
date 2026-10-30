import { expect, it } from "vitest";
import { filterComboboxOptions } from "@/components/ui/combobox-options";

const rows = [
  {
    id: "guemes",
    name: "Alberdi 143",
    description: "General Güemes · Salta · Argentina",
  },
  {
    id: "capital",
    name: "Peatonal Juan Bautista Alberdi 143",
    description: "Salta · Capital · Salta · Argentina",
  },
];
it("keeps semantic server results selectable for a full comma-separated address", () => {
  expect(
    filterComboboxOptions(rows, "Alberdi 143, Salta, Argentina", "remote").map(
      (row) => row.id,
    ),
  ).toEqual(["guemes", "capital"]);
});
it("continues filtering ordinary local relations by name or description", () => {
  expect(filterComboboxOptions(rows, "Capital").map((row) => row.id)).toEqual([
    "capital",
  ]);
  expect(filterComboboxOptions(rows, "No existe")).toEqual([]);
});
