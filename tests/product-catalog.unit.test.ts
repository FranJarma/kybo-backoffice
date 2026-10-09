import { describe, expect, it } from "vitest";
import { parseInput } from "../src/modules/catalog/validation";
describe("ficha comercial", () => {
  const old = {
    name: "Té",
    priceCounter: "0",
    pricePedidosYa: "",
    priceUberEats: "",
  };
  it("acepta categoría, descripción, orden y canales independientes", () => {
    const row = parseInput("products", {
      ...old,
      categoryId: null,
      description: " Té frío ",
      sortOrder: 3,
      enabledCounter: true,
      enabledPedidosYa: false,
      enabledUberEats: true,
      imageAssetId: null,
    });
    expect(row.description).toBe("Té frío");
    expect(row.priceCounter).toBe("0.00");
    expect(row.pricePedidosYa).toBeNull();
    expect(row.enabledPedidosYa).toBe(false);
  });
  it("no inventa campos nuevos en peticiones antiguas", () => {
    const row = parseInput("products", old);
    expect(row).not.toHaveProperty("categoryId");
    expect(row).not.toHaveProperty("imageAssetId");
    expect(row).not.toHaveProperty("enabledCounter");
  });
  it("admite categorías y rechaza órdenes negativos", () => {
    expect(
      parseInput("categories" as never, { name: "Bebidas", sortOrder: 2 })
        .sortOrder,
    ).toBe(2);
    expect(() => parseInput("products", { ...old, sortOrder: -1 })).toThrow();
  });
});
