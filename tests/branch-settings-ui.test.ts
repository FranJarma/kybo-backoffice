import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import { BranchProductSettings } from "@/components/branches/product-settings";

vi.stubGlobal("React", React);

it("explains a failed locations dependency and exposes recovery inside Products", () => {
  const html = renderToStaticMarkup(
    React.createElement(BranchProductSettings, {
      branchId: "alberdi",
      locations: [],
      canEditCatalog: true,
      locationsReady: false,
      locationsError: "No pudimos cargar las ubicaciones.",
      onReloadLocations: () => {},
    }),
  );
  expect(html).toContain('role="alert"');
  expect(html).toContain("No pudimos cargar las ubicaciones.");
  expect(html).toContain("Volver a cargar ubicaciones");
});

it("reports the pending locations dependency before enabling branch product edits", () => {
  const html = renderToStaticMarkup(
    React.createElement(BranchProductSettings, {
      branchId: "alberdi",
      locations: [],
      canEditCatalog: true,
      locationsReady: false,
    }),
  );
  expect(html).toContain('role="status"');
  expect(html).toContain("Cargando ubicaciones de esta sucursal");
});
