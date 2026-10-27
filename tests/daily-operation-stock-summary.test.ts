import { expect, it } from "vitest";
import { summarizeStockByItem } from "@/modules/daily-operations/stock-summary";
import type { StockRow } from "@/modules/daily-operations/types";
const row = (
  locationId: string,
  physical: string,
  reserved = "0.000000",
  unusable = "0.000000",
  available = physical,
): StockRow => ({
  itemId: "milk",
  itemName: "Leche",
  unit: "ml",
  locationId,
  locationName: locationId,
  physical,
  reserved,
  unusable,
  available,
});
it("all locations totals each item before pagination, including stock outside the first location", () => {
  const stock = [
    row("Barra", "0.000000"),
    row("Cocina", "0.000000"),
    row("Depósito", "12.500001", "1.250000", "2.000000", "9.250001"),
  ];
  const [summary] = summarizeStockByItem(stock, "");
  expect(summary).toMatchObject({
    itemId: "milk",
    physical: "12.500001",
    reserved: "1.250000",
    unusable: "2.000000",
    available: "9.250001",
  });
  expect(summary.locations).toEqual(stock);
  expect(stock[0].physical).toBe("0.000000");
});
it("a selected location shows only its own balance and returning to all restores totals", () => {
  const stock = [row("Barra", "2.000000"), row("Depósito", "10.000000")];
  expect(summarizeStockByItem(stock, "Barra")[0]).toMatchObject({
    physical: "2.000000",
    available: "2.000000",
    locations: [stock[0]],
  });
  expect(summarizeStockByItem(stock, "")[0].physical).toBe("12.000000");
  expect(summarizeStockByItem(stock, "missing")).toEqual([]);
});
it("50 items across three locations remain 50 records with their separate units and zero balances", () => {
  const stock = Array.from({ length: 50 }, (_, i) =>
    ["Barra", "Cocina", "Depósito"].map((loc) => ({
      ...row(loc, loc === "Depósito" ? "1.000000" : "0.000000"),
      itemId: `item-${i}`,
      itemName: `Insumo ${i}`,
      unit: i === 0 ? "g" : "unit",
    })),
  ).flat();
  const summaries = summarizeStockByItem(stock, "");
  expect(summaries).toHaveLength(50);
  expect(summaries.every((s) => s.available === "1.000000")).toBe(true);
  expect(summaries[0].unit).toBe("g");
  expect(summaries[1].unit).toBe("unit");
  expect(summarizeStockByItem(stock, "Barra")[0].available).toBe("0.000000");
});
