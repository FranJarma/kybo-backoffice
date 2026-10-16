import { expect, it } from "vitest";
import {
  scheduleInstant,
  localSchedule,
} from "@/modules/production/schedule-time";
it("interpreta el horario en la sucursal y conserva minutos", () => {
  expect(
    scheduleInstant("2026-10-16T09:30", "America/Argentina/Buenos_Aires"),
  ).toBe("2026-10-16T12:30:00.000Z");
  expect(
    localSchedule("2026-10-16T12:30:00Z", "America/Argentina/Buenos_Aires"),
  ).toBe("2026-10-16T09:30");
  expect(() => scheduleInstant("2026-03-08T02:30", "America/New_York")).toThrow(
    "no existe",
  );
  expect(() => scheduleInstant("", "UTC")).toThrow();
});
