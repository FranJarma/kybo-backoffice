import { z } from "zod";
import type { AppDb } from "@/db/client";
import type { Actor } from "@/lib/access";
import { requireCatalogRead } from "@/modules/branches/context";
import { costContext } from "./service";
import { consumptionQuantity, parseWaste } from "./waste";
import {
  decimal,
  integer,
  SCALE,
  roundedDivision,
  six,
  safeScaled,
} from "@/modules/inventory/decimal";

const inputSchema = z
  .object({
    yieldQuantity: z.string().max(80),
    rows: z
      .array(
        z
          .object({
            itemId: z.union([z.uuid(), z.literal("")]),
            quantity: z.string().max(80),
            wastePercent: z.string().max(80).optional(),
            multiplier: z.string().max(80).optional(),
            count: z.number().int().min(0).max(100).optional(),
            include: z.boolean().optional(),
          })
          .strict(),
      )
      .max(300),
  })
  .strict();

export async function previewRecipeCost(db: AppDb, actor: Actor, raw: unknown) {
  await requireCatalogRead(db, actor);
  const input = inputSchema.parse(raw);
  const estimate = await costContext(db);
  let total = 0n;
  let complete = true;
  const rows = input.rows.map((row) => {
    try {
      if (!row.itemId) throw new Error("missing");
      const net = decimal(row.quantity, 6, true, true)!;
      const waste = parseWaste(row.wastePercent);
      const factor =
        integer(decimal(row.multiplier ?? "1", 6, true, true)!) *
        BigInt(row.count ?? 1);
      const gross = consumptionQuantity(net, waste, factor);
      const cost = estimate(row.itemId);
      const amount =
        cost.value === null
          ? null
          : safeScaled(roundedDivision(cost.value * integer(gross), SCALE), 24);
      if (row.include !== false) {
        if (amount === null) complete = false;
        else total += amount;
      }
      return {
        consumption: gross,
        cost: amount === null ? null : six(amount),
        status: amount === null ? "missing-cost" : "ready",
      };
    } catch {
      if (row.include !== false) complete = false;
      return { consumption: null, cost: null, status: "incomplete" };
    }
  });
  let unitCost: string | null = null;
  try {
    if (complete)
      unitCost = six(
        safeScaled(
          roundedDivision(
            total * SCALE,
            integer(decimal(input.yieldQuantity, 6, true, true)!),
          ),
          24,
        ),
      );
  } catch {
    complete = false;
  }
  safeScaled(total, 24);
  return {
    rows,
    totalCost: complete ? six(total) : null,
    knownSubtotal: six(total),
    unitCost,
  };
}
