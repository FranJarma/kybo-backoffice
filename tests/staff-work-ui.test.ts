import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import type {
  StaffPreparationTask,
  StaffProductionOrder,
} from "@/modules/staff-work/types";

const task = {
  id: "task",
  revision: 1,
  saleNumber: 27,
  sequence: 1,
  stationName: "Barra",
  status: "pending",
  locatorNumber: 9,
  lines: [
    {
      id: "coffee",
      name: "Café con leche",
      quantity: 2,
      notes: "Sin azúcar",
      modifiers: [],
    },
  ],
  siblings: [
    { id: "task", stationName: "Barra", status: "pending" },
    { id: "kitchen", stationName: "Cocina", status: "pending" },
  ],
  canStart: true,
  canReady: false,
  orderReady: false,
} as unknown as StaffPreparationTask;

it("offers only preparation actions and the current station lines", async () => {
  const { PreparationWorkCard } = await import("@/components/staff-work/cards");
  const pending = renderToStaticMarkup(
    React.createElement(PreparationWorkCard, {
      task,
      locked: false,
      onAct: () => {},
    }),
  );
  expect(pending).toContain('data-action="start"');
  expect(pending).not.toContain('data-action="ready"');
  expect(pending).toContain("Café con leche");
  expect(pending).not.toContain('data-action="deliver"');
  const ready = renderToStaticMarkup(
    React.createElement(PreparationWorkCard, {
      task: { ...task, status: "ready", canStart: false },
      locked: false,
      onAct: () => {},
    }),
  );
  expect(ready).not.toContain('data-action="deliver"');
  expect(ready).toContain("Tu parte está lista");
});

it("does not allow acting on another person's in-progress preparation", async () => {
  const { PreparationWorkCard } = await import("@/components/staff-work/cards");
  const html = renderToStaticMarkup(
    React.createElement(PreparationWorkCard, {
      task: {
        ...task,
        status: "preparing",
        canStart: false,
        canReady: false,
        assigneeName: "María",
      },
      locked: false,
      onAct: () => {},
    }),
  );
  expect(html).not.toContain('data-action="ready"');
  expect(html).not.toContain('data-action="start"');
  expect(html).toContain("María");
});

it("provides a single production confirmation without editable quantities", async () => {
  const { ProductionWorkCard } = await import("@/components/staff-work/cards");
  const order: StaffProductionOrder = {
    id: "production",
    revision: 2,
    state: "confirmed",
    name: "Salsa",
    baseUnit: "g",
    plannedQuantity: "500.000000",
    locationId: "depot",
    locationName: "Depósito",
    scheduledFor: null,
    notes: "Enfriar antes de guardar",
    preparation: null,
    components: [
      {
        itemId: "tomato",
        name: "Tomate",
        baseUnit: "g",
        quantity: "150.000000",
      },
    ],
  };
  const html = renderToStaticMarkup(
    React.createElement(ProductionWorkCard, {
      order,
      locked: false,
      timeZone: "America/Argentina/Buenos_Aires",
      onAct: () => {},
    }),
  );
  expect(html).toContain('data-action="finish"');
  expect(html).not.toContain("<input");
  expect(html).toContain("Enfriar antes de guardar");
  expect(html).toContain("Tomate");
});

it("opens the production view when requested by the personal navigation link", async () => {
  const { PersonalWork } = await import("@/components/staff-work/personal");
  const html = renderToStaticMarkup(
    React.createElement(PersonalWork, {
      branchId: "branch",
      actorId: "employee",
      initialTab: "production",
    }),
  );
  expect(html).toMatch(/aria-pressed="true"[^>]*>Producción/);
});
