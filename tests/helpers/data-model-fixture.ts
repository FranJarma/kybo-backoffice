import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import {
  backfill,
  reconcileCutover,
} from "../../src/modules/transition/backfill";
import type { TransitionMapping } from "../../src/modules/transition/mapping";
export function requireMigrationTestPermission() {
  if (process.env.KYBO_ALLOW_TEST_MIGRATIONS !== "disposable-only")
    throw new Error(
      "Las pruebas de base requieren autorización explícita: KYBO_ALLOW_TEST_MIGRATIONS=disposable-only. No se conectó ninguna base.",
    );
}
export async function prepareEmptyTestDatabase(client: PoolClient) {
  const { rows } = await client.query(
    "select count(*)::int as count from pg_tables where schemaname='public'",
  );
  if (rows[0].count !== 0)
    throw new Error(
      "La base de pruebas debe estar vacía; no se elimina ni reemplaza contenido existente.",
    );
  const journal = JSON.parse(
    await readFile("drizzle/meta/_journal.json", "utf8"),
  ) as { entries: { idx: number; tag: string }[] };
  const apply = async (tag: string) => {
    for (const statement of (
      await readFile(`drizzle/${tag}.sql`, "utf8")
    ).split("--> statement-breakpoint")) {
      if (statement.trim()) await client.query(statement);
    }
  };
  await client.query("begin");
  try {
    for (const entry of journal.entries.filter((e) => e.idx <= 6))
      await apply(entry.tag);
    const itemId = randomUUID(),
      lotId = randomUUID();
    await client.query(
      "insert into ingredients(id,name,base_unit,unit_cost) values($1,'Artículo histórico','unit',null)",
      [itemId],
    );
    await client.query(
      "insert into stock_balances(ingredient_id,physical_quantity,stock_value) values($1,12,null)",
      [itemId],
    );
    await client.query(
      "insert into inventory_lots(id,ingredient_id,received_on,initial_quantity,remaining_quantity) values($1,$2,'2026-01-01',12,12)",
      [lotId, itemId],
    );
    await apply("0007_data_model_expand");
    const mapping: TransitionMapping = {
      initialBranch: {
        id: randomUUID(),
        code: "TEST-A",
        name: "Sucursal A",
        timeZone: "UTC",
      },
      initialLocation: { id: randomUUID(), code: "MAIN", name: "Depósito" },
      memberships: [],
      catalogManagers: [],
      itemClassifications: [
        {
          id: itemId,
          code: "LEGACY-TEST",
          class: "food",
          purchasable: true,
          recipeUsable: true,
        },
      ],
      cutoverAt: "2026-09-28T00:00:00Z",
    };
    await backfill(client, mapping, "test-mapping");
    await reconcileCutover(client, mapping);
    await apply("0008_data_model_finalize");
    await client.query("update data_model_state set status='ready' where id=1");
    await client.query("commit");
    return { mapping, itemId, lotId };
  } catch (error) {
    await client.query("rollback");
    throw error;
  }
}
