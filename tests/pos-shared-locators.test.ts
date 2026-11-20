import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, expect, it, vi } from "vitest";
import { LocatorFleetProvider } from "@/components/pickup/locator-fleet-context";
import { PickupActions } from "@/components/pickup/locator-manager";
import { useLocators } from "@/components/pickup/use-locators";

afterEach(() => vi.unstubAllGlobals());

const fleet = { count: 16, publicPath: "/pickup/current-branch", occupied: [] };
const actions = () =>
  React.createElement(PickupActions, { actorId: "actor", onChanged: () => {} });
function FleetCount() {
  const { fleet, error } = useLocators(0);
  return React.createElement(
    "p",
    null,
    error || fleet?.publicPath || "loading",
  );
}

it("uses the owning POS availability for the customer-screen link immediately", () => {
  vi.stubGlobal("React", React);
  const html = renderToStaticMarkup(
    React.createElement(
      LocatorFleetProvider,
      { value: { fleet, error: "" } },
      actions(),
    ),
  );
  expect(html).toContain('href="/pickup/current-branch"');
});

it("propagates access/availability errors and never exposes a stale customer-screen link", () => {
  vi.stubGlobal("React", React);
  const html = renderToStaticMarkup(
    React.createElement(
      LocatorFleetProvider,
      { value: { fleet, error: "Sin acceso" } },
      actions(),
    ),
  );
  expect(html).not.toContain('href="/pickup/current-branch"');
  expect(html).toContain("No se pudo cargar el enlace");
});

it("isolates providers and leaves a standalone locator consumer in its own loading state", () => {
  vi.stubGlobal("React", React);
  const html = renderToStaticMarkup(
    React.createElement(
      React.Fragment,
      null,
      React.createElement(
        LocatorFleetProvider,
        { value: { fleet, error: "" } },
        React.createElement(FleetCount),
      ),
      React.createElement(
        LocatorFleetProvider,
        {
          value: {
            fleet: { ...fleet, publicPath: "/pickup/another-branch" },
            error: "",
          },
        },
        React.createElement(FleetCount),
      ),
      React.createElement(FleetCount),
    ),
  );
  expect(html).toBe(
    "<p>/pickup/current-branch</p><p>/pickup/another-branch</p><p>loading</p>",
  );
});
