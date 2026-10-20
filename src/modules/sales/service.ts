import { loadCombo } from "../combos/service";
import { lookupProducts } from "./product-lookup";
import { canSellProduct } from "../products/availability";
import { requireOperationalContext } from "../branches/context";
import { resolveFulfillment } from "../products/fulfillment";
import {
  productFulfillments,
  productFulfillmentVersions,
} from "@/db/product-fulfillment-schema";
import { branchProducts } from "@/db/branch-schema";
import { reserveOrder } from "./reservation";
import { cancelStock } from "../fulfillment/cancellation";
import { businessDate as branchBusinessDate } from "../operations/business-date";
import { loadConfiguration } from "@/modules/recipes/configuration";
import { resolveComposition } from "@/modules/recipes/composition";
import { saleLineComponents, saleLineModifiers } from "@/db/modifier-schema";
import { items } from "@/db/business-schema";
import type { ResolvedComposition } from "@/modules/modifiers/types";
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
import { saleDetail, summaries } from "./queries";
import {
  publishOrder,
  cancelSaleTasks,
} from "@/modules/preparation/publication";
import type { SaleChannel, SaleList, SaleLookup } from "./types";

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
  actor: Actor,
  channel: SaleChannel,
  lines: LineInput[],
  included = false,
) {
  const ctx = await requireOperationalContext(tx, actor, actor.branchId ?? "");
  await tx.insert(recipeGraphLock).values({ id: 1 }).onConflictDoNothing();
  await tx
    .select()
    .from(recipeGraphLock)
    .where(eq(recipeGraphLock.id, 1))
    .for("update");
  const catalog = new Map<
    string,
    {
      name: string;
      price: string | null;
      recipeVersionId: string | null;
      vatRate: string | null;
      pricingRevision: number;
    }
  >();
  for (const id of [...new Set(lines.map((l) => l.productId))].sort()) {
    // Catalog updates also lock product before editing prices. SHARE prevents stale acceptance.
    const [product] = await tx
      .select()
      .from(products)
      .where(eq(products.id, id))
      .for("share");
    if (!product || product.archivedAt || product.kind !== "individual")
      invalid("Elegí productos individuales activos.");
    const [local] = await tx
      .select()
      .from(branchProducts)
      .where(
        and(
          eq(branchProducts.productId, id),
          eq(branchProducts.branchId, ctx.branchId),
        ),
      )
      .for("share");
    if (!canSellProduct(product, local, channel))
      invalid(
        "El producto está agotado o no está disponible en este canal y sucursal.",
      );
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
      .select({ recipeVersionId: productFulfillmentVersions.recipeVersionId })
      .from(productFulfillments)
      .innerJoin(
        productFulfillmentVersions,
        eq(productFulfillmentVersions.id, productFulfillments.versionId),
      )
      .where(eq(productFulfillments.productId, id));
    catalog.set(id, {
      name: product.name,
      price: price?.amount ?? null,
      recipeVersionId: version?.recipeVersionId ?? null,
      vatRate: product.vatRate,
      pricingRevision: product.revision,
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
    const physical = await resolveFulfillment(tx, ctx, {
      productId: line.productId,
      quantity: "1.000000",
      expectedVersionId: line.expectedFulfillmentVersionId,
      selections: line.modifiers,
    });
    let composition: ResolvedComposition = {
      components: [],
      modifiers: [],
      surcharge: "0.00",
    };
    if (product.recipeVersionId) {
      const config = await loadConfiguration(tx, product.recipeVersionId);
      if (
        (config.model === "configurable" ||
          line.expectedRecipeVersionId !== undefined) &&
        line.expectedRecipeVersionId !== product.recipeVersionId
      )
        conflict("Cambió la receta. Revisá las opciones.");
      composition = resolveComposition(config, line.modifiers, channel);
      for (const c of [...composition.components].sort((a, b) =>
        a.itemId.localeCompare(b.itemId),
      )) {
        const [i] = await tx
          .select()
          .from(items)
          .where(eq(items.id, c.itemId))
          .for("share");
        if (!i || i.archivedAt || i.baseUnit !== c.baseUnit)
          conflict("Un insumo cambió. Revisá el pedido.");
      }
    } else if (line.modifiers.length || line.expectedRecipeVersionId)
      conflict("El producto no tiene esa receta.");
    if (physical.version.mode === "direct") {
      for (const component of physical.components) {
        const [item] = await tx
          .select()
          .from(items)
          .where(eq(items.id, component.itemId));
        composition.components.push({
          ...component,
          name: item.name,
          baseUnit: item.baseUnit,
          archived: false,
        });
      }
    }
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
  return { values, snapshots, totalAmount: moneyBound(total) };
}
async function prepareLines(
  tx: Tx,
  actor: Actor,
  channel: SaleChannel,
  lines: LineInput[],
) {
  if (!lines.some((l) => l.expectedComboVersionId || l.comboChoices))
    return prepareIndividualLines(tx, actor, channel, lines);
  const ctx = await requireOperationalContext(tx, actor, actor.branchId ?? "");
  await tx.insert(recipeGraphLock).values({ id: 1 }).onConflictDoNothing();
  await tx
    .select()
    .from(recipeGraphLock)
    .where(eq(recipeGraphLock.id, 1))
    .for("update");
  const values: Omit<typeof saleLines.$inferInsert, "orderId" | "branchId">[] =
    [];
  const snapshots: ResolvedComposition[] = [];
  let total = 0n;
  for (const line of lines) {
    if (!line.expectedComboVersionId) {
      const individual = await prepareIndividualLines(tx, actor, channel, [
        line,
      ]);
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
        actor,
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
  return { values, snapshots, totalAmount: moneyBound(total) };
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
) {
  const id = randomUUID();
  const ctx = await requireOperationalContext(tx, actor, actor.branchId ?? "");
  await tx.insert(saleOrders).values({
    id,
    saleId,
    branchId: ctx.branchId,
    sequence,
    totalAmount: prepared.totalAmount,
    notes: notes || null,
    actorId: actor.id,
  });
  for (const [position, value] of prepared.values.entries()) {
    const [line] = await tx
      .insert(saleLines)
      .values({ ...value, orderId: id, branchId: ctx.branchId })
      .returning();
    const snapshot = prepared.snapshots[position];
    for (const c of snapshot.components)
      await tx.insert(saleLineComponents).values({
        saleLineId: line.id,
        itemId: c.itemId,
        name: c.name,
        baseUnit: c.baseUnit,
        quantity: c.quantity,
      });
    for (const m of snapshot.modifiers)
      await tx.insert(saleLineModifiers).values({
        ...m,
        saleLineId: line.id,
        recipeVersionId: line.recipeVersionId!,
      });
  }
  await reserveOrder(tx, ctx, id, operationId);
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
      const ctx = await requireOperationalContext(
        db,
        actor,
        actor.branchId ?? "",
      );
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
          if (old) return replaySaleDetail(tx, old, ctx.branchId);
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
            branchId: ctx.branchId,
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
            businessDate: branchBusinessDate(now, ctx.timeZone),
            actorId: actor.id,
            closedAt: closed ? now : null,
          });
          await insertOrder(
            tx,
            actor,
            id,
            1,
            lines,
            input.notes,
            input.requestId,
          );
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
      const ctx = await requireOperationalContext(
        db,
        actor,
        actor.branchId ?? "",
      );
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
        if (old) return replaySaleDetail(tx, old, ctx.branchId);
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
      const ctx = await requireOperationalContext(db, a, a.branchId ?? "");
      if (ctx.role === "staff")
        invalid("Se requiere un encargado.", "FORBIDDEN", 403);
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
        if (old) return replaySaleDetail(tx, old, ctx.branchId);
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
            ilike(table.name, term(q)),
          );
          const [{ total }] = await tx
            .select({ total: count() })
            .from(table)
            .where(filter);
          const rows = await tx
            .select({
              id: table.id,
              name: table.name,
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
