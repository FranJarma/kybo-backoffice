import { integer, safeQuantity, SCALE, six } from "../inventory/decimal";
import type {
  SupplyPolicy,
  SupplyLot,
  SupplyAlert,
  SupplyIncoming,
} from "./types";

export function addDays(date: string, days: number) {
  const result = new Date(`${date}T12:00:00Z`);
  result.setUTCDate(result.getUTCDate() + days);
  return result.toISOString().slice(0, 10);
}

/** Calendar anchor, including branches whose midnight is a different UTC date. */
export function dayStart(date: string, timeZone: string) {
  const target = Date.parse(`${date}T00:00:00Z`);
  let instant = target;
  const format = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  for (let i = 0; i < 3; i++) {
    const parts = format.formatToParts(new Date(instant));
    const p = (type: Intl.DateTimeFormatPartTypes) =>
      Number(parts.find((part) => part.type === type)!.value);
    const local = Date.UTC(
      p("year"),
      p("month") - 1,
      p("day"),
      p("hour"),
      p("minute"),
      p("second"),
    );
    const adjustment = target - local;
    if (!adjustment) break;
    instant += adjustment;
  }
  return new Date(instant);
}

/** Physical coverage stays separate; dated arrivals become usable after that day's demand. */
export function projectSupply(
  policy: SupplyPolicy,
  input: SupplyLot[],
  today: string,
  incoming: SupplyIncoming[] = [],
): SupplyAlert {
  const lots = input
    .filter((l) => !l.expiresOn || l.expiresOn > today)
    .map((l) => ({ ...l, remaining: integer(l.quantity) }))
    .sort(
      (a, b) =>
        (a.expiresOn ?? "9999-12-31").localeCompare(
          b.expiresOn ?? "9999-12-31",
        ) || a.id.localeCompare(b.id),
    );
  const available = lots.reduce((sum, l) => sum + l.remaining, 0n);
  const eligible = incoming.filter(
    (i) => i.expectedOn && i.expectedOn >= today,
  );
  const unconfirmed = incoming.filter(
    (i) => !i.expectedOn || i.expectedOn < today,
  );
  const base = {
    ...policy,
    availableQuantity: safeQuantity(available),
    suggestedQuantity: "0.000000",
    coverageDays: null,
    coverageAtLeast: false,
    projectedCoverageDays: null,
    projectedCoverageAtLeast: false,
    incomingQuantity: safeQuantity(
      eligible.reduce((n, i) => n + integer(i.quantity), 0n),
    ),
    unconfirmedIncomingQuantity: safeQuantity(
      unconfirmed.reduce((n, i) => n + integer(i.quantity), 0n),
    ),
    riskOn: null,
    orderBy: null,
    urgency: null,
  };
  if (policy.dailyConsumption === null)
    return { ...base, status: "needs_estimate", urgency: "high" };
  const daily = integer(policy.dailyConsumption);
  if (daily === 0n) return { ...base, status: "no_consumption" };
  function simulate(withIncoming: boolean) {
    const inventory = lots.map((l) => ({ ...l }));
    let shortage: { day: number; remaining: bigint } | null = null;
    let served = 0n;
    for (let day = 0; day < 365; day++) {
      const date = addDays(today, day);
      let demand = daily;
      for (const lot of inventory) {
        if (lot.expiresOn && lot.expiresOn <= date) lot.remaining = 0n;
        const used = lot.remaining < demand ? lot.remaining : demand;
        lot.remaining -= used;
        demand -= used;
      }
      if (day < policy.targetDays) served += daily - demand;
      if (demand > 0n && !shortage)
        shortage = { day, remaining: daily - demand };
      if (withIncoming)
        for (const i of eligible)
          if (i.expectedOn === date)
            inventory.push({
              id: i.id,
              quantity: i.quantity,
              expiresOn: null,
              remaining: integer(i.quantity),
            });
    }
    return {
      shortage,
      served,
      coverage: shortage
        ? BigInt(shortage.day) * SCALE + (shortage.remaining * SCALE) / daily
        : 365n * SCALE,
    };
  }
  const physical = simulate(false);
  const { shortage, served, coverage } = simulate(true);
  let suggested = daily * BigInt(policy.targetDays) - served;
  if (policy.baseUnit === "unit")
    suggested = ((suggested + SCALE - 1n) / SCALE) * SCALE;
  const within = (days: number) =>
    !!shortage &&
    (shortage.day < days ||
      (shortage.day === days && shortage.remaining === 0n));
  return {
    ...base,
    status: suggested > 0n ? "action" : "covered",
    suggestedQuantity: safeQuantity(suggested),
    coverageDays: six(physical.coverage),
    coverageAtLeast: !physical.shortage,
    projectedCoverageDays: six(coverage),
    projectedCoverageAtLeast: !shortage,
    riskOn: shortage ? addDays(today, shortage.day) : null,
    orderBy: shortage
      ? addDays(today, shortage.day - policy.leadDays - policy.safetyDays)
      : null,
    urgency:
      suggested <= 0n
        ? null
        : within(policy.leadDays)
          ? "critical"
          : within(policy.leadDays + policy.safetyDays)
            ? "high"
            : "scheduled",
  };
}
