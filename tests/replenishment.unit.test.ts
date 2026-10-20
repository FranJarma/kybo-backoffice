import { describe, expect, it } from "vitest";
import { buildReplenishmentAlerts } from "@/modules/replenishment/engine";
import type { ReplenishmentPolicy } from "@/modules/replenishment/types";

const policy: ReplenishmentPolicy = {
  id: "policy",
  revision: 1,
  itemId: "milk",
  itemName: "Leche",
  baseUnit: "ml",
  locationId: "bar",
  locationName: "Barra",
  minimumQuantity: "1000.000000",
  targetQuantity: "5000.000000",
  preparationMinutes: null,
  enabled: true,
};
const lot = (locationId: string, quantity: string, extra = {}) => ({
  id: locationId,
  itemId: "milk",
  locationId,
  locationName: locationId,
  receivedOn: "2026-10-01",
  expiresOn: null,
  blocked: false,
  locationBlocked: false,
  quantity,
  reserved: "0.000000",
  ...extra,
});
const build = (
  overrides: Partial<Parameters<typeof buildReplenishmentAlerts>[0]> = {},
) =>
  buildReplenishmentAlerts({
    policies: [policy],
    lots: [],
    preparationItemIds: [],
    activeProduction: [],
    today: "2026-10-18",
    ...overrides,
  });

describe("reposición por ubicación", () => {
  it("avisa al llegar al mínimo y sugiere la diferencia hasta el objetivo", () => {
    expect(build({ lots: [lot("bar", "1000.000000")] })[0]).toMatchObject({
      kind: "purchase",
      severity: "low",
      availableQuantity: "1000.000000",
      suggestedQuantity: "4000.000000",
    });
    expect(build({ lots: [lot("bar", "1000.000001")] })).toEqual([]);
  });
  it("excluye reservas, vencidos, bloqueados globales y bloqueados locales", () => {
    const alerts = build({
      lots: [
        lot("bar", "1000.000000", { reserved: "900.000000" }),
        lot("bar", "3000.000000", { expiresOn: "2026-10-18" }),
        lot("bar", "3000.000000", { blocked: true }),
        lot("bar", "3000.000000", { locationBlocked: true }),
      ],
    });
    expect(alerts[0].availableQuantity).toBe("100.000000");
  });
  it("prioriza reponer desde otra ubicación aun cuando solo alcance parcialmente", () => {
    expect(
      build({
        lots: [lot("deposit", "2000.000000")],
        preparationItemIds: ["milk"],
      })[0],
    ).toMatchObject({
      kind: "transfer",
      severity: "empty",
      suggestedQuantity: "2000.000000",
      sources: [{ locationId: "deposit", availableQuantity: "2000.000000" }],
    });
  });
  it("no propone trasladar más que el objetivo cuando varias ubicaciones tienen stock", () => {
    expect(
      build({
        lots: [
          lot("bar", "1000.000000"),
          lot("deposit", "3000.000000"),
          lot("kitchen", "3000.000000"),
        ],
      })[0],
    ).toMatchObject({
      kind: "transfer",
      suggestedQuantity: "4000.000000",
      sources: [
        { locationId: "deposit", availableQuantity: "3000.000000" },
        { locationId: "kitchen", availableQuantity: "3000.000000" },
      ],
    });
  });
  it("sugiere producir si existe una receta y muestra órdenes activas sin sumarlas al stock", () => {
    expect(
      build({
        preparationItemIds: ["milk"],
        activeProduction: [
          {
            itemId: "milk",
            locationId: "bar",
            id: "order",
            plannedQuantity: "5000.000000",
            state: "planned",
            assignedToName: "Abi",
          },
        ],
      })[0],
    ).toMatchObject({
      kind: "production",
      availableQuantity: "0.000000",
      suggestedQuantity: "5000.000000",
      activeProduction: [{ id: "order", assignedToName: "Abi" }],
    });
  });
  it("omite reglas deshabilitadas y permite mínimo cero para avisar solo al agotarse", () => {
    expect(build({ policies: [{ ...policy, enabled: false }] })).toEqual([]);
    expect(
      build({ policies: [{ ...policy, minimumQuantity: "0.000000" }] })[0]
        .severity,
    ).toBe("empty");
  });
  it("distingue órdenes confirmadas sin comenzar de las que ya empezaron", () => {
    const alerts = build({
      preparationItemIds: ["milk"],
      activeProduction: [
        {
          itemId: "milk",
          locationId: "bar",
          id: "not-started",
          plannedQuantity: "5000.000000",
          state: "confirmed",
          assignedToName: "Abi",
          startedAt: null,
        },
        {
          itemId: "milk",
          locationId: "bar",
          id: "started",
          plannedQuantity: "5000.000000",
          state: "confirmed",
          assignedToName: "Abi",
          startedAt: "2026-10-18T12:00:00.000Z",
        },
      ],
    });
    expect(alerts[0].activeProduction).toMatchObject([
      { id: "not-started", startedAt: null },
      { id: "started", startedAt: "2026-10-18T12:00:00.000Z" },
    ]);
  });
});
