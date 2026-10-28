import { loadCombo } from "../combos/service";
import { resolveSaleCustomer } from "./customer";
import { assignLocator } from "../pickup/service";
import { lookupProducts } from "./product-lookup";
import { canSellProduct } from "../products/availability";
import { requireOperationalContext } from "../branches/context";
import { resolveFulfillmentComposition } from "../products/fulfillment";
import {
  productFulfillments,
  productFulfillmentVersions,
} from "@/db/product-fulfillment-schema";
import { branchProducts } from "@/db/branch-schema";
import { reserveOrder } from "./reservation";
import { cancelStock } from "../fulfillment/cancellation";
import { businessDate as branchBusinessDate } from "../operations/business-date";
import { saleLineComponents, saleLineModifiers } from "@/db/modifier-schema";
import type { ResolvedComposition } from "@/modules/modifiers/types";
import { randomUUID } from "node:crypto";
import {
  and,
  asc,
  count,
  desc,
  eq,
  ilike,
  inArray,
  isNull,
  or,
  sql,
} from "drizzle-orm";
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
import { recipeGraphLock } from "@/db/recipe-schema";
import {
  audit,
  claim,
  conflict,
  fingerprint,
  invalid,
  notFound,
  type Tx,
} from "@/modules/inventory/service";
import { cents, integer } from "@/modules/inventory/decimal";
import {
  catalogFinalPrice,
  vatBreakdown,
  paymentFee,
} from "@/modules/pricing/amounts";
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
import { saleDetail, saleDetailFromRows, summaries } from "./queries";
import {
  publishOrder,
  cancelSaleTasks,
} from "@/modules/preparation/publication";
import type { SaleChannel, SaleList, SaleLookup } from "./types";
import type { OperationalContext } from "../operations/types";
import { lockCashSession, recordCashMovement } from "../cash/integration";

async function recordSalePayments(
  tx: Tx,
  ctx: OperationalContext,
  payments: (typeof salePayments.$inferSelect)[],
  saleNumber: number,
) {
  for (const payment of payments) {
    if (payment.collector !== "local") continue;
    const refund = payment.kind === "refund";
    await recordCashMovement(tx, ctx, {
      kind: refund ? "refund" : "collection",
      amount: cents(integer(payment.amount) * (refund ? -1n : 1n)),
      sourceType: "sale-payment",
      sourceId: payment.id,
      methodKind: payment.methodKind ?? "other",
      methodName: payment.methodName ?? "Otro medio",
      concept: `${refund ? "Devolución" : "Cobro"} de venta #${saleNumber}`,
      reference: payment.reference,
      occurredAt: payment.createdAt,
    });
  }
}

async function replaySaleDetail(tx: Tx, id: string, branchId: string) {
  // Every mutation locks this header. Keep it stable across the detail queries.
  const [sale] = await tx
    .select({ id: sales.id })
    .from(sales)
    .where(and(eq(sales.id, id), eq(sales.branchId, branchId)))
    .for("share");
  if (!sale) notFound();
  return saleDetail(tx, id);
}
async function lockSale(
  tx: Tx,
  id: string,
  revision: number,
  branchId: string,
) {
  const [row] = await tx
    .select()
    .from(sales)
    .where(and(eq(sales.id, id), eq(sales.branchId, branchId)))
    .for("update");
  if (!row) notFound();
  if (row.revision !== revision)
    conflict("La cuenta cambió. Actualizala antes de continuar.");
  if (row.status === "cancelled") conflict("Esta venta está anulada.");
  return row;
}
async function prepareIndividualLines(
  tx: Tx,
  ctx: OperationalContext,
  channel: SaleChannel,
  lines: LineInput[],
  included = false,
) {
  const catalog = new Map<
    string,
    {
      name: string;
      price: string | null;
      recipeVersionId: string | null;
      vatRate: string | null;
      pricingRevision: number;
      fulfillment: typeof productFulfillmentVersions.$inferSelect | null;
    }
  >();
  const productIds = [...new Set(lines.map((l) => l.productId))].sort();
  // Take catalog locks in a separate statement: a joined SELECT can retain
  // pre-update prices/fulfillment from its snapshot after waiting on a lock.
  await tx
    .select({ id: products.id })
    .from(products)
    .where(inArray(products.id, productIds))
    .orderBy(asc(products.id))
    .for("share");
  const catalogRows = await tx
    .select({
      product: products,
      local: branchProducts,
      price: productPrices.amount,
      fulfillment: productFulfillmentVersions,
    })
    .from(products)
    .innerJoin(
      branchProducts,
      and(
        eq(branchProducts.productId, products.id),
        eq(branchProducts.branchId, ctx.branchId),
      ),
    )
    .leftJoin(
      productPrices,
      and(
        eq(productPrices.productId, products.id),
        eq(productPrices.channel, channel),
      ),
    )
    .leftJoin(
      productFulfillments,
      eq(productFulfillments.productId, products.id),
    )
    .leftJoin(
      productFulfillmentVersions,
      eq(productFulfillmentVersions.id, productFulfillments.versionId),
    )
    .where(inArray(products.id, productIds))
    .orderBy(asc(products.id))
    .for("share", { of: branchProducts });
  for (const id of productIds) {
    // Catalog updates also lock product before editing prices. SHARE prevents stale acceptance.
    const row = catalogRows.find((r) => r.product.id === id);
    const product = row?.product;
    if (!product || product.archivedAt || product.kind !== "individual")
      return invalid("Elegí productos individuales activos.");
    const local = row!.local;
    if (!canSellProduct(product, local, channel))
      invalid(
        "El producto está agotado o no está disponible en este canal y sucursal.",
      );
    catalog.set(id, {
      name: product.name,
      price: row!.price,
      recipeVersionId: row!.fulfillment?.recipeVersionId ?? null,
      vatRate: product.vatRate,
      pricingRevision: product.revision,
      fulfillment: row!.fulfillment,
    });
  }
  let total = 0n;
  const snapshots: ResolvedComposition[] = [];
  const values = [];
  for (const [position, line] of lines.entries()) {
    const product = catalog.get(line.productId)!;
    if (!included && product.vatRate === null)
      invalid(`Configurá el IVA de ${product.name} antes de venderlo.`);
    if (
      !included &&
      line.expectedPricingRevision !== undefined &&
      line.expectedPricingRevision !== product.pricingRevision
    )
      conflict(
        `Cambió el precio o IVA de ${product.name}. Actualizá la carta.`,
      );
    if (
      !line.expectedFulfillmentVersionId ||
      line.comboChoices ||
      line.expectedComboVersionId
    )
      return invalid("Configuración individual inválida.");
    const physical = await resolveFulfillmentComposition(
      tx,
      product.fulfillment,
      {
        productId: line.productId,
        quantity: "1.000000",
        expectedVersionId: line.expectedFulfillmentVersionId,
        selections: line.modifiers,
        channel,
      },
    );
    const composition = physical.composition;
    if (product.recipeVersionId) {
      if (line.expectedRecipeVersionId !== product.recipeVersionId)
        conflict("Cambió la receta. Revisá las opciones.");
    } else if (line.modifiers.length || line.expectedRecipeVersionId)
      conflict("El producto no tiene esa receta.");
    snapshots.push(composition);
    const configuredPrice =
      product.price === null
        ? null
        : catalogFinalPrice(
            moneyBound(integer(product.price) + integer(composition.surcharge)),
            product.vatRate,
          );
    if (!included && configuredPrice !== line.expectedPrice)
      conflict(
        `Cambió el precio de ${product.name}. Actualizá la carta y revisá el pedido.`,
      );
    if (!included && line.price !== configuredPrice) {
      if (!line.priceReason)
        invalid(`Indicá el motivo del precio aplicado a ${product.name}.`);
      if (channel === "counter" && ctx.role === "staff")
        invalid(
          "Un encargado debe autorizar cambios de precio en el local.",
          "FORBIDDEN",
          403,
        );
    }
    const lineTotal = integer(line.price) * BigInt(line.quantity);
    total += lineTotal;
    values.push({
      compositionStatus: "resolved",
      fulfillmentVersionId: line.expectedFulfillmentVersionId,
      position,
      productId: line.productId,
      name: product.name,
      quantity: line.quantity,
      listPrice: configuredPrice,
      unitPrice: line.price,
      lineTotal: moneyBound(lineTotal),
      ...(!included && product.vatRate !== null
        ? {
            vatRate: product.vatRate,
            ...vatBreakdown(
              line.price === "0.00" ? "0.00" : moneyBound(lineTotal),
              product.vatRate,
            ),
          }
        : { vatRate: null, netTotal: null, vatTotal: null }),
      priceReason: line.priceReason || null,
      notes: line.notes || null,
      recipeVersionId: product.recipeVersionId,
    });
  }
  return { values, snapshots, totalAmount: moneyBound(total), ctx };
}
async function prepareLines(
  tx: Tx,
  actor: Actor,
  channel: SaleChannel,
  lines: LineInput[],
) {
  const ctx = await requireOperationalContext(tx, actor, actor.branchId ?? "");
  await tx.insert(recipeGraphLock).values({ id: 1 }).onConflictDoNothing();
  await tx
    .select()
    .from(recipeGraphLock)
    .where(eq(recipeGraphLock.id, 1))
    .for("update");
  if (!lines.some((l) => l.expectedComboVersionId || l.comboChoices))
    return prepareIndividualLines(tx, ctx, channel, lines);
  const values: Omit<typeof saleLines.$inferInsert, "orderId" | "branchId">[] =
    [];
  const snapshots: ResolvedComposition[] = [];
  let total = 0n;
  for (const line of lines) {
    if (!line.expectedComboVersionId) {
      const individual = await prepareIndividualLines(tx, ctx, channel, [line]);
      values.push({ ...individual.values[0], position: values.length });
      snapshots.push(individual.snapshots[0]);
      total += integer(individual.totalAmount);
      continue;
    }
    if (
      line.expectedFulfillmentVersionId ||
      line.expectedRecipeVersionId ||
      line.modifiers.length
    )
      invalid("Los modificadores del combo se eligen en sus productos.");
    const [p] = await tx
      .select()
      .from(products)
      .where(eq(products.id, line.productId))
      .for("share");
    const [local] = await tx
      .select()
      .from(branchProducts)
      .where(
        and(
          eq(branchProducts.productId, line.productId),
          eq(branchProducts.branchId, ctx.branchId),
        ),
      )
      .for("share");
    if (!p || p.kind !== "combo" || !canSellProduct(p, local, channel))
      invalid("El combo no está disponible en esta sucursal y canal.");
    const comboVatRate =
      p.vatRate ?? invalid("Configurá el IVA del combo antes de venderlo.");
    if (
      line.expectedPricingRevision !== undefined &&
      line.expectedPricingRevision !== p.revision
    )
      conflict("Cambió el precio o IVA del combo. Actualizá la carta.");
    const definition = await loadCombo(tx, p.id);
    if (!definition || definition.id !== line.expectedComboVersionId)
      return conflict("Cambió el combo. Revisá las elecciones.");
    const choices = line.comboChoices ?? [];
    if (
      choices.length !== definition.groups.length ||
      new Set(choices.map((c) => c.groupId)).size !== choices.length
    )
      invalid("Elegí un producto en cada grupo del combo.");
    const [price] = await tx
      .select()
      .from(productPrices)
      .where(
        and(
          eq(productPrices.productId, p.id),
          eq(productPrices.channel, channel),
        ),
      );
    if (!price) invalid("El combo no tiene precio en este canal.");
    const parentId = randomUUID(),
      parentPosition = values.length;
    values.push({
      id: parentId,
      position: parentPosition,
      productId: p.id,
      name: p.name,
      quantity: line.quantity,
      unitPrice: line.price,
      lineTotal: "0",
      lineKind: "combo",
      comboVersionId: definition.id,
      compositionStatus: "resolved",
      notes: line.notes || null,
    });
    snapshots.push({ components: [], modifiers: [], surcharge: "0.00" });
    let unitPrice = integer(price.amount);
    for (const group of definition.groups) {
      const choice = choices.find((c) => c.groupId === group.id);
      const option = group.options.find((o) => o.id === choice?.optionId);
      if (!choice || !option || option.archived)
        return invalid("Elegí una opción vigente del combo.");
      const quantity = line.quantity * group.quantity;
      if (quantity > 999 || values.length >= 500)
        invalid("El pedido supera la cantidad máxima de componentes.");
      const child = await prepareIndividualLines(
        tx,
        ctx,
        channel,
        [
          {
            productId: option.productId,
            quantity,
            price: "0.00",
            expectedPrice: null,
            priceReason: "",
            notes: line.notes,
            expectedFulfillmentVersionId: choice.expectedFulfillmentVersionId,
            expectedRecipeVersionId: choice.expectedRecipeVersionId,
            modifiers: choice.modifiers,
          },
        ],
        true,
      );
      unitPrice +=
        (integer(option[channel]) + integer(child.snapshots[0].surcharge)) *
        BigInt(group.quantity);
      values.push({
        ...child.values[0],
        notes: [`Combo: ${p.name} · ${group.name}`, line.notes]
          .filter(Boolean)
          .join(" — "),
        listPrice: null,
        position: values.length,
        lineKind: "combo_component",
        comboVersionId: definition.id,
        parentLineId: parentId,
        comboGroupId: group.id,
        comboOptionId: option.id,
      });
      snapshots.push(child.snapshots[0]);
    }
    const configured = catalogFinalPrice(moneyBound(unitPrice), comboVatRate)!;
    if (configured !== line.expectedPrice)
      conflict(
        "Cambió el precio del combo o sus adicionales. Revisá el pedido.",
      );
    if (line.price !== configured) {
      if (!line.priceReason)
        invalid("Indicá el motivo del precio aplicado al combo.");
      if (channel === "counter" && ctx.role === "staff")
        invalid(
          "Un encargado debe autorizar cambios de precio.",
          "FORBIDDEN",
          403,
        );
    }
    const lineTotal = moneyBound(integer(line.price) * BigInt(line.quantity));
    Object.assign(values[parentPosition], {
      listPrice: configured,
      lineTotal,
      priceReason: line.priceReason || null,
      vatRate: comboVatRate,
      ...vatBreakdown(lineTotal, comboVatRate),
    });
    total += integer(lineTotal);
  }
  if (values.filter((v) => v.lineKind !== "combo").length > 500)
    invalid("Demasiados componentes en el pedido.");
  return { values, snapshots, totalAmount: moneyBound(total), ctx };
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
    if (
      p.collector === "local" &&
      method?.kind === "card" &&
      !p.reference.trim()
    )
      invalid("Ingresá el número de comprobante del cobro con tarjeta.");
    total += integer(p.amount);
    return {
      kind: "collection",
      collector: p.collector,
      methodId: method?.id ?? null,
      methodName: method?.name ?? null,
      methodKind: method?.kind ?? null,
      amount: p.amount,
      commissionPercent: method?.commissionPercent ?? null,
      ...paymentFee(p.amount, method?.commissionPercent ?? null),
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
  operationId: string,
  locatorNumber?: number | null,
  locatorMode?: "automatic" | "manual",
) {
  const id = randomUUID();
  const ctx = prepared.ctx;
  const [order] = await tx
    .insert(saleOrders)
    .values({
      id,
      saleId,
      branchId: ctx.branchId,
      sequence,
      totalAmount: prepared.totalAmount,
      notes: notes || null,
      actorId: actor.id,
    })
    .returning();
  const lines = prepared.values.map((value) => ({
    ...value,
    id: ("id" in value ? value.id : undefined) ?? randomUUID(),
    orderId: id,
    branchId: ctx.branchId,
  }));
  const insertedLines = await tx.insert(saleLines).values(lines).returning();
  const components: (typeof saleLineComponents.$inferInsert)[] = [];
  const modifiers: (typeof saleLineModifiers.$inferInsert)[] = [];
  for (const [position, line] of lines.entries()) {
    const snapshot = prepared.snapshots[position];
    for (const c of snapshot.components)
      components.push({
        saleLineId: line.id,
        itemId: c.itemId,
        name: c.name,
        baseUnit: c.baseUnit,
        quantity: c.quantity,
      });
    for (const m of snapshot.modifiers)
      modifiers.push({
        ...m,
        saleLineId: line.id,
        recipeVersionId: line.recipeVersionId!,
      });
  }
  if (components.length) await tx.insert(saleLineComponents).values(components);
  const insertedModifiers = modifiers.length
    ? await tx.insert(saleLineModifiers).values(modifiers).returning()
    : [];
  await reserveOrder(tx, ctx, id, operationId);
  const assignedLocator = await assignLocator(
    tx,
    actor,
    id,
    locatorNumber,
    true,
    locatorMode === "automatic",
  );
  await publishOrder(tx, actor, id);
  return {
    order,
    lines: insertedLines,
    modifiers: insertedModifiers,
    locators:
      assignedLocator == null ? [] : [{ orderId: id, number: assignedLocator }],
  };
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
      await requireOperationalContext(db, actor, actor.branchId ?? "");
      const input = parse(createSchema, raw),
        id = randomUUID();
      return salesTransaction(() =>
        db.transaction(async (tx) => {
          const ctx = await requireOperationalContext(
            tx,
            actor,
            actor.branchId ?? "",
          );
          const old = await claim(
            tx,
            actor,
            "sale-create",
            input.requestId,
            fingerprint("sale-create", input),
            id,
          );
          if (old) return replaySaleDetail(tx, old, ctx.branchId);
          if (input.payments.some((payment) => payment.collector === "local"))
            await lockCashSession(tx, ctx);
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
          if (table && table.branchId !== ctx.branchId) notFound();
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
          const customer = await resolveSaleCustomer(tx, actor, input);
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
          const [sale] = await tx
            .insert(sales)
            .values({
              id,
              branchId: ctx.branchId,
              origin: input.origin,
              channel: input.channel,
              fulfillment: input.fulfillment,
              status: closed ? "closed" : "open",
              tableId: table?.id ?? null,
              tableName: table?.name ?? null,
              customerId: customer.id,
              customerName: customer.name,
              externalId: input.externalId?.toUpperCase() ?? null,
              notes: input.notes || null,
              totalAmount: lines.totalAmount,
              paidAmount: payments.totalAmount,
              businessDate: branchBusinessDate(now, ctx.timeZone),
              actorId: actor.id,
              closedAt: closed ? now : null,
            })
            .returning();
          const order = await insertOrder(
            tx,
            actor,
            id,
            1,
            lines,
            input.notes,
            input.requestId,
            input.locatorNumber,
            input.locatorMode,
          );
          const insertedPayments = payments.values.length
            ? await tx
                .insert(salePayments)
                .values(
                  payments.values.map((p) => ({
                    ...p,
                    saleId: id,
                    actorId: actor.id,
                  })),
                )
                .returning()
            : [];
          await recordSalePayments(tx, ctx, insertedPayments, sale.number);
          await audit(tx, actor, "sales", id, "create", input);
          return saleDetailFromRows(
            sale,
            [order.order],
            order.lines,
            order.modifiers,
            insertedPayments,
            order.locators,
          );
        }),
      );
    },
    async addOrder(actor: Actor | null, id: string, raw: unknown) {
      salesAccess(actor);
      const ctx = await requireOperationalContext(
        db,
        actor,
        actor.branchId ?? "",
      );
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
        if (old) return replaySaleDetail(tx, old, ctx.branchId);
        const sale = await lockSale(tx, id, input.revision, ctx.branchId);
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
        await insertOrder(
          tx,
          actor,
          id,
          orderCount + 1,
          lines,
          input.notes,
          input.requestId,
          input.locatorNumber,
          input.locatorMode,
        );
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
      await requireOperationalContext(db, actor, actor.branchId ?? "");
      parse(uuid, id);
      const input = parse(paySchema, raw);
      return db.transaction(async (tx) => {
        const ctx = await requireOperationalContext(
          tx,
          actor,
          actor.branchId ?? "",
        );
        const old = await claim(
          tx,
          actor,
          "sale-pay",
          input.requestId,
          fingerprint("sale-pay", { id, ...input }),
          id,
        );
        if (old) return replaySaleDetail(tx, old, ctx.branchId);
        if (input.payments.some((payment) => payment.collector === "local"))
          await lockCashSession(tx, ctx);
        const sale = await lockSale(tx, id, input.revision, ctx.branchId);
        if (sale.status !== "open") conflict("La cuenta ya está cobrada.");
        const payments = await preparePayments(
          tx,
          sale.channel,
          input.payments,
        );
        const paid = integer(sale.paidAmount) + integer(payments.totalAmount),
          total = integer(sale.totalAmount);
        if (paid > total) invalid("El cobro supera el saldo pendiente.");
        const insertedPayments = await tx
          .insert(salePayments)
          .values(
            payments.values.map((p) => ({
              ...p,
              saleId: id,
              actorId: actor.id,
            })),
          )
          .returning();
        await recordSalePayments(tx, ctx, insertedPayments, sale.number);
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
      const ctx = await requireOperationalContext(db, a, a.branchId ?? "");
      if (ctx.role === "staff")
        invalid("Se requiere un encargado.", "FORBIDDEN", 403);
      parse(uuid, id);
      const input = parse(cancelSchema, raw);
      return db.transaction(async (tx) => {
        const ctx = await requireOperationalContext(tx, a, a.branchId ?? "");
        if (ctx.role === "staff")
          invalid("Se requiere un encargado.", "FORBIDDEN", 403);
        const old = await claim(
          tx,
          a,
          "sale-cancel",
          input.requestId,
          fingerprint("sale-cancel", { id, ...input }),
          id,
        );
        if (old) return replaySaleDetail(tx, old, ctx.branchId);
        // Serialize even before reading payments: a concurrent collection can
        // otherwise add a local refund obligation while this sale is locked.
        await lockCashSession(tx, ctx, { requireOpen: false });
        const sale = await lockSale(tx, id, input.revision, ctx.branchId);
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
        if (payments.length) {
          const refunds = await tx
            .insert(salePayments)
            .values(
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
            )
            .returning();
          await recordSalePayments(tx, ctx, refunds, sale.number);
        }
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
        await cancelStock(tx, ctx, id, input.requestId);
        await cancelSaleTasks(tx, a, id, input.reason);
        return saleDetail(tx, id);
      });
    },
    async get(actor: Actor | null, id: string) {
      salesAccess(actor);
      const ctx = await requireOperationalContext(
        db,
        actor,
        actor.branchId ?? "",
      );
      parse(uuid, id);
      return db.transaction(
        async (tx) => {
          const [sale] = await tx
            .select({ id: sales.id })
            .from(sales)
            .where(and(eq(sales.id, id), eq(sales.branchId, ctx.branchId)));
          if (!sale) notFound();
          return saleDetail(tx, id);
        },
        {
          isolationLevel: "repeatable read",
          accessMode: "read only",
        },
      );
    },
    async list(actor: Actor | null, raw: unknown = {}): Promise<SaleList> {
      salesAccess(actor);
      const ctx = await requireOperationalContext(
        db,
        actor,
        actor.branchId ?? "",
      );
      const input = parse(listSchema, raw);
      return db.transaction(
        async (tx) => {
          const filters = and(
            eq(sales.branchId, ctx.branchId),
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
      category = "",
      offset = 0,
    ): Promise<SaleLookup> {
      salesAccess(actor);
      const ctx = await requireOperationalContext(
        db,
        actor,
        actor.branchId ?? "",
      );
      parse(z.enum(["products", "customers", "payment-methods"]), kind);
      parse(z.string().max(160), q);
      parse(channelSchema, channel);
      return db.transaction(
        async (tx) => {
          if (kind === "products")
            return lookupProducts(
              tx,
              ctx.branchId,
              q,
              channel,
              category,
              offset,
            );
          const table = kind === "customers" ? customers : paymentMethods;
          const filter = and(
            isNull(table.archivedAt),
            kind === "customers"
              ? or(
                  ilike(customers.name, term(q)),
                  ilike(customers.email, term(q)),
                )
              : ilike(table.name, term(q)),
          );
          const [{ total }] = await tx
            .select({ total: count() })
            .from(table)
            .where(filter);
          const rows = await tx
            .select({
              id: table.id,
              name: table.name,
              ...(kind === "customers" ? { email: customers.email } : {}),
              kind:
                kind === "payment-methods"
                  ? paymentMethods.kind
                  : sql<string>`'customer'`,
            })
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
