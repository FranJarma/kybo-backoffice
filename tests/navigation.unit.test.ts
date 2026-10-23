import { describe, it, expect } from "vitest";
import {
  navigation,
  visibleNavigation,
  breadcrumbs,
  legacyRedirects,
  resolveNavigation,
  navigationIsActive,
} from "../src/lib/navigation";
describe("navegación por áreas", () => {
  it("da acceso a mínimos en inventario solo al encargado y administrador", () => {
    for (const role of ["manager", "admin"]) {
      const entry = visibleNavigation({ role }).find(
        (n) => n.href === "/inventory/replenishment",
      );
      expect(entry).toMatchObject({
        label: "Mínimos de reposición",
        area: "Inventario y compras",
        parent: "inventory",
      });
    }
    expect(
      visibleNavigation({ role: "staff", catalogManager: true }).some(
        (n) => n.href === "/inventory/replenishment",
      ),
    ).toBe(false);
    expect(
      breadcrumbs("/inventory/replenishment", { role: "manager" }).map(
        (b) => b.label,
      ),
    ).toEqual(["Inicio", "Inventario y compras", "Mínimos de reposición"]);
  });
  it("reserva sucursales y ubicaciones al administrador aunque el encargado gestione catálogo", () => {
    expect(
      visibleNavigation({ role: "admin" }).some((n) => n.id === "branches"),
    ).toBe(true);
    expect(
      visibleNavigation({ role: "manager", catalogManager: true }).some(
        (n) => n.id === "branches",
      ),
    ).toBe(false);
    expect(
      visibleNavigation({ role: "manager", catalogManager: true }).some(
        (n) => n.href === "/settings/payment-methods",
      ),
    ).toBe(false);
    expect(
      visibleNavigation({ role: "staff", catalogManager: true }).some(
        (n) => n.href === "/settings/payment-methods",
      ),
    ).toBe(false);
  });
  it("reserva la administración de usuarios exclusivamente al administrador", () => {
    expect(
      visibleNavigation({ role: "admin" }).some(
        (n) => n.href === "/settings/users",
      ),
    ).toBe(true);
    expect(
      visibleNavigation({ role: "manager" }).some(
        (n) => n.href === "/settings/users",
      ),
    ).toBe(false);
    expect(
      visibleNavigation({ role: "staff", catalogManager: true }).some(
        (n) => n.href === "/settings/users",
      ),
    ).toBe(false);
  });
  it("agrupa los dos tipos de opciones sin duplicar entradas del sidebar", () => {
    const entries = visibleNavigation({ role: "admin" });
    expect(entries.find((n) => n.id === "modifiers")?.label).toBe(
      "Grupos de opciones",
    );
    expect(entries.some((n) => n.href === "/products/combo-groups")).toBe(
      false,
    );
    expect(
      breadcrumbs("/products/combo-groups", { role: "admin" }).map(
        (b) => b.label,
      ),
    ).toEqual(["Inicio", "Productos", "Productos para combos"]);
    expect(
      navigationIsActive("/products/modifiers", "/products/combo-groups"),
    ).toBe(true);
    expect(navigationIsActive("/products", "/products/combo-groups")).toBe(
      false,
    );
  });
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
      "daily-operations",
      "sales",
      "tables",
      "kitchen",
      "production",
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
    expect(ids).toContain("production");
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
