import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import { ReviewProductionResult } from "@/components/production/review-result";
vi.stubGlobal("React", React);
it("muestra cantidades registradas editables, motivo obligatorio y bloqueo durante envío", () => {
  const html = renderToStaticMarkup(
    React.createElement(ReviewProductionResult, {
      orderId: "order",
      revision: 3,
      baseUnit: "ml",
      locked: true,
      submit: vi.fn(),
      result: {
        actualQuantity: "900.000000",
        consumption: [{ itemId: "tea", quantity: "15.000000" }],
        totalCost: "30.000000",
        lotId: "lot",
        quantitySource: "reviewed",
      },
      components: [
        { itemId: "tea", name: "Té", baseUnit: "g", untracked: false },
      ],
    }),
  );
  expect(html).toContain("Revisar resultado");
  expect(html).toContain('value="900"');
  expect(html).toContain('value="15"');
  expect(html).toMatch(/<textarea[^>]*required/);
  expect(html).toMatch(/<fieldset[^>]*disabled/);
  expect(html).toContain("totales reales, no la diferencia");
});
