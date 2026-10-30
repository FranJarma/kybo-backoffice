import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { WorkplaceManager } from "@/components/workplace/manager";
import { WorkplaceActions } from "@/components/workplace/actions";
import { WorkplaceSummary } from "@/components/workplace/summary";

it("requests a personal authorization without replacing the shared POS login", () => {
  const html = renderToStaticMarkup(
    React.createElement(WorkplaceManager, { branchId: "test-branch" }),
  );
  expect(html).toContain("Gestionar turno");
  expect(html).toContain("Usuario o correo personal");
  expect(html).toContain("Contraseña");
  expect(html).toContain("El pedido que estás tomando se conserva");
  expect(html).not.toMatch(/PIN|Cambiar usuario|Cerrar sesión|Simular/);
});
it("offers protected management alongside the operational sale", () => {
  const html = renderToStaticMarkup(
    React.createElement(WorkplaceActions, { branchId: "test-branch" }),
  );
  expect(html).toContain("Gestionar turno");
  expect(html).not.toContain("Contraseña");
});
it("shows assigned responsibility separately from the shared account's sales identity", () => {
  const html = renderToStaticMarkup(
    React.createElement(WorkplaceSummary, {
      branchId: "branch",
      initial: {
        branchId: "branch",
        now: "2026-10-29T15:00:00Z",
        timeZone: "America/Argentina/Buenos_Aires",
        rows: [
          {
            personName: "Lucía",
            stationName: "Barra",
            startsAt: "2026-10-29T12:00:00Z",
            endsAt: "2026-10-29T20:00:00Z",
          },
        ],
      },
    }),
  );
  expect(html).toContain("Lucía");
  expect(html).toContain("Barra");
  expect(html).toContain("09:00");
  expect(html).toContain("Responsables del turno");
  expect(html).toContain("Las ventas se registran con la cuenta del local");
});
