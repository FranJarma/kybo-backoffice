import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import {
  OrderPrintingView,
  ReprintForm,
  LatestOrderPrintingView,
} from "@/components/printing/order-printing";
import { PrintingSettingsView } from "@/components/printing/printing-settings";
import { visibleNavigation } from "@/lib/navigation";
import type { PrintingSnapshot } from "@/modules/printing/types";

const data = {
  ready: true,
  canConfigure: false,
  canManage: false,
  settings: { enabled: true, revision: 1, printerName: "Hasar" },
  connector: null,
  jobs: [
    {
      id: "one",
      ticketId: "t",
      saleId: "s",
      orderId: "o",
      saleNumber: 4,
      sequence: 1,
      stationName: "Cocina",
      kind: "historical",
      copyNumber: 0,
      state: "sent",
      createdAt: "2026-01-01",
      sentAt: null,
      error: null,
      spoolState: "",
      canReprint: true,
      canRetry: false,
      reason: null,
      requestedBy: "Ana",
      document: {
        version: 1,
        widthDots: 576,
        logo: true,
        lines: [
          { text: "NO PREPARAR", style: "bold" },
          { text: "Sin cebolla · 2 × queso", style: "normal" },
        ],
      },
    },
  ],
} as PrintingSnapshot;
it("shows station and the original text-only ticket, including historical warning", () => {
  const html = renderToStaticMarkup(
    React.createElement(OrderPrintingView, { data, onReprint: () => {} }),
  );
  expect(html).toContain("Cocina");
  expect(html).toContain("NO PREPARAR");
  expect(html).toContain("Sin cebolla · 2 × queso");
  expect(html).toContain("Reimprimir");
});
it("explains pending activation", () => {
  const html = renderToStaticMarkup(
    React.createElement(OrderPrintingView, {
      data: { ...data, ready: false, jobs: [] },
      onReprint: () => {},
    }),
  );
  expect(html).toContain("activación pendiente");
});
it("requires a reason and offers the specified presets", () => {
  const html = renderToStaticMarkup(
    React.createElement(ReprintForm, {
      job: data.jobs[0],
      busy: false,
      onSubmit: () => {},
    }),
  );
  expect(html).toContain("No salió el ticket");
  expect(html).toContain("Ticket perdido");
  expect(html).toContain("Ticket ilegible");
  expect(html).toContain("Otro motivo");
  expect(html).toContain("required");
});
it("restricts printing settings navigation to administrators", () => {
  expect(visibleNavigation({ role: "admin" }).map((n) => n.href)).toContain(
    "/settings/printing",
  );
  expect(
    visibleNavigation({ role: "manager" }).map((n) => n.href),
  ).not.toContain("/settings/printing");
});

it("surfaces the latest order only when printing needs attention", () => {
  const quiet = renderToStaticMarkup(
    React.createElement(LatestOrderPrintingView, { data, onOpen: () => {} }),
  );
  expect(quiet).toBe("");
  const pending = renderToStaticMarkup(
    React.createElement(LatestOrderPrintingView, {
      data: { ...data, jobs: [{ ...data.jobs[0], state: "pending" }] },
      onOpen: () => {},
    }),
  );
  expect(pending).toContain("Pendiente");
  expect(pending).toContain("Ver tickets");
  const error = renderToStaticMarkup(
    React.createElement(LatestOrderPrintingView, {
      data: { ...data, jobs: [{ ...data.jobs[0], state: "error" }] },
      onOpen: () => {},
    }),
  );
  expect(error).toContain("venta sigue confirmada");
});
it("keeps an unrouted product warning visible even after Windows accepted its ticket", () => {
  const html = renderToStaticMarkup(
    React.createElement(LatestOrderPrintingView, {
      data: {
        ...data,
        jobs: [{ ...data.jobs[0], stationName: "REVISAR ESTACIÓN" }],
      },
      onOpen: () => {},
    }),
  );
  expect(html).toContain("Hay productos sin estación asignada");
});
it("labels special tickets and disables copy while busy", () => {
  const html = renderToStaticMarkup(
    React.createElement(OrderPrintingView, {
      data,
      busy: true,
      onReprint: () => {},
    }),
  );
  expect(html).toContain("Histórico");
  expect(html).toMatch(/disabled[^>]*>Reimprimir/);
});
it("requires a bounded printer name and translates driver status", () => {
  const html = renderToStaticMarkup(
    React.createElement(PrintingSettingsView, {
      data: {
        ...data,
        canConfigure: true,
        canManage: true,
        connector: {
          id: "c",
          name: "pc",
          connected: true,
          lastSeenAt: null,
          printerStatus: "paper-out",
          printerMessage: null,
        },
      },
      busy: false,
      send: async () => null,
      pairing: null,
      setPairing: () => {},
    }),
  );
  expect(html).toContain("Sin papel");
  expect(html).toMatch(/required[^>]*maxLength="160"/);
  expect(html).toContain("Nombre de la impresora *");
  expect(html).toContain("Enviado a Windows");
  expect(html).not.toContain("sent ·");
});
