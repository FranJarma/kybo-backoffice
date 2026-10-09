import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { BranchSelector } from "../src/components/branches/selector";

vi.stubGlobal("React", React);
const rows = [
  { id: "a", name: "Principal" },
  { id: "b", name: "Centro" },
];
describe("sucursal inicial", () => {
  it("muestra la seleccion validada desde el primer render", () => {
    const html = renderToStaticMarkup(
      React.createElement(BranchSelector, { rows, selected: "b" }),
    );
    expect(html).toContain('<option value="b" selected="">Centro</option>');
    expect(html).not.toContain("Cargando");
  });
  it("no muestra una seleccion que ya no esta disponible", () => {
    const html = renderToStaticMarkup(
      React.createElement(BranchSelector, { rows, selected: "revoked" }),
    );
    expect(html).toContain('<option value="" selected="">');
    expect(html).not.toContain("revoked");
  });
  it("explica cuando no hay sucursales disponibles", () => {
    const html = renderToStaticMarkup(
      React.createElement(BranchSelector, { rows: [] }),
    );
    expect(html).toContain('disabled=""');
    expect(html).toContain("Sin sucursales disponibles");
  });
});
