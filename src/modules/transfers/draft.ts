import { AppError } from "@/lib/errors";
import type { BaseUnit } from "../items/units";
import { integer, safeQuantity } from "../inventory/decimal";
import { formatTransferAmount, parseTransferQuantity } from "./quantities";
export type TransferDraftLine = {
  id: string;
  itemId: string;
  name: string;
  baseUnit: BaseUnit;
  amount: string;
  destinationLocationId: string;
};
export function addTransferDraftLine(
  lines: TransferDraftLine[],
  added: TransferDraftLine,
): TransferDraftLine[] {
  const matches = (line: TransferDraftLine) =>
    line.itemId === added.itemId &&
    line.destinationLocationId === added.destinationLocationId;
  const first = lines.findIndex(matches);
  if (first < 0 && lines.length >= 100)
    throw new AppError(
      "VALIDATION",
      "Podés agregar hasta 100 renglones por traslado.",
      400,
    );
  let total = integer(parseTransferQuantity(added.amount, added.baseUnit));
  for (const line of lines.filter(matches))
    total += integer(parseTransferQuantity(line.amount, line.baseUnit));
  const merged = {
    ...added,
    id: first < 0 ? added.id : lines[first].id,
    amount: formatTransferAmount(safeQuantity(total), added.baseUnit),
  };
  return first < 0
    ? [...lines, merged]
    : lines.flatMap((line, index) =>
        matches(line) ? (index === first ? [merged] : []) : [line],
      );
}
export function transferDraftLines(
  lines: TransferDraftLine[],
  origin: string,
  destinations: { id: string }[],
) {
  if (!lines.length || lines.length > 100)
    throw new AppError(
      "VALIDATION",
      "Agregá entre 1 y 100 insumos a la lista.",
      400,
    );
  return lines.map((line) => {
    if (
      line.destinationLocationId === origin ||
      !destinations.some(
        (location) => location.id === line.destinationLocationId,
      )
    )
      throw new AppError(
        "VALIDATION",
        `Elegí un destino válido, distinto del origen, para ${line.name}.`,
        400,
      );
    try {
      return {
        itemId: line.itemId,
        destinationLocationId: line.destinationLocationId,
        quantity: parseTransferQuantity(line.amount, line.baseUnit),
      };
    } catch (error) {
      throw new AppError(
        "VALIDATION",
        `Revisá la cantidad de ${line.name}: ${error instanceof Error ? error.message : "Cantidad inválida."}`,
        400,
      );
    }
  });
}
export function suggestTransferDestination(
  itemId: string,
  origin: string,
  policies: { itemId: string; locationId: string }[],
  destinations: { id: string; branchId: string }[],
  branchId: string,
) {
  const candidates = new Set(
    policies
      .filter(
        (policy) =>
          policy.itemId === itemId &&
          policy.locationId !== origin &&
          destinations.some(
            (location) =>
              location.id === policy.locationId &&
              location.branchId === branchId,
          ),
      )
      .map((policy) => policy.locationId),
  );
  return candidates.size === 1 ? [...candidates][0] : "";
}
