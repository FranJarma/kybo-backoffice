import type { PoolClient } from "pg";
import type { TransitionMapping } from "./mapping";
/** Called inside the exclusive transition transaction, never by application requests. */
export async function backfill(
  client: PoolClient,
  mapping: TransitionMapping,
  hash: string,
) {
  const b = mapping.initialBranch,
    l = mapping.initialLocation;
  await client.query(
    "insert into data_model_state(id,status,cutover_at,mapping_hash) values(1,'transitioning',$1,$2)",
    [mapping.cutoverAt, hash],
  );
  await client.query(
    "insert into branches(id,code,name,time_zone) values($1,$2,$3,$4)",
    [b.id, b.code, b.name, b.timeZone],
  );
  await client.query(
    "insert into locations(id,branch_id,code,name) values($1,$2,$3,$4)",
    [l.id, b.id, l.code, l.name],
  );
  // Archived records keep their identifiers. They remain unusable until classified.
  await client.query(
    "update items set code='LEGACY-' || upper(id::text),class='unclassified',purchasable=false,recipe_usable=false",
  );
  for (const item of mapping.itemClassifications)
    await client.query(
      "update items set code=$2,class=$3,purchasable=$4,recipe_usable=$5 where id=$1",
      [item.id, item.code, item.class, item.purchasable, item.recipeUsable],
    );
  for (const m of mapping.memberships)
    await client.query(
      "insert into branch_memberships(branch_id,user_id,role) values($1,$2,$3)",
      [m.branchId, m.userId, m.role],
    );
  for (const userId of mapping.catalogManagers)
    await client.query(
      "update operational_users set catalog_manager=true where user_id=$1",
      [userId],
    );
  for (const table of [
    "dining_tables",
    "sales",
    "sale_orders",
    "sale_lines",
    "preparation_stations",
    "preparation_tasks",
    "preparation_routes",
    "purchase_receipts",
    "production_batches",
  ])
    await client.query(`update "${table}" set branch_id=$1`, [b.id]);
  await client.query(
    "update preparation_stations set consumption_location_id=$1",
    [l.id],
  );
  await client.query(
    "insert into location_stock_balances(item_id,location_id,branch_id,quantity,reserved) select item_id,$1,$2,physical_quantity,0 from stock_balances",
    [l.id, b.id],
  );
  await client.query(
    "insert into inventory_valuations(item_id,branch_id,quantity,value) select item_id,$1,physical_quantity,stock_value from stock_balances",
    [b.id],
  );
  await client.query(
    "insert into lot_location_balances(lot_id,location_id,branch_id,quantity,reserved,blocked) select id,$1,$2,remaining_quantity,0,blocked from inventory_lots",
    [l.id, b.id],
  );
  await client.query(
    "insert into stock_transition_baselines(item_id,location_id,quantity,value) select item_id,$1,physical_quantity,stock_value from stock_balances",
    [l.id],
  );
  await client.query(
    "insert into lot_transition_baselines(lot_id,location_id,quantity) select id,$1,remaining_quantity from inventory_lots",
    [l.id],
  );
  // Commercial activation is an explicit post-transition configuration decision.
  await client.query(
    "insert into branch_products(branch_id,product_id,enabled,dispatch_location_id) select $1,id,false,$2 from products",
    [b.id, l.id],
  );
}
export async function reconcileCutover(
  client: PoolClient,
  mapping: TransitionMapping,
) {
  const { rows } = await client.query(
    `select count(*)::int as differences from (
    select coalesce(b.item_id,v.item_id) from stock_balances b full join inventory_valuations v on v.item_id=b.item_id and v.branch_id=$1
    where b.physical_quantity is distinct from v.quantity or b.stock_value is distinct from v.value
    union all select coalesce(l.id,c.lot_id) from inventory_lots l full join lot_location_balances c on c.lot_id=l.id and c.location_id=$2
    where l.remaining_quantity is distinct from c.quantity or c.reserved<>0
    union all select coalesce(b.item_id,c.item_id) from stock_balances b full join location_stock_balances c on c.item_id=b.item_id and c.location_id=$2
    where b.physical_quantity is distinct from c.quantity or c.reserved<>0
  ) differences`,
    [mapping.initialBranch.id, mapping.initialLocation.id],
  );
  if (rows[0].differences !== 0)
    throw new Error("La conciliación del corte detectó diferencias.");
}
