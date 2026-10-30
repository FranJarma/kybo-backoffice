import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { visibleNavigation } from "@/lib/navigation";
import { PersonalAttendance } from "@/components/attendance/personal";
import { AttendanceSettings } from "@/components/attendance/settings";
import type { AttendanceSnapshot } from "@/modules/attendance/queries";
import manifest from "@/app/manifest";
const snapshot = {
  actor: { id: "staff", role: "staff", name: "Lucía" },
  branch: {
    id: "branch",
    name: "Local",
    timeZone: "America/Argentina/Buenos_Aires",
  },
  now: "2026-10-29T15:00:00Z",
  today: "2026-10-29",
  from: "2026-10-29",
  to: "2026-10-29",
  settings: { enabled: true },
  people: [{ id: "staff", name: "Lucía", enabled: true, active: true }],
  events: [],
  assignments: [],
  shifts: [],
  current: { state: "out", branchId: null, entryId: null },
  totals: {},
  states: {},
  manualRequests: [],
  corrections: [],
} as unknown as AttendanceSnapshot;
it("exposes personal attendance to staff, planning to managers and configuration only to admins", () => {
  const staff = visibleNavigation({ role: "staff" }).map((n) => n.href);
  expect(staff).toContain("/staff/attendance");
  expect(staff).not.toContain("/staff/schedule");
  expect(staff).not.toContain("/settings/attendance");
  expect(visibleNavigation({ role: "manager" }).map((n) => n.href)).toContain(
    "/staff/schedule",
  );
  expect(visibleNavigation({ role: "admin" }).map((n) => n.href)).toContain(
    "/settings/attendance",
  );
});
it("renders real personal actions and the device/location explanation without mock authentication", () => {
  const html = renderToStaticMarkup(
    React.createElement(PersonalAttendance, {
      data: snapshot,
      busy: false,
      onPunch: async () => {},
    }),
  );
  expect(html).toContain("Registrar entrada");
  expect(html).toContain("Face ID o huella");
  expect(html).toContain("Ubicación al fichar");
  expect(html).not.toMatch(/Simular|Cambiar rol|Verificar demo/);
});
it("does not render administrative settings to an employee", () => {
  const html = renderToStaticMarkup(
    React.createElement(AttendanceSettings, {
      data: snapshot,
      busy: false,
      command: async () => ({ id: "" }),
    }),
  );
  expect(html).not.toContain("Latitud");
  expect(html).not.toContain("Vigencia del código");
});
it("offers an explicit choice for an overnight entry and the next daytime shift", () => {
  const data = {
    ...snapshot,
    entryAssignments: [
      {
        id: "night",
        name: "Noche",
        kind: "work",
        userId: "staff",
        businessDate: "2026-10-28",
        startsAt: "2026-10-29T02:00:00Z",
        endsAt: "2026-10-29T05:00:00Z",
        pauseMinutes: 30,
      },
      {
        id: "day",
        name: "Mañana",
        kind: "work",
        userId: "staff",
        businessDate: "2026-10-29",
        startsAt: "2026-10-29T12:00:00Z",
        endsAt: "2026-10-29T20:00:00Z",
        pauseMinutes: 30,
      },
    ],
  } as unknown as AttendanceSnapshot;
  const html = renderToStaticMarkup(
    React.createElement(PersonalAttendance, {
      data,
      busy: false,
      onPunch: async () => {},
    }),
  );
  expect(html).toContain("23:00");
  expect(html).toContain("09:00");
  expect(html.match(/Registrar entrada/g)).toHaveLength(2);
});
it("keeps a scheduled day off visible when there are no entry candidates", () => {
  const data = {
    ...snapshot,
    entryAssignments: [],
    ownJournal: {
      assignments: [
        {
          id: "off",
          userId: "staff",
          businessDate: snapshot.today,
          kind: "off",
        },
      ],
      events: [],
      total: {},
    },
  } as unknown as AttendanceSnapshot;
  expect(
    renderToStaticMarkup(
      React.createElement(PersonalAttendance, {
        data,
        busy: false,
        onPunch: async () => {},
      }),
    ),
  ).toContain("Franco");
});
it("supports installing the same app with icons and a personal attendance shortcut", () => {
  const result = manifest();
  expect(result.display).toBe("standalone");
  expect(result.start_url).toBe("/");
  expect(result.shortcuts?.some((s) => s.url === "/staff/attendance")).toBe(
    true,
  );
  expect(result.icons?.map((i) => i.sizes)).toContain("512x512");
});
