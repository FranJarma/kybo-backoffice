import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
import { drizzle } from "drizzle-orm/pglite";
import type { PoolClient } from "pg";
import type { AppDb } from "../../src/db/client";
import * as schema from "../../src/db/schema";
import {
  prepareEmptyTestDatabase,
  requireMigrationTestPermission,
} from "./data-model-fixture";
export async function createDataModelTestContext(
  options: {
    legacyCatalog?: boolean;
    legacyWaste?: boolean;
    directory?: string;
    legacyComboGroups?: boolean;
    legacyReplenishment?: boolean;
    legacyPricing?: boolean;
    legacyDailyOperations?: boolean;
    legacySupplyAlerts?: boolean;
    legacyProcurement?: boolean;
    attendance?: boolean;
    branchAddress?: boolean;
    attendanceAccess?: boolean;
  } = {},
) {
  requireMigrationTestPermission();
  const client = new PGlite(options.directory);
  try {
    const fixture = await prepareEmptyTestDatabase(
      client as unknown as PoolClient,
    );
    if (!options.legacyCatalog) {
      await client.exec(
        await readFile("drizzle/0009_product_catalog.sql", "utf8"),
      );
    }
    if (!options.legacyCatalog && !options.legacyWaste)
      await client.exec(
        await readFile("drizzle/0010_recipe_waste.sql", "utf8"),
      );
    // Shipping only extends the existing receipt tables (no sourcing dependency).
    if (!options.legacyCatalog && !options.legacyWaste)
      await client.exec(
        await readFile("drizzle/0012_purchase_shipping.sql", "utf8"),
      );
    await client.exec(
      await readFile("drizzle/0013_item_stock_tracking.sql", "utf8"),
    );
    await client.exec(
      await readFile("drizzle/0014_recipe_preparation_guide.sql", "utf8"),
    );
    await client.exec(
      await readFile("drizzle/0015_production_assignments.sql", "utf8"),
    );
    await client.exec(
      await readFile("drizzle/0016_production_result_review.sql", "utf8"),
    );
    await client.exec(
      await readFile("drizzle/0017_username_login.sql", "utf8"),
    );
    await client.exec(
      await readFile("drizzle/0018_product_combos.sql", "utf8"),
    );
    if (!options.legacyComboGroups)
      await client.exec(
        await readFile("drizzle/0019_product_option_groups.sql", "utf8"),
      );
    if (!options.legacyReplenishment)
      await client.exec(
        await readFile("drizzle/0020_replenishment_policies.sql", "utf8"),
      );
    if (!options.legacyPricing) {
      await client.exec(
        await readFile("drizzle/0021_product_vat_payment_fees.sql", "utf8"),
      );
      // Explicit convention for older untaxed fixture scenarios only. The
      // production migration leaves rates unknown; pending tests insert NULL.
      await client.exec(
        "alter table products alter column vat_rate set default 0",
      );
    }
    await client.exec(
      await readFile("drizzle/0022_business_overheads.sql", "utf8"),
    );
    await client.exec(await readFile("drizzle/0023_costing_iibb.sql", "utf8"));
    await client.exec(await readFile("drizzle/0024_order_pickup.sql", "utf8"));
    if (!options.legacyDailyOperations)
      await client.exec(
        await readFile("drizzle/0025_daily_operations.sql", "utf8"),
      );
    if (!options.legacyDailyOperations && !options.legacySupplyAlerts)
      await client.exec(
        await readFile("drizzle/0026_supply_alerts.sql", "utf8"),
      );
    if (!options.legacyProcurement)
      await client.exec(
        await readFile("drizzle/0027_purchase_orders.sql", "utf8"),
      );
    await client.exec(await readFile("drizzle/0028_cash_register.sql", "utf8"));
    if (!options.legacyProcurement)
      await client.exec(
        await readFile("drizzle/0029_purchase_advances.sql", "utf8"),
      );
    if (options.attendance || options.branchAddress || options.attendanceAccess)
      await client.exec(
        await readFile("drizzle/0030_staff_attendance.sql", "utf8"),
      );
    if (options.branchAddress || options.attendanceAccess)
      await client.exec(
        await readFile("drizzle/0031_branch_addresses.sql", "utf8"),
      );
    if (options.attendanceAccess)
      await client.exec(
        await readFile("drizzle/0032_attendance_workplace_access.sql", "utf8"),
      );
    return {
      ...fixture,
      client,
      db: drizzle({ client, schema }) as unknown as AppDb,
      close: () => client.close(),
    };
  } catch (error) {
    await client.close();
    throw error;
  }
}
