import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { ReplenishmentContent } from "@/components/sales/replenishment-panel";
import type { ReplenishmentSnapshot } from "@/modules/replenishment/types";

vi.stubGlobal("React", React);
const snapshot: ReplenishmentSnapshot = {
  asOf: "2026-10-18T12:00:00.000Z",
  locations: [{ id: "bar", name: "Barra" }],
  items: [{ id: "tea", name: "Té chai preparado", baseUnit: "ml" }],
  policies: [
    {
      id: "rule",
      revision: 1,
      itemId: "tea",
      itemName: "Té chai preparado",
      baseUnit: "ml",
      locationId: "bar",
      locationName: "Barra",
      minimumQuantity: "1000.000000",
      targetQuantity: "3000.000000",
      preparationMinutes: 30,
      enabled: true,
    },
  ],
  alerts: [
    {
      id: "rule",
      itemId: "tea",
      itemName: "Té chai preparado",
      baseUnit: "ml",
      locationId: "bar",
      locationName: "Barra",
      minimumQuantity: "1000.000000",
      targetQuantity: "3000.000000",
      preparationMinutes: 30,
      kind: "production",
      severity: "low",
      availableQuantity: "500.000000",
      suggestedQuantity: "2500.000000",
      sources: [],
      activeProduction: [
        {
          id: "production",
          plannedQuantity: "2000.000000",
          state: "planned",
          assignedToName: "Abi",
        },
      ],
    },
  ],
};
const render = (
  props: Partial<React.ComponentProps<typeof ReplenishmentContent>>,
) =>
  renderToStaticMarkup(
    React.createElement(ReplenishmentContent, {
      role: "manager",
      snapshot,
      loading: false,
      error: "",
      ...props,
    }),
  );

describe("consulta operativa de reposición", () => {
  it("no presenta faltas como resueltas durante carga o error, aunque conserve datos anteriores", () => {
    const healthy = { ...snapshot, alerts: [] };
    expect(render({ snapshot: healthy, loading: true })).toContain(
      "Actualizando existencias",
    );
    expect(render({ snapshot: healthy, loading: true })).not.toContain(
      "Dentro de los mínimos",
    );
    expect(render({ snapshot: healthy, error: "Sin conexión" })).toContain(
      "La última lectura puede haber cambiado",
    );
    expect(render({ snapshot: healthy, error: "Sin conexión" })).not.toContain(
      "Dentro de los mínimos",
    );
  });
  it("explica la ausencia de reglas y los permisos de configuración", () => {
    expect(
      render({ snapshot: { ...snapshot, alerts: [], policies: [] } }),
    ).toContain("Configurá mínimos");
    const staff = render({
      role: "staff",
      snapshot: { ...snapshot, alerts: [], policies: [] },
    });
    expect(staff).toContain("encargado");
    expect(staff).not.toContain("Dentro de los mínimos");
  });
  it("separa producción pendiente de existencias y dirige al empleado a sus tareas", () => {
    const html = render({ role: "staff" });
    expect(html).toContain("Preparar");
    expect(html).toContain("500 ml");
    expect(html).toContain("2.000 ml");
    expect(html).toContain("Abi");
    expect(html).toContain("no suma stock disponible");
    expect(html).toContain('href="/kitchen/production"');
    expect(html).not.toContain('href="/inventory"');
    expect(html).not.toContain("Crear orden");
  });
  it("ofrece traslado de stock separado de compra y producción", () => {
    const html = render({
      snapshot: {
        ...snapshot,
        alerts: [
          {
            ...snapshot.alerts[0],
            kind: "transfer",
            activeProduction: [],
            sources: [
              {
                locationId: "depot",
                locationName: "Depósito",
                availableQuantity: "12000.000000",
              },
            ],
          },
        ],
      },
    });
    expect(html).toContain("Reponer");
    expect(html).toContain("Depósito");
    expect(html).toContain("12.000 ml");
    expect(html).toContain('href="/inventory/transfers"');
  });
  it("identifica una producción comenzada sin volver a presentarla como planificada", () => {
    const html = render({
      snapshot: {
        ...snapshot,
        alerts: [
          {
            ...snapshot.alerts[0],
            activeProduction: [
              {
                ...snapshot.alerts[0].activeProduction[0],
                state: "confirmed",
                startedAt: "2026-10-18T12:00:00.000Z",
              },
            ],
          },
        ],
      },
    });
    expect(html).toContain("En preparación");
    expect(html).not.toContain("Planificada");
  });
  it("no presenta una orden confirmada sin comenzar como producción en marcha", () => {
    const html = render({
      snapshot: {
        ...snapshot,
        alerts: [
          {
            ...snapshot.alerts[0],
            activeProduction: [
              {
                ...snapshot.alerts[0].activeProduction[0],
                state: "confirmed",
                startedAt: null,
              },
            ],
          },
        ],
      },
    });
    expect(html).toContain("Pendiente de comenzar");
    expect(html).not.toContain("En preparación");
  });
  it("explica cuando el traslado sugerido solo cubre una parte del faltante", () => {
    const html = render({
      snapshot: {
        ...snapshot,
        alerts: [
          {
            ...snapshot.alerts[0],
            kind: "transfer",
            suggestedQuantity: "1000.000000",
            sources: [
              {
                locationId: "depot",
                locationName: "Depósito",
                availableQuantity: "1000.000000",
              },
            ],
          },
        ],
      },
    });
    expect(html).toContain("Reposición sugerida");
    expect(html).toContain("cubre solo una parte");
  });
});
