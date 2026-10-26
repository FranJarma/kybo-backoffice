import type { LocatorFleet } from "./types";

export function nextAvailableLocator(
  fleet: LocatorFleet | undefined,
): number | null {
  if (!fleet) return null;
  const held = new Set(fleet.occupied.map((a) => a.number));
  for (let number = 1; number <= fleet.count; number++)
    if (!held.has(number)) return number;
  return null;
}

export function locatorSelection(
  fleet: LocatorFleet | undefined,
  value: number | null,
) {
  if (!fleet) return { required: false, valid: false };
  const occupied = new Set(
    fleet.occupied
      .map((a) => a.number)
      .filter((n) => n >= 1 && n <= fleet.count),
  );
  const required = occupied.size < fleet.count;
  return {
    required,
    valid:
      value === null
        ? !required
        : Number.isInteger(value) &&
          value >= 1 &&
          value <= fleet.count &&
          !occupied.has(value),
  };
}
