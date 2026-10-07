import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { Breadcrumb } from "../src/components/ui/breadcrumb";
import { AppShell } from "../src/components/app-shell";
import { breadcrumbs } from "../src/lib/navigation";

vi.stubGlobal("React", React);
vi.mock("next/navigation", () => ({
  usePathname: () => "/products/recipes",
  useRouter: () => ({ replace: vi.fn(), refresh: vi.fn() }),
}));
vi.mock("@/components/branches/selector", () => ({
  BranchSelector: () => null,
}));

describe("navegación renderizada", () => {
  it("identifica la ubicación y deja la página actual sin enlace", () => {
    const html = renderToStaticMarkup(
      React.createElement(Breadcrumb, {
        items: breadcrumbs("/products/recipes", { role: "admin" }),
      }),
    );
    expect(html).toContain('aria-label="Ubicación"');
    expect(html).toContain("<ol");
    expect(html).toContain('href="/products"');
    expect(html).not.toContain('href="/products/recipes"');
    expect(html.match(/aria-current="page"/g)).toHaveLength(1);
    expect(html.indexOf("Inicio")).toBeLessThan(html.indexOf("Productos"));
    expect(html.indexOf("Productos")).toBeLessThan(html.indexOf("Recetas"));
  });
  it("marca sólo Recetas como enlace activo y conserva acceso al menú móvil", () => {
    const props = {
      role: "admin",
      name: "Prueba",
      dateLabel: "28 de septiembre",
      children: "Contenido",
    };
    const html = renderToStaticMarkup(React.createElement(AppShell, props));
    const links = html.match(/<a\b[^>]*aria-current="page"[^>]*>/g) ?? [];
    expect(links).toHaveLength(1);
    expect(links[0]).toContain('href="/products/recipes"');
    expect(html).toContain('aria-label="Abrir menú"');
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain('href="#main-content"');
    expect(html).not.toContain("Administración</");
  });
});
