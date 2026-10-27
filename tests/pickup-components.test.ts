import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { LocatorGrid } from "../src/components/pickup/locator-grid";
import { PublicBoard } from "../src/components/pickup/public-display";
it("renders 16 touch controls and disables occupied equipment", () => {
  const html = renderToStaticMarkup(
    createElement(LocatorGrid, {
      value: null,
      onChange: () => {},
      fleet: {
        count: 16,
        publicPath: "/pickup/test",
        occupied: [
          {
            id: "a",
            number: 3,
            orderId: "o",
            saleId: "s",
            label: "1.1",
            cancelled: false,
          },
        ],
      },
    }),
  );
  expect(html.match(/aria-label="Localizador /g)).toHaveLength(16);
  expect(html).toMatch(/disabled=""[^>]*aria-label="Localizador 3, ocupado"/);
  expect(html).toContain("Sin localizador");
  expect(html).toContain("min-h-16");
});
it("shows distinct order and locator numbers and hides stale ready states on failure", () => {
  const data = {
    branchName: "Sucursal",
    nextOffset: 0,
    rows: [
      {
        label: "123.1",
        locatorNumber: 6,
        customerName: "Martina",
        state: "ready" as const,
      },
      {
        label: "124.1",
        locatorNumber: null,
        customerName: null,
        state: "preparing" as const,
      },
    ],
  };
  const html = renderToStaticMarkup(
    createElement(PublicBoard, { data, unavailable: false }),
  );
  expect(html).toContain("Localizador");
  expect(html).toContain("Pedido 123.1");
  expect(html).toContain("124.1");
  expect(html).toContain("Martina");
  const offline = renderToStaticMarkup(
    createElement(PublicBoard, { data, unavailable: true }),
  );
  expect(offline).toContain("Estamos reconectando");
  expect(offline).not.toContain("123.1");
  expect(offline).not.toContain("Martina");
});
it("hides the no-locator choice for a new order while a device is free, but retains it for returns", () => {
  const fleet = { count: 1, publicPath: "/pickup/test", occupied: [] };
  const props = {
    value: null,
    onChange: () => {},
    fleet,
    requireWhenAvailable: true,
  };
  expect(renderToStaticMarkup(createElement(LocatorGrid, props))).not.toContain(
    ">Sin localizador<",
  );
  expect(
    renderToStaticMarkup(
      createElement(LocatorGrid, { ...props, requireWhenAvailable: false }),
    ),
  ).toContain("Sin localizador");
});
