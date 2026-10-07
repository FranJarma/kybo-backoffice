import { describe, it, expect } from "vitest";
import {
  navigation,
  visibleNavigation,
  breadcrumbs,
  legacyRedirects,
  resolveNavigation,
} from "../src/lib/navigation";
describe("navegación por áreas", () => {
  it("tiene rutas únicas y resuelve sólo la pantalla exacta", () => {
    expect(new Set(navigation.map((n) => n.href)).size).toBe(navigation.length);
    expect(resolveNavigation("/products/recipes")?.id).toBe("recipes");
    expect(resolveNavigation("/products/unknown")).toBeUndefined();
  });
  it("ubica los modificadores bajo productos", () => {
    expect(
      breadcrumbs("/products/modifiers", { role: "admin" }).map((b) => b.label),
    ).toEqual(["Inicio", "Productos", "Modificadores"]);
  });
  it("personal no recibe enlaces restringidos", () => {
    expect(visibleNavigation({ role: "staff" }).map((n) => n.id)).toEqual([
      "sales",
      "tables",
      "kitchen",
      "branches",
    ]);
    expect(
      breadcrumbs("/sales/tables", { role: "staff" }).map((b) => b.href),
    ).not.toContain("/");
  });
  it("gestión de catálogo no habilita inventario operativo", () => {
    const ids = visibleNavigation({ role: "staff", catalogManager: true }).map(
      (n) => n.id,
    );
    expect(ids).toContain("recipes");
    expect(ids).not.toContain("production");
    expect(ids).not.toContain("inventory");
    expect(
      breadcrumbs("/inventory/items", {
        role: "staff",
        catalogManager: true,
      }).some((b) => b.href === "/inventory"),
    ).toBe(false);
  });
  it("todas las redirecciones terminan en rutas canónicas", () => {
    for (const r of legacyRedirects) {
      expect(resolveNavigation(r.destination)).toBeDefined();
      expect(r.source).not.toBe(r.destination);
      expect(r.permanent).toBe(true);
    }
  });
});
