import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import { AttendanceSettings } from "@/components/attendance/settings";
import type { AttendanceSnapshot } from "@/modules/attendance/queries";
vi.stubGlobal("React", React);
it("directs administrators to the exact branch address without exposing coordinate-entry fields in Attendance", () => {
  const data = {
    actor: { role: "admin" },
    branch: { id: "branch-alberdi", name: "Alberdi" },
    settings: { revision: 1, latitude: -24.79, longitude: -65.41 },
    people: [],
  } as unknown as AttendanceSnapshot;
  const html = renderToStaticMarkup(
    React.createElement(AttendanceSettings, {
      data,
      busy: false,
      command: async () => ({ id: "" }),
    }),
  );
  expect(html).toContain("Dirección de la sucursal");
  expect(html).toContain("/settings/branches?branch=branch-alberdi");
  expect(html).not.toContain("label>Latitud");
  expect(html).not.toContain('min="-90"');
  expect(html).toContain("Radio permitido");
});
