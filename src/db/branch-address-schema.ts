import { sql } from "drizzle-orm";
import {
  pgTable,
  uuid,
  text,
  doublePrecision,
  integer,
  timestamp,
  check,
} from "drizzle-orm/pg-core";
import { branches } from "./branch-schema";
import { user } from "./auth-schema";

export const branchAddresses = pgTable(
  "branch_addresses",
  {
    branchId: uuid("branch_id")
      .primaryKey()
      .references(() => branches.id),
    address: text("address").notNull(),
    latitude: doublePrecision("latitude").notNull(),
    longitude: doublePrecision("longitude").notNull(),
    source: text("source").$type<"photon" | "manual">().notNull(),
    revision: integer("revision").notNull().default(1),
    confirmedBy: text("confirmed_by")
      .notNull()
      .references(() => user.id),
    confirmedAt: timestamp("confirmed_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    check(
      "branch_address_values",
      sql`length(trim(${t.address})) between 5 and 500 and ${t.latitude} between -90 and 90 and ${t.longitude} between -180 and 180 and ${t.revision}>0 and ${t.source} in ('photon','manual')`,
    ),
  ],
);
