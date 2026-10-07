import type { PoolClient } from "pg";
import type { TransitionMapping } from "./mapping";
export async function preflight(
  client: PoolClient,
  mapping?: TransitionMapping,
) {
  const { rows: relation } = await client.query<{
    old: string | null;
    current: string | null;
  }>(
    "select to_regclass('public.ingredients')::text as old, to_regclass('public.items')::text as current",
  );
  if (!relation[0].old)
    return {
      ready: false,
      blockers: [
        relation[0].current
          ? "La base ya fue expandida; revisá su estado antes de repetir la transición."
          : "No se encontró el esquema 0.6.0-rc.1.",
      ],
      items: [],
      users: [],
      counts: {},
    };
  const { rows: items } = await client.query<{
    id: string;
    name: string;
    base_unit: string;
    archived_at: string | null;
  }>("select id,name,base_unit,archived_at from ingredients order by name,id");
  const { rows: users } = await client.query<{
    user_id: string;
    name: string;
    role: string;
  }>(
    'select u.user_id,p.name,u.role from operational_users u join "user" p on p.id=u.user_id where not u.disabled order by p.name,u.user_id',
  );
  const { rows: counts } = await client.query(
    "select (select count(*)::int from sales where status='open') as open_sales, (select count(*)::int from preparation_tasks where status in ('pending','preparing','ready')) as active_tasks, (select count(*)::int from inventory_movements) as movements, (select count(*)::int from inventory_lots) as lots, (select count(*)::int from sale_lines) as sale_lines",
  );
  const { rows: differences } = await client.query(
    "select coalesce(b.ingredient_id,l.ingredient_id) as item_id from stock_balances b full join (select ingredient_id,sum(remaining_quantity) as quantity from inventory_lots group by ingredient_id) l on l.ingredient_id=b.ingredient_id where coalesce(b.physical_quantity,0)<>coalesce(l.quantity,0)",
  );
  const blockers: string[] = [];
  if (counts[0].open_sales)
    blockers.push("Hay cuentas abiertas; resolvelas antes del corte.");
  if (counts[0].active_tasks)
    blockers.push(
      "Hay tareas de cocina pendientes, en preparación o listas para entregar.",
    );
  if (differences.length)
    blockers.push(
      "Los saldos globales no coinciden con sus lotes. Se requiere conciliación previa.",
    );
  if (!mapping)
    blockers.push(
      "Falta el mapeo explícito de sucursal, ubicación, artículos y permisos.",
    );
  else {
    const mapped = new Set(mapping.itemClassifications.map((i) => i.id));
    if (items.some((i) => i.archived_at === null && !mapped.has(i.id)))
      blockers.push("Falta clasificar uno o más artículos activos.");
    if (
      mapping.itemClassifications.some(
        (i) => !items.some((existing) => existing.id === i.id),
      )
    )
      blockers.push("El mapeo contiene un artículo inexistente.");
    if (
      mapping.memberships.some(
        (m) => !users.some((u) => u.user_id === m.userId),
      ) ||
      mapping.catalogManagers.some((id) => !users.some((u) => u.user_id === id))
    )
      blockers.push(
        "El mapeo de permisos incluye usuarios inexistentes o deshabilitados.",
      );
    if (new Date(mapping.cutoverAt).getTime() > Date.now())
      blockers.push("La fecha de corte todavía es futura.");
  }
  return {
    ready: blockers.length === 0,
    blockers,
    items,
    users,
    counts: counts[0],
    stockDifferences: differences,
  };
}
