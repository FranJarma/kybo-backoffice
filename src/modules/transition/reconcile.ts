import {
  stockTransfers,
  transferAllocations,
  transferResolutions,
} from "@/db/transfer-schema";
import { stockDocuments } from "@/db/inventory-document-schema";
import { eq, inArray, or } from "drizzle-orm";
import type { AppDb } from "@/db/client";
import { locations } from "@/db/branch-schema";
import { inventoryLots } from "@/db/inventory-schema";
import { stockMovements } from "@/db/stock-movement-schema";
import {
  inventoryValuations,
  locationStockBalances,
  lotLocationBalances,
} from "@/db/stock-schema";
import { reservationAllocations } from "@/db/reservation-schema";
import {
  stockTransitionBaselines,
  lotTransitionBaselines,
} from "@/db/transition-schema";
import { integer, six } from "../inventory/decimal";
import { replayValuation } from "./valuation-replay";
export async function reconcile(db: AppDb, branchIds: string[]) {
  if (!branchIds.length) return { ok: true, differences: [] };
  return db.transaction(
    async (tx) => {
      const differences: {
        code: string;
        recordId: string;
        expected: string | null;
        actual: string | null;
      }[] = [];
      const compare = (
        code: string,
        key: string,
        expected: string | null,
        actual: string | null,
      ) => {
        if (expected !== actual)
          differences.push({ code, recordId: key, expected, actual });
      };
      const initial = await tx
        .select({ row: stockTransitionBaselines, branchId: locations.branchId })
        .from(stockTransitionBaselines)
        .innerJoin(
          locations,
          eq(locations.id, stockTransitionBaselines.locationId),
        )
        .where(inArray(locations.branchId, branchIds));
      const lotInitial = await tx
        .select({ row: lotTransitionBaselines })
        .from(lotTransitionBaselines)
        .innerJoin(
          locations,
          eq(locations.id, lotTransitionBaselines.locationId),
        )
        .where(inArray(locations.branchId, branchIds));
      const movements = await tx
        .select()
        .from(stockMovements)
        .where(inArray(stockMovements.branchId, branchIds))
        .orderBy(stockMovements.sequence);
      const balances = await tx
        .select()
        .from(locationStockBalances)
        .where(inArray(locationStockBalances.branchId, branchIds));
      const lots = await tx
        .select({ row: lotLocationBalances, itemId: inventoryLots.itemId })
        .from(lotLocationBalances)
        .innerJoin(
          inventoryLots,
          eq(inventoryLots.id, lotLocationBalances.lotId),
        )
        .where(inArray(lotLocationBalances.branchId, branchIds));
      const valuations = await tx
        .select()
        .from(inventoryValuations)
        .where(inArray(inventoryValuations.branchId, branchIds));
      const reservations = await tx
        .select()
        .from(reservationAllocations)
        .where(inArray(reservationAllocations.branchId, branchIds));
      const locationQ = new Map<string, bigint>(),
        lotQ = new Map<string, bigint>(),
        locationReserved = new Map<string, bigint>(),
        lotReserved = new Map<string, bigint>();
      const add = (map: Map<string, bigint>, key: string, q: bigint) =>
        map.set(key, (map.get(key) ?? 0n) + q);
      for (const { row } of initial)
        add(
          locationQ,
          `${row.itemId}/${row.locationId}`,
          integer(row.quantity),
        );
      for (const { row } of lotInitial)
        add(lotQ, `${row.lotId}/${row.locationId}`, integer(row.quantity));
      for (const m of movements) {
        add(locationQ, `${m.itemId}/${m.locationId}`, integer(m.quantity));
        add(lotQ, `${m.lotId}/${m.locationId}`, integer(m.quantity));
      }
      for (const r of reservations) {
        const q =
          integer(r.allocated) - integer(r.consumed) - integer(r.released);
        add(locationReserved, `${r.itemId}/${r.locationId}`, q);
        add(lotReserved, `${r.lotId}/${r.locationId}`, q);
      }
      const compareMaps = (
        code: string,
        expected: Map<string, bigint>,
        actual: Map<string, bigint>,
      ) => {
        for (const key of new Set([...expected.keys(), ...actual.keys()]))
          compare(
            code,
            key,
            six(expected.get(key) ?? 0n),
            six(actual.get(key) ?? 0n),
          );
      };
      compareMaps(
        "location_quantity",
        locationQ,
        new Map(
          balances.map((b) => [
            `${b.itemId}/${b.locationId}`,
            integer(b.quantity),
          ]),
        ),
      );
      compareMaps(
        "lot_quantity",
        lotQ,
        new Map(
          lots.map(({ row: b }) => [
            `${b.lotId}/${b.locationId}`,
            integer(b.quantity),
          ]),
        ),
      );
      compareMaps(
        "location_reserved",
        locationReserved,
        new Map(
          balances.map((b) => [
            `${b.itemId}/${b.locationId}`,
            integer(b.reserved),
          ]),
        ),
      );
      compareMaps(
        "lot_reserved",
        lotReserved,
        new Map(
          lots.map(({ row: b }) => [
            `${b.lotId}/${b.locationId}`,
            integer(b.reserved),
          ]),
        ),
      );
      const lotTotals = new Map<string, bigint>();
      for (const { row, itemId } of lots)
        add(lotTotals, `${itemId}/${row.locationId}`, integer(row.quantity));
      compareMaps(
        "location_lot_total",
        lotTotals,
        new Map(
          balances.map((b) => [
            `${b.itemId}/${b.locationId}`,
            integer(b.quantity),
          ]),
        ),
      );
      const valuationKeys = new Set([
        ...initial.map((b) => `${b.branchId}/${b.row.itemId}`),
        ...movements.map((m) => `${m.branchId}/${m.itemId}`),
        ...valuations.map((v) => `${v.branchId}/${v.itemId}`),
      ]);
      for (const key of valuationKeys) {
        const baseline = initial.filter(
          (b) => `${b.branchId}/${b.row.itemId}` === key,
        );
        const quantity = six(
          baseline.reduce((sum, b) => sum + integer(b.row.quantity), 0n),
        );
        const value = baseline.some((b) => b.row.value === null)
          ? null
          : six(baseline.reduce((sum, b) => sum + integer(b.row.value!), 0n));
        const entries = movements.filter(
            (m) => `${m.branchId}/${m.itemId}` === key,
          ),
          expected = replayValuation({ quantity, value }, entries),
          actual = valuations.find((v) => `${v.branchId}/${v.itemId}` === key);
        compare(
          "valuation_quantity",
          key,
          expected.quantity,
          actual?.quantity ?? "0.000000",
        );
        compare(
          "valuation_value",
          key,
          expected.value,
          actual?.value === undefined ? "0.000000" : actual.value,
        );
        for (const index of expected.invalidMovements)
          differences.push({
            code: "movement_value",
            recordId: entries[index].id,
            expected: "valor según saldo anterior",
            actual: entries[index].value,
          });
      }
      const transfers = await tx
        .select()
        .from(stockTransfers)
        .where(
          or(
            inArray(stockTransfers.originBranchId, branchIds),
            inArray(stockTransfers.destinationBranchId, branchIds),
          ),
        );
      if (transfers.length) {
        const ids = transfers.map((t) => t.id),
          allocations = await tx
            .select()
            .from(transferAllocations)
            .where(inArray(transferAllocations.transferId, ids));
        const posted = await tx
          .select({ transferId: stockDocuments.transferId, m: stockMovements })
          .from(stockDocuments)
          .innerJoin(
            stockMovements,
            eq(stockMovements.documentId, stockDocuments.id),
          )
          .where(inArray(stockDocuments.transferId, ids));
        const resolutions = allocations.length
          ? await tx
              .select()
              .from(transferResolutions)
              .where(
                inArray(
                  transferResolutions.allocationId,
                  allocations.map((a) => a.id),
                ),
              )
          : [];
        const sum = (rows: { quantity: string }[]) =>
          rows.reduce((s, r) => s + integer(r.quantity), 0n);
        const value = (rows: { value: string | null }[]) =>
          rows.some((r) => r.value === null)
            ? null
            : rows.reduce((s, r) => s + integer(r.value!), 0n);
        for (const a of allocations) {
          const t = transfers.find((t) => t.id === a.transferId)!,
            legs = posted
              .filter((p) => p.transferId === t.id && p.m.lotId === a.lotId)
              .map((p) => p.m),
            out = legs.filter(
              (m) =>
                integer(m.quantity) < 0n && m.locationId === t.originLocationId,
            ),
            received = legs.filter(
              (m) =>
                integer(m.quantity) > 0n &&
                m.locationId === t.destinationLocationId,
            ),
            returned = legs.filter(
              (m) =>
                integer(m.quantity) > 0n && m.locationId === t.originLocationId,
            ),
            resolved = resolutions.filter((r) => r.allocationId === a.id);
          const dispatched = t.state !== "confirmed" && t.state !== "cancelled";
          compare(
            "transfer_dispatch_quantity",
            a.id,
            dispatched ? a.quantity : "0.000000",
            six(-sum(out)),
          );
          compare(
            "transfer_received_quantity",
            a.id,
            a.received,
            six(sum(received)),
          );
          compare(
            "transfer_resolved_quantity",
            a.id,
            a.resolved,
            six(sum(resolved)),
          );
          compare(
            "transfer_return_quantity",
            a.id,
            six(sum(resolved.filter((r) => r.kind === "return"))),
            six(sum(returned)),
          );
          if (dispatched) {
            const dispatchedValue = value(out);
            compare(
              "transfer_dispatch_value",
              a.id,
              a.dispatchValue,
              dispatchedValue === null ? null : six(-dispatchedValue),
            );
            const settled = value([...received, ...resolved]);
            compare(
              "transfer_settled_value",
              a.id,
              a.settledValue,
              settled === null ? "0.000000" : six(settled),
            );
            const returnValue = value(
                resolved.filter((r) => r.kind === "return"),
              ),
              incomingReturnValue = value(returned);
            compare(
              "transfer_return_value",
              a.id,
              returnValue === null ? null : six(returnValue),
              incomingReturnValue === null ? null : six(incomingReturnValue),
            );
          }
        }
      }
      return { ok: differences.length === 0, differences };
    },
    { isolationLevel: "repeatable read", accessMode: "read only" },
  );
}
