# P3 — Suministro de productos y reservas de venta — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Confirmar ventas directas o con receta, con composición histórica y reservas locales.
**Architecture:** Versión de suministro comercial por producto; confirmación coordina ventas/reservas/publicación en una sola transacción.
**Tech Stack:** Versiones del plan principal; servicios actuales de sales, recipes y modifiers.
**Spec:** `docs/superpowers/specs/2026-09-28-data-model-design.md`, secciones 3 y 6.

## Global Constraints

Heredar plan principal. Requiere P1/P2. No migraciones ni pruebas que las apliquen. Preservar legacy/configurable y datos históricos.

## Review Focus

Último saldo concurrente → T2; catálogo cambia tras confirmar → T1/T2; botella y pack no crean dos inventarios → T1. Precio ausente no hereda otro canal.

## T1. Versión comercial y composición

**Files:** crear `src/db/product-fulfillment-schema.ts`, `src/modules/products/{fulfillment,validation,types}.ts`; modificar `src/db/{business,recipe,modifier,sales}-schema.ts`, `src/modules/recipes/{service,configuration,composition,conversion}.ts`, `src/modules/modifiers/{service,types}.ts`.
**Test:** `tests/fulfillment.unit.test.ts`, `tests/fulfillment.integration.test.ts`, adaptar `tests/composition.test.ts`.
**Interfaces:** `Fulfillment = {id: string; productId: string; version: number} & ({mode:'direct'; itemId:string; quantity:Decimal}|{mode:'recipe'; recipeVersionId:string})`; `publishFulfillment(tx: Tx, ctx: OperationalContext, productId: string, raw: unknown): Promise<Fulfillment>`; `resolveFulfillment(tx: Tx, ctx: OperationalContext, input: {productId:string; quantity:Decimal; expectedVersionId:string; selections:Selection[]}): Promise<{version:Fulfillment; components:{itemId:string; quantity:Decimal}[]}>`. Selection se conserva desde modifiers/types.ts.

- [ ] Escribir `direct_pack_uses_same_item`: individual consume 1 botella, pack de seis consume 6 del mismo UUID; cantidad vendida 2 consume 12. Validación rechaza direct sin item o con recipeVersionId; recipe debe apuntar a versión del mismo producto.
- [ ] Ejecutar `node node_modules/vitest/vitest.mjs run tests/fulfillment.unit.test.ts tests/composition.test.ts`; confirmar fallo específico nuevo sin degradar regresiones.
- [ ] Implementar schema con CHECK de modo y FK de pertenencia; número de versión único por producto y versión vigente explícita. Publicar receta+versión comercial de forma atómica; no cambiar recetas históricas. `branch_products` controla habilitación y resolución requiere producto permitido en la sucursal.
- [ ] Resolver artículos de recetas y modificadores usando unidades canónicas, exactitud y modelo actual. Validar que recetas de elaboración no formen ciclos con opciones. Para legacy ambiguo, exigir conversión/configuración antes de inventario activo; nunca escoger la primera opción arbitrariamente.
- [ ] Escribir integración: edición del producto/grupo no altera versión registrada; no se publica modo cuyo item está archivado/no elegible; producto deshabilitado en B no se vende allí aunque exista en A; costo null no impide precio explícito. Confirmar que resolver un preparado refiere su item, no vuelve a expandir ingredientes ya producidos.
- [ ] Repetir pruebas puras y TypeScript. Entregar a T2 versión y composición fijadas, sin ubicación hasta resolver estación/despacho por sucursal.

## T2. Confirmación atómica por sucursal

**Files:** modificar `src/modules/sales/{service,queries,tables,types,validation}.ts`, `src/modules/preparation/{publication,settings,queries}.ts`, `src/db/{sales,preparation}-schema.ts`; crear `src/modules/sales/stock.ts`.
**Test:** `tests/sale-reservations.integration.test.ts`, `tests/sale-reservations.concurrency.test.ts`, `tests/sale-stock.unit.test.ts`.
**Interfaces:** `reserveOrder(tx: Tx, ctx: OperationalContext, orderId: string, meta: CommandMeta): Promise<void>`; `publishOrder(tx: Tx, ctx: OperationalContext, orderId: string): Promise<void>` sustituye firma previa de publicación. `createSalesService(db)` recibe ctx validado en métodos operativos, preservando raw validado por Zod.

- [ ] Escribir `normalize_retry_selections`: ordenar selecciones equivalentes produce misma huella; cambio de cantidad o branch produce otra. `map_sale_demands`: preparado usa ubicación de estación; botella usa ubicación de despacho; ubicación ausente genera error, no fallback silencioso.
- [ ] Ejecutar `node node_modules/vitest/vitest.mjs run tests/sale-stock.unit.test.ts`; confirmar fallo.
- [ ] Portar confirmación/adición a cuenta: validar membresía/mesa, resolver versiones y precio canal, bloquear demanda completa, insertar orden/líneas, reservar y publicar sólo tareas que requieren cocina en una transacción. Reventa mantiene cumplimiento propio sin estación ficticia General.
- [ ] Guardar suministro, componentes y opciones por línea como snapshots con FK. Añadir cantidad pedida/terminada/entregada/cancelada y eventos por cantidades; los estados financieros no sustituyen cumplimiento. La nueva definición conserva límites actuales de importes, canales y cobros.
- [ ] Escribir prueba concurrente última existencia: dos pedidos desde conexiones independientes, uno confirma; otro falla sin órdenes, reservas, tareas ni cobros locales huérfanos. El arnés sólo usa base dedicada autorizada; no ejecutar aún.
- [ ] Escribir integración de venta mixta, modificación posterior de catálogo, reintento tras revocar membresía y filtros/listas por sucursal. Repetir pruebas puras y tipos; coordinar firma publishOrder con P4 sin duplicar lógica de inventario.
