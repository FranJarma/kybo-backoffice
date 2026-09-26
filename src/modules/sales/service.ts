import { randomUUID } from "node:crypto";
import { and, asc, count, desc, eq, ilike, isNull, or, sql } from "drizzle-orm";
import { z } from "zod";
import type { AppDb } from "@/db/client";
import type { Actor } from "@/lib/access";
import { requireCatalogAccess } from "@/lib/access";
import {
  customers,
  products,
  productPrices,
  paymentMethods,
} from "@/db/business-schema";
import { sales, saleOrders, saleLines, salePayments } from "@/db/sales-schema";
import { recipes, recipeVersions } from "@/db/recipe-schema";
import {
  audit,
  claim,
  conflict,
  fingerprint,
  invalid,
  notFound,
  businessDate,
  type Tx,
} from "@/modules/inventory/service";
import { cents, integer } from "@/modules/inventory/decimal";
import {
  salesAccess,
  parse,
  uuid,
  createSchema,
  orderSchema,
  paySchema,
  cancelSchema,
  channelSchema,
  moneyBound,
  type LineInput,
  type PaymentInput,
} from "./validation";
import { lockTable, salesTransaction } from "./tables";
import { saleDetail, summaries } from "./queries";
import {
  publishOrder,
  cancelSaleTasks,
} from "@/modules/preparation/publication";
import type { SaleChannel, SaleList, SaleLookup } from "./types";

async function replaySaleDetail(tx: Tx, id: string) {
  // Every mutation locks this header. Keep it stable across the detail queries.
  await tx
    .select({ id: sales.id })
    .from(sales)
    .where(eq(sales.id, id))
    .for("share");
  return saleDetail(tx, id);
}
async function lockSale(tx: Tx, id: string, revision: number) {
  const [row] = await tx
    .select()
    .from(sales)
    .where(eq(sales.id, id))
    .for("update");
  if (!row) notFound();
  if (row.revision !== revision)
    conflict("La cuenta cambió. Actualizala antes de continuar.");
  if (row.status === "cancelled") conflict("Esta venta está anulada.");
  return row;
}
async function prepareLines(
  tx: Tx,
  actor: Actor,
  channel: SaleChannel,
  lines: LineInput[],
) {
  const catalog = new Map<
    string,
    { name: string; price: string | null; recipeVersionId: string | null }
  >();
  for (const id of [...new Set(lines.map((l) => l.productId))].sort()) {
    // Catalog updates also lock product before editing prices. SHARE prevents stale acceptance.
    const [product] = await tx
      .select()
      .from(products)
      .where(eq(products.id, id))
      .for("share");
    if (!product || product.archivedAt) invalid("Elegí productos activos.");
    const [price] = await tx
      .select()
      .from(productPrices)
      .where(
        and(
          eq(productPrices.productId, id),
          eq(productPrices.channel, channel),
        ),
      );
    const [version] = await tx
      .select({ id: recipeVersions.id })
      .from(recipeVersions)
      .innerJoin(
        recipes,
        and(
          eq(recipes.id, recipeVersions.recipeId),
          eq(recipes.productId, id),
          eq(recipes.revision, recipeVersions.version),
        ),
      )
      .limit(1);
    catalog.set(id, {
      name: product.name,
      price: price?.amount ?? null,
      recipeVersionId: version?.id ?? null,
    });
  }
  let total = 0n;
  const values = lines.map((line, position) => {
    const product = catalog.get(line.productId)!;
    if (product.price !== line.expectedPrice)
      conflict(
        `Cambió el precio de ${product.name}. Actualizá la carta y revisá el pedido.`,
      );
    if (line.price !== product.price) {
      if (!line.priceReason)
        invalid(`Indicá el motivo del precio aplicado a ${product.name}.`);
      if (channel === "counter" && actor.role === "staff")
        invalid(
          "Un encargado debe autorizar cambios de precio en el local.",
          "FORBIDDEN",
          403,
        );
    }
    const lineTotal = integer(line.price) * BigInt(line.quantity);
    total += lineTotal;
    return {
      position,
      productId: line.productId,
      name: product.name,
      quantity: line.quantity,
      listPrice: product.price,
      unitPrice: line.price,
      lineTotal: moneyBound(lineTotal),
      priceReason: line.priceReason || null,
      notes: line.notes || null,
      recipeVersionId: product.recipeVersionId,
    };
  });
  return { values, totalAmount: moneyBound(total) };
}
async function preparePayments(
  tx: Tx,
  channel: string,
  payments: PaymentInput[],
) {
  const methods = new Map<string, typeof paymentMethods.$inferSelect>();
  for (const id of [
    ...new Set(
      payments
        .filter((p) => p.collector === "local")
        .map((p) => p.methodId)
        .filter((v): v is string => !!v),
    ),
  ].sort()) {
    const [method] = await tx
      .select()
      .from(paymentMethods)
      .where(eq(paymentMethods.id, id))
      .for("share");
    if (!method || method.archivedAt) invalid("Elegí un medio de pago activo.");
    methods.set(id, method);
  }
  let total = 0n;
  const values = payments.map((p) => {
    if (p.collector === "platform" && (channel === "counter" || p.methodId))
      invalid(
        "El cobro por plataforma requiere un pedido de delivery y no usa un medio local.",
      );
    const method = p.methodId ? methods.get(p.methodId) : undefined;
    if (p.collector === "local" && !method)
      invalid("Elegí el medio de pago del cobro local.");
    total += integer(p.amount);
    return {
      kind: "collection",
      collector: p.collector,
      methodId: method?.id ?? null,
      methodName: method?.name ?? null,
      methodKind: method?.kind ?? null,
      amount: p.amount,
      reference: p.reference || null,
    };
  });
  return { values, totalAmount: moneyBound(total) };
}
async function insertOrder(
  tx: Tx,
  actor: Actor,
  saleId: string,
  sequence: number,
  prepared: Awaited<ReturnType<typeof prepareLines>>,
  notes: string,
) {
  const id = randomUUID();
  await tx.insert(saleOrders).values({
    id,
    saleId,
    sequence,
    totalAmount: prepared.totalAmount,
    notes: notes || null,
    actorId: actor.id,
  });
  await tx
    .insert(saleLines)
    .values(prepared.values.map((l) => ({ ...l, orderId: id })));
  await publishOrder(tx, actor, id);
}
const listSchema = z
  .object({
    origin: z.enum(["counter", "table", "delivery"]).optional(),
    status: z.enum(["open", "closed", "cancelled"]).optional(),
    date: z.iso.date().optional(),
    q: z.string().max(160).default(""),
    offset: z.number().int().min(0).max(1_000_000).default(0),
  })
  .strict();
const term = (s: string) => `%${s.trim().replace(/[\\%_]/g, "\\$&")}%`;

export function createSalesService(db: AppDb) {
  return {
    async create(actor: Actor | null, raw: unknown) {
      salesAccess(actor);
      const input = parse(createSchema, raw),
        id = randomUUID();
      return salesTransaction(() =>
        db.transaction(async (tx) => {
          const old = await claim(
            tx,
            actor,
            "sale-create",
            input.requestId,
            fingerprint("sale-create", input),
            id,
          );
          if (old) return replaySaleDetail(tx, old);
          if (input.origin === "delivery") {
            if (
              input.channel === "counter" ||
              !input.externalId ||
              !["delivery", "pickup"].includes(input.fulfillment) ||
              input.tableId
            )
              invalid(
                "Completá plataforma, número externo y modalidad de entrega.",
              );
          } else if (
            input.channel !== "counter" ||
            input.externalId ||
            !["takeaway", "dine_in"].includes(input.fulfillment)
          )
            invalid(
              "La venta local requiere canal local y una modalidad válida.",
            );
          if (
            input.origin === "table" &&
            (!input.tableId || input.fulfillment !== "dine_in")
          )
            invalid("Elegí la mesa para abrir la cuenta.");
          if (input.tableId && input.fulfillment !== "dine_in")
            invalid("Una mesa requiere consumo en el local.");
          const table = input.tableId
            ? await lockTable(tx, input.tableId)
            : null;
          if (input.origin === "table") {
            const [open] = await tx
              .select({ id: sales.id })
              .from(sales)
              .where(
                and(
                  eq(sales.tableId, table!.id),
                  eq(sales.origin, "table"),
                  eq(sales.status, "open"),
                ),
              )
              .limit(1);
            if (open)
              conflict(
                "La mesa tiene una cuenta abierta. Agregá el pedido a esa cuenta.",
              );
          }
          let customerName: string | null = null;
          if (input.customerId) {
            const [customer] = await tx
              .select()
              .from(customers)
              .where(eq(customers.id, input.customerId))
              .for("share");
            if (!customer || customer.archivedAt)
              invalid("Elegí un cliente activo.");
            customerName = customer.name;
          }
          const lines = await prepareLines(
            tx,
            actor,
            input.channel,
            input.lines,
          );
          const payments = await preparePayments(
            tx,
            input.channel,
            input.payments,
          );
          const total = integer(lines.totalAmount),
            paid = integer(payments.totalAmount);
          if (paid > total) invalid("El cobro supera el total de la venta.");
          if (input.origin === "counter" && paid !== total)
            invalid("Cobrá el total antes de confirmar la venta de mostrador.");
          const now = new Date(),
            closed = paid === total;
          await tx.insert(sales).values({
            id,
            origin: input.origin,
            channel: input.channel,
            fulfillment: input.fulfillment,
            status: closed ? "closed" : "open",
            tableId: table?.id ?? null,
            tableName: table?.name ?? null,
            customerId: input.customerId ?? null,
            customerName,
            externalId: input.externalId?.toUpperCase() ?? null,
            notes: input.notes || null,
            totalAmount: lines.totalAmount,
            paidAmount: payments.totalAmount,
            businessDate: businessDate(now),
            actorId: actor.id,
            closedAt: closed ? now : null,
          });
          await insertOrder(tx, actor, id, 1, lines, input.notes);
          if (payments.values.length)
            await tx.insert(salePayments).values(
              payments.values.map((p) => ({
                ...p,
                saleId: id,
                actorId: actor.id,
              })),
            );
          await audit(tx, actor, "sales", id, "create", input);
          return saleDetail(tx, id);
        }),
      );
    },
    async addOrder(actor: Actor | null, id: string, raw: unknown) {
      salesAccess(actor);
      parse(uuid, id);
      const input = parse(orderSchema, raw);
      return db.transaction(async (tx) => {
        const old = await claim(
          tx,
          actor,
          "sale-order",
          input.requestId,
          fingerprint("sale-order", { id, ...input }),
          id,
        );
        if (old) return replaySaleDetail(tx, old);
        const sale = await lockSale(tx, id, input.revision);
        if (sale.status !== "open" || sale.origin !== "table")
          conflict("Solo podés agregar pedidos a una cuenta de mesa abierta.");
        const [{ total: orderCount }] = await tx
          .select({ total: count() })
          .from(saleOrders)
          .where(eq(saleOrders.saleId, id));
        if (orderCount >= 100)
          invalid("La cuenta alcanzó el límite de 100 pedidos.");
        const lines = await prepareLines(
          tx,
          actor,
          sale.channel as SaleChannel,
          input.lines,
        );
        await insertOrder(tx, actor, id, orderCount + 1, lines, input.notes);
        await tx
          .update(sales)
          .set({
            totalAmount: moneyBound(
              integer(sale.totalAmount) + integer(lines.totalAmount),
            ),
            revision: sale.revision + 1,
          })
          .where(eq(sales.id, id));
        await audit(tx, actor, "sales", id, "order", input);
        return saleDetail(tx, id);
      });
    },
    async pay(actor: Actor | null, id: string, raw: unknown) {
      salesAccess(actor);
      parse(uuid, id);
      const input = parse(paySchema, raw);
      return db.transaction(async (tx) => {
        const old = await claim(
          tx,
          actor,
          "sale-pay",
          input.requestId,
          fingerprint("sale-pay", { id, ...input }),
          id,
        );
        if (old) return replaySaleDetail(tx, old);
        const sale = await lockSale(tx, id, input.revision);
        if (sale.status !== "open") conflict("La cuenta ya está cobrada.");
        const payments = await preparePayments(
          tx,
          sale.channel,
          input.payments,
        );
        const paid = integer(sale.paidAmount) + integer(payments.totalAmount),
          total = integer(sale.totalAmount);
        if (paid > total) invalid("El cobro supera el saldo pendiente.");
        await tx.insert(salePayments).values(
          payments.values.map((p) => ({
            ...p,
            saleId: id,
            actorId: actor.id,
          })),
        );
        await tx
          .update(sales)
          .set({
            paidAmount: cents(paid),
            status: paid === total ? "closed" : "open",
            closedAt: paid === total ? new Date() : null,
            revision: sale.revision + 1,
          })
          .where(eq(sales.id, id));
        await audit(tx, actor, "sales", id, "pay", input);
        return saleDetail(tx, id);
      });
    },
    async cancel(actor: Actor | null, id: string, raw: unknown) {
      requireCatalogAccess(actor);
      const a = actor!;
      parse(uuid, id);
      const input = parse(cancelSchema, raw);
      return db.transaction(async (tx) => {
        const old = await claim(
          tx,
          a,
          "sale-cancel",
          input.requestId,
          fingerprint("sale-cancel", { id, ...input }),
          id,
        );
        if (old) return replaySaleDetail(tx, old);
        const sale = await lockSale(tx, id, input.revision);
        if (integer(sale.paidAmount) > 0n && !input.refundConfirmed)
          invalid(
            "Confirmá la devolución ya realizada antes de anular una venta cobrada.",
          );
        const payments = await tx
          .select()
          .from(salePayments)
          .where(
            and(
              eq(salePayments.saleId, id),
              eq(salePayments.kind, "collection"),
            ),
          );
        if (payments.length)
          await tx.insert(salePayments).values(
            payments.map((p) => ({
              saleId: id,
              kind: "refund",
              collector: p.collector,
              methodId: p.methodId,
              methodName: p.methodName,
              methodKind: p.methodKind,
              amount: p.amount,
              reference: p.reference,
              originalPaymentId: p.id,
              actorId: a.id,
            })),
          );
        await tx
          .update(sales)
          .set({
            status: "cancelled",
            paidAmount: "0",
            cancelReason: input.reason,
            cancelledAt: new Date(),
            revision: sale.revision + 1,
          })
          .where(eq(sales.id, id));
        await audit(tx, a, "sales", id, "cancel", input);
        await cancelSaleTasks(tx, a, id, input.reason);
        return saleDetail(tx, id);
      });
    },
    async get(actor: Actor | null, id: string) {
      salesAccess(actor);
      parse(uuid, id);
      return db.transaction((tx) => saleDetail(tx, id), {
        isolationLevel: "repeatable read",
        accessMode: "read only",
      });
    },
    async list(actor: Actor | null, raw: unknown = {}): Promise<SaleList> {
      salesAccess(actor);
      const input = parse(listSchema, raw);
      return db.transaction(
        async (tx) => {
          const filters = and(
            input.origin ? eq(sales.origin, input.origin) : undefined,
            input.status ? eq(sales.status, input.status) : undefined,
            input.date ? eq(sales.businessDate, input.date) : undefined,
            input.q
              ? or(
                  ilike(sales.customerName, term(input.q)),
                  ilike(sales.externalId, term(input.q)),
                  sql`${sales.number}::text = ${input.q.replace(/^#/, "")}`,
                )
              : undefined,
          );
          const [{ total }] = await tx
            .select({ total: count() })
            .from(sales)
            .where(filters);
          const rows = await tx
            .select()
            .from(sales)
            .where(filters)
            .orderBy(desc(sales.createdAt), desc(sales.number))
            .limit(30)
            .offset(input.offset);
          return {
            rows: await summaries(tx, rows),
            total,
            offset: input.offset,
          };
        },
        { isolationLevel: "repeatable read", accessMode: "read only" },
      );
    },
    async lookup(
      actor: Actor | null,
      kind: string,
      q = "",
      channel = "counter",
    ): Promise<SaleLookup> {
      salesAccess(actor);
      parse(z.enum(["products", "customers", "payment-methods"]), kind);
      parse(z.string().max(160), q);
      parse(channelSchema, channel);
      return db.transaction(
        async (tx) => {
          if (kind === "products") {
            const filter = and(
              isNull(products.archivedAt),
              or(
                ilike(products.name, term(q)),
                sql`${products.id}::text = ${q}`,
              ),
            );
            const [{ total }] = await tx
              .select({ total: count() })
              .from(products)
              .where(filter);
            const rows = await tx
              .select({
                id: products.id,
                name: products.name,
                price: productPrices.amount,
              })
              .from(products)
              .leftJoin(
                productPrices,
                and(
                  eq(productPrices.productId, products.id),
                  eq(productPrices.channel, channel),
                ),
              )
              .where(filter)
              .orderBy(asc(products.name), asc(products.id))
              .limit(30);
            return { rows, total };
          }
          const table = kind === "customers" ? customers : paymentMethods;
          const filter = and(
            isNull(table.archivedAt),
            ilike(table.name, term(q)),
          );
          const [{ total }] = await tx
            .select({ total: count() })
            .from(table)
            .where(filter);
          const rows = await tx
            .select({ id: table.id, name: table.name })
            .from(table)
            .where(filter)
            .orderBy(asc(table.name), asc(table.id))
            .limit(30);
          return { rows, total };
        },
        { isolationLevel: "repeatable read", accessMode: "read only" },
      );
    },
  };
}
