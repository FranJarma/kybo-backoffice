import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import { BranchSelector } from "@/components/branches/selector";

vi.stubGlobal("React", React);

it("separates the branch name and address while preserving the full option label", () => {
  for (const separator of ["—", "–"]) {
    const name = `Kalú Gamezone ${separator} Peatonal Alberdi`;
    const html = renderToStaticMarkup(
      React.createElement(BranchSelector, {
        selected: "branch",
        rows: [{ id: "branch", name }],
      }),
    );
    expect(html).toContain(">Kalú Gamezone</span>");
    expect(html).toContain(">Peatonal Alberdi</span>");
    expect(html).toContain(name);
    expect(html).toContain('id="active-branch"');
  }
});

it("shows an assigned branch without an interactive selector for staff", () => {
  const html = renderToStaticMarkup(
    React.createElement(BranchSelector, {
      readOnly: true,
      selected: "branch",
      rows: [{ id: "branch", name: "Kalú" }],
    }),
  );
  expect(html).toContain("Kalú");
  expect(html).toContain("Sucursal asignada");
  expect(html).not.toContain("<select");
});
