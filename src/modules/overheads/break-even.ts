import { cents, integer, roundedDivision } from "@/modules/inventory/decimal";
import type {
  BreakEvenResult,
  BreakEvenScenario,
  BreakEvenSnapshot,
} from "./break-even-model";

const MAX_QUANTITY = BigInt(Number.MAX_SAFE_INTEGER);
const MONEY_LIMIT = 10n ** 14n;
const CHANNELS = ["counter", "pedidosya", "ubereats"];
const RANGE_MESSAGE =
  "El cálculo excede el límite permitido. Reducí el volumen o revisá los importes.";
type ProductResult = BreakEvenResult["products"][number];

/** Read canonical snapshot amounts; malformed or pending values stay unknown. */
function amount(
  value: unknown,
  scale: 2 | 6 = 2,
  signed = false,
): bigint | null {
  if (typeof value !== "string") return null;
  const expression =
    scale === 6
      ? /^\d{1,12}\.\d{6}$/
      : signed
        ? /^-?\d{1,12}\.\d{2}$/
        : /^\d{1,12}\.\d{2}$/;
  return expression.test(value) ? integer(value) : null;
}

function money(value: bigint): string | null {
  return value > -MONEY_LIMIT && value < MONEY_LIMIT ? cents(value) : null;
}

function roundRatio(numerator: bigint, denominator: bigint): bigint {
  return numerator < 0n
    ? -roundedDivision(-numerator, denominator)
    : roundedDivision(numerator, denominator);
}

function ceiling(numerator: bigint, denominator: bigint): bigint {
  return (numerator + denominator - 1n) / denominator;
}

function greatestCommonDivisor(left: bigint, right: bigint): bigint {
  while (right !== 0n) {
    [left, right] = [right, left % right];
  }
  return left;
}

function quantity(value: unknown, positive = false): value is number {
  return (
    typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value >= (positive ? 1 : 0)
  );
}

function safeNumber(value: bigint): number | null {
  return value >= 0n && value <= MAX_QUANTITY ? Number(value) : null;
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

function calculateProduct(
  product: BreakEvenSnapshot["products"][number],
  scenario: BreakEvenScenario,
  budget: bigint | null,
  budgetReasons: string[],
  methodReason: string | null,
): ProductResult {
  const reasons = [...product.pendingReasons];
  const estimates = product.estimates.filter(
    (e) => e.channel === scenario.channel,
  );
  const estimate = estimates.length === 1 ? estimates[0] : undefined;
  if (!estimate)
    reasons.push("Falta un precio válido para el canal seleccionado.");
  const methods =
    estimate?.methods.filter((m) => m.id === scenario.methodId) ?? [];
  const method = methods.length === 1 ? methods[0] : undefined;
  if (methodReason) reasons.push(methodReason);
  if (!method)
    reasons.push("Falta la comisión del medio de pago seleccionado.");

  const price = amount(estimate?.price);
  const netPrice = amount(estimate?.netPrice);
  const cost = amount(estimate?.cost, 6);
  const vat = amount(estimate?.vat);
  const iibb = amount(estimate?.iibb);
  const commission = amount(method?.commission);
  const contribution = amount(method?.contribution, 2, true);
  const finalUnits = quantity(product.finalUnits, true)
    ? product.finalUnits
    : null;
  if (finalUnits === null)
    reasons.push("Faltan las unidades finales de la composición.");
  if (price === null)
    reasons.push("El precio final está pendiente o fuera de rango.");
  if (netPrice === null)
    reasons.push("El precio neto está pendiente o fuera de rango.");
  if (cost === null)
    reasons.push("El costo de la composición está pendiente o fuera de rango.");
  if (vat === null) reasons.push("El IVA está pendiente o fuera de rango.");
  if (iibb === null)
    reasons.push("Ingresos Brutos está pendiente o fuera de rango.");
  if (commission === null)
    reasons.push("La comisión está pendiente o fuera de rango.");
  if (contribution === null)
    reasons.push("El aporte por venta está pendiente o fuera de rango.");

  const result: ProductResult = {
    productId: product.id,
    finalUnits,
    price: price === null ? null : cents(price),
    cost: cost === null ? null : estimate!.cost,
    commission: commission === null ? null : cents(commission),
    iibb: iibb === null ? null : cents(iibb),
    contribution: contribution === null ? null : cents(contribution),
    allocatedOverhead: null,
    projectedMargin: null,
    breakEvenSales: null,
    breakEvenUnits: null,
    status: "pending",
    pendingReasons: [],
  };

  reasons.push(...budgetReasons);
  if (
    reasons.length ||
    budget === null ||
    contribution === null ||
    finalUnits === null
  ) {
    result.pendingReasons = unique(reasons);
    return result;
  }

  if (quantity(scenario.expectedUnits, true)) {
    const denominator = BigInt(scenario.expectedUnits);
    const overheadNumerator = budget * BigInt(finalUnits);
    result.allocatedOverhead = money(
      roundRatio(overheadNumerator, denominator),
    );
    result.projectedMargin = money(
      roundRatio(contribution * denominator - overheadNumerator, denominator),
    );
    if (result.allocatedOverhead === null || result.projectedMargin === null) {
      result.allocatedOverhead = null;
      result.projectedMargin = null;
      result.pendingReasons = [RANGE_MESSAGE];
      return result;
    }
  }

  if (contribution <= 0n) {
    result.status = "non_positive";
    return result;
  }

  const sales = ceiling(budget, contribution);
  const units = sales * BigInt(finalUnits);
  result.breakEvenSales = safeNumber(sales);
  result.breakEvenUnits = safeNumber(units);
  if (result.breakEvenSales === null || result.breakEvenUnits === null) {
    result.breakEvenSales = null;
    result.breakEvenUnits = null;
    result.pendingReasons = [RANGE_MESSAGE];
    return result;
  }
  result.status = "ready";
  return result;
}

/** Simulates only the explicit mix, using Costeo's contribution before fixed costs. */
export function calculateBreakEven(
  snapshot: BreakEvenSnapshot,
  scenario: BreakEvenScenario,
): BreakEvenResult {
  const result: BreakEvenResult = {
    status: "pending",
    selectedUnits: 0,
    averageContribution: null,
    breakEvenUnits: null,
    breakEvenPerDay: null,
    projectedContribution: null,
    projectedProfit: null,
    blockers: [],
    products: [],
  };
  if (!scenario || typeof scenario !== "object") {
    result.blockers = ["Revisá los datos del escenario."];
    return result;
  }

  const blockers: string[] = [];
  const budgetReasons: string[] = [];
  let budget = amount(snapshot.budget.total);
  if (
    budget === null ||
    !quantity(snapshot.budget.pending) ||
    snapshot.budget.pending > 0 ||
    snapshot.budget.entries.some((entry) => amount(entry.budget) === null)
  ) {
    budget = null;
    budgetReasons.push(
      "Completá el presupuesto mensual guardado para calcular el equilibrio.",
    );
  }
  blockers.push(...budgetReasons);
  if (!CHANNELS.includes(scenario.channel))
    blockers.push("Seleccioná un canal válido.");

  const methods = snapshot.methods.filter((m) => m.id === scenario.methodId);
  const method = methods.length === 1 ? methods[0] : undefined;
  const percent = amount(method?.percent);
  const methodReason = !method
    ? "Seleccioná un medio de pago válido."
    : percent === null || percent > 10000n
      ? "Completá la comisión del medio de pago seleccionado."
      : null;
  if (methodReason) blockers.push(methodReason);
  if (scenario.expectedUnits !== null && !quantity(scenario.expectedUnits)) {
    blockers.push(
      "El volumen previsto debe ser una cantidad entera no negativa dentro del rango permitido.",
    );
  }
  if (
    scenario.daysOpen !== null &&
    (!quantity(scenario.daysOpen, true) || scenario.daysOpen > 31)
  ) {
    blockers.push(
      "Los días de apertura deben ser un número entero entre 1 y 31.",
    );
  }

  result.products = snapshot.products.map((product) =>
    calculateProduct(product, scenario, budget, budgetReasons, methodReason),
  );
  const products = new Map<string, ProductResult>();
  const duplicateIds = new Set<string>();
  for (const product of result.products) {
    if (products.has(product.productId)) duplicateIds.add(product.productId);
    products.set(product.productId, product);
  }

  const selected = new Map<string, bigint>();
  if (!Array.isArray(scenario.entries)) {
    blockers.push("Revisá las cantidades de la mezcla.");
  } else {
    for (const entry of scenario.entries) {
      if (
        !entry ||
        typeof entry.productId !== "string" ||
        !quantity(entry.quantity)
      ) {
        blockers.push(
          "Cada cantidad relativa debe ser un número entero no negativo dentro del rango permitido.",
        );
        continue;
      }
      if (entry.quantity === 0) continue;
      selected.set(
        entry.productId,
        (selected.get(entry.productId) ?? 0n) + BigInt(entry.quantity),
      );
    }
  }

  let selectedUnits = 0n;
  let selectedContribution = 0n;
  let completeUnits = true;
  for (const [id, count] of selected) {
    const product = products.get(id);
    if (!product || duplicateIds.has(id)) {
      blockers.push(
        "Un producto de la mezcla ya no está disponible o no se puede identificar. Actualizá el análisis.",
      );
      completeUnits = false;
      continue;
    }
    if (count > MAX_QUANTITY) {
      blockers.push("La cantidad relativa excede el límite permitido.");
      completeUnits = false;
      continue;
    }
    if (product.finalUnits === null) completeUnits = false;
    else selectedUnits += count * BigInt(product.finalUnits);
    if (product.status === "pending") {
      const name = snapshot.products.find((p) => p.id === id)!.name;
      blockers.push(
        ...product.pendingReasons.map((reason) => `${name}: ${reason}`),
      );
    } else {
      selectedContribution += count * integer(product.contribution!);
    }
  }
  const safeUnits = completeUnits ? safeNumber(selectedUnits) : null;
  if (completeUnits && safeUnits === null) blockers.push(RANGE_MESSAGE);
  result.selectedUnits = safeUnits ?? 0;
  result.blockers = unique(blockers);
  if (result.blockers.length) return result;

  if (!selected.size || selectedUnits === 0n) {
    result.status = "missing_mix";
    result.blockers = [
      "Elegí cantidades relativas para definir la mezcla de productos.",
    ];
    return result;
  }

  result.averageContribution = money(
    roundRatio(selectedContribution, selectedUnits),
  );
  if (scenario.expectedUnits !== null) {
    const volume = BigInt(scenario.expectedUnits);
    result.projectedContribution = money(
      roundRatio(selectedContribution * volume, selectedUnits),
    );
    result.projectedProfit = money(
      roundRatio(
        selectedContribution * volume - budget! * selectedUnits,
        selectedUnits,
      ),
    );
    if (
      result.projectedContribution === null ||
      result.projectedProfit === null
    ) {
      result.projectedContribution = null;
      result.projectedProfit = null;
      result.blockers = [RANGE_MESSAGE];
      return result;
    }
  }
  if (result.averageContribution === null) {
    result.blockers = [RANGE_MESSAGE];
    return result;
  }
  if (selectedContribution <= 0n) {
    result.status = "non_positive";
    result.blockers = [
      "El aporte de la mezcla es cero o negativo; aumentar las ventas no cubre los gastos mensuales.",
    ];
    return result;
  }

  // Reduce relative counts so every required pattern contains whole sales.
  const divisor = [...selected.values()].reduce(greatestCommonDivisor, 0n);
  const patternContribution = selectedContribution / divisor;
  const patternUnits = selectedUnits / divisor;
  const threshold = ceiling(budget!, patternContribution) * patternUnits;
  result.breakEvenUnits = safeNumber(threshold);
  if (result.breakEvenUnits === null) {
    result.blockers = [RANGE_MESSAGE];
    return result;
  }
  if (scenario.daysOpen !== null) {
    result.breakEvenPerDay = Number(
      ceiling(threshold, BigInt(scenario.daysOpen)),
    );
  }
  result.status = "ready";
  return result;
}
