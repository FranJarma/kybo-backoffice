import type { Urgency } from "./types";
export function classifyUrgency(input: {
  now: Date;
  dueAt: Date | null;
  blockedCurrentDemand: boolean;
  coverageDays: number | null;
  leadDays: number | null;
  safetyDays: number | null;
  incomingCoversGap: boolean;
}) {
  const overdue = !!input.dueAt && input.dueAt < input.now;
  const coverageKnown = input.coverageDays !== null && input.leadDays !== null;
  let urgency: Urgency = "scheduled";
  const reasons: string[] = [];
  if (input.blockedCurrentDemand) {
    urgency = "critical";
    reasons.push("Falta stock para la demanda actual.");
  } else if (
    coverageKnown &&
    !input.incomingCoversGap &&
    input.coverageDays! <= input.leadDays!
  ) {
    urgency = "critical";
    reasons.push("El stock se agotaría antes de la reposición.");
  } else if (
    overdue ||
    (coverageKnown &&
      !input.incomingCoversGap &&
      input.coverageDays! <= input.leadDays! + (input.safetyDays ?? 0))
  ) {
    urgency = "high";
    reasons.push(
      overdue
        ? "La fecha prevista ya pasó."
        : "Es momento de tramitar la reposición.",
    );
  }
  return { urgency, overdue, coverageKnown, reasons };
}
