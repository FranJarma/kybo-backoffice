import { and, asc, eq, isNull, or, sql } from "drizzle-orm";
import { customers } from "@/db/business-schema";
import { audit, conflict, invalid, type Tx } from "../inventory/service";
import type { Actor } from "@/lib/access";

/** Called inside the sale transaction: no orphan registrations on a failed checkout. */
export async function resolveSaleCustomer(
  tx: Tx,
  actor: Actor,
  input: {
    customerId?: string | null;
    customerName?: string | null;
    newCustomer?: { name: string; email?: string };
  },
) {
  if (input.customerId) {
    const [customer] = await tx
      .select()
      .from(customers)
      .where(eq(customers.id, input.customerId))
      .for("share");
    if (!customer || customer.archivedAt)
      return invalid("Elegí un cliente activo.");
    return { id: customer.id, name: customer.name };
  }
  if (!input.newCustomer) return { id: null, name: input.customerName ?? null };
  const { name, email } = input.newCustomer;
  const normalized = name.toLowerCase();
  // Protect name/email identity across POS transactions; never update an existing contact.
  const identities = [
    `pos-customer:name:${normalized}`,
    ...(email ? [`pos-customer:email:${email}`] : []),
  ].sort();
  for (const key of identities)
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtextextended(${key}, 0))`,
    );
  const sameName = sql`lower(regexp_replace(btrim(${customers.name}), '[[:space:]]+', ' ', 'g')) = ${normalized}`;
  const matches = await tx
    .select()
    .from(customers)
    .where(
      and(
        isNull(customers.archivedAt),
        or(
          sameName,
          email ? sql`lower(${customers.email}) = ${email}` : undefined,
        ),
      ),
    )
    .orderBy(asc(customers.id))
    .for("share");
  const byEmail = email
    ? matches.filter((c) => c.email?.toLowerCase() === email)
    : [];
  if (
    byEmail.length &&
    (byEmail.length !== 1 ||
      byEmail[0].name.trim().replace(/\s+/g, " ").toLowerCase() !== normalized)
  )
    return conflict(
      "Ese email ya está registrado. Buscá y seleccioná al cliente del listado.",
    );
  if (byEmail.length) return { id: byEmail[0].id, name: byEmail[0].name };
  const byName = matches.filter(
    (c) => c.name.trim().replace(/\s+/g, " ").toLowerCase() === normalized,
  );
  if (!email && byName.length > 1)
    return conflict(
      "Hay varios clientes con ese nombre. Seleccioná uno del listado o indicá su email.",
    );
  if (!email && byName.length === 1)
    return { id: byName[0].id, name: byName[0].name };
  const [customer] = await tx
    .insert(customers)
    .values({ name, email: email ?? null })
    .returning();
  await audit(tx, actor, "customers", customer.id, "create", {
    name,
    email: email ?? null,
    source: "pos",
  });
  return { id: customer.id, name: customer.name };
}
