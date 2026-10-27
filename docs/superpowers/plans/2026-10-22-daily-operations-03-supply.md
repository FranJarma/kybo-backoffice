# Etapa 3 — Compras pendientes y anticipación de abastecimiento

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans or superpowers:subagent-driven-development after approval. Steps use checkbox (`- [ ]`) syntax. No commit/push.

**Goal:** Sugerir compras a tiempo, considerar pedidos entrantes y priorizar los insumos de Bolivia con plazo7 + margen3.
**Architecture:** Nuevo documento de pedido a proveedor enlazado con recepción existente; motores puros de consumo y proyección diaria alimentan el tablero.
**Tech Stack:** Drizzle/PostgreSQL, BigInt, Zod, Vitest/PGlite y Playwright.
**Spec:** [Diseño](../specs/2026-10-22-daily-operations-design.md).

## Global Constraints
Aplican límites del [plan principal](2026-10-22-daily-operations.md#global-constraints). Depende de etapa1. No enviar mensajes a proveedores ni inventar compras confirmadas. Pedidos pendientes no son stock actual. Días corridos. Unidades canónicas con6 decimales; packs enteros.

## Review Focus
Recepción parcial repetida; pedido cancelado con recepción previa; llegada posterior al agotamiento; vencimientos antes de consumir; consumo duplicado por receta/producción. T1–T3 cubren estos casos.

### T1. Documento de compra y políticas

**Files:** crear `src/db/procurement-schema.ts`, `src/modules/procurement/{types,validation,orders,policies}.ts`, `tests/procurement-orders.integration.test.ts`; modificar schema/fixture/journal. Migración propuesta siguiente libre `0027_procurement_planning.sql`.

**Interfaces:** `PurchaseOrderState='draft'|'ordered'|'partially_received'|'received'|'cancelled'`; líneas con itemId/presentationId, snapshots de unidad/cantidad por pack, ordered/received/cancelledQuantity. `createPurchaseDraft(db,actor,input:{requestId;taskId?;supplierId;lines:{itemId;presentationId;packs:number}[]}): Promise<{id;revision}>`; `orderPurchase(db,actor,id,input:{requestId;expectedRevision;orderedOn;expectedOn}): Promise<{id;revision}>`; `revisePurchase` y `cancelPurchaseRemainder` requieren encargado, revisión y motivo.

- [ ] Tests: staff prepara solo borrador asignado; encargado confirma; no stock ni pagos creados al confirmar; mismo requestId no duplica; cantidad recibida+cancelada≤pedida; ETA faltante conserva estado «Sin fecha confirmada», no crea suministro elegible; cancelar remanente conserva recibido.
- [ ] Implementar política por sucursal/artículo: proveedor preferido, plazo, margen, cobertura objetivo, modo manual/histórico, tasa manual y `historyCoverageStartDate` confirmada por encargado. Mínimo objetivo > plazo+margen; para Bolivia defaults7/3 solamente al elegir explícitamente los artículos. Usar cotización válida seleccionada para presentación/minimumPacks, sin inferir proveedor por nombre.
- [ ] Ejecutar `pnpm test tests/procurement-orders.integration.test.ts`; comprobar autorizaciones y conservación.

### T2. Recepción enlazada y tareas de seguimiento

**Files:** crear `src/modules/procurement/receipts.ts`, `tests/procurement-receipts.integration.test.ts`; modificar `src/modules/inventory/service.ts`, `types.ts`, `validation.ts` y `src/components/inventory/purchases-manager.tsx` para referencia opcional a pedido/líneas. Registrar vínculo `purchase_order_receipt_allocations` único por receiptLine.

**Interfaces:** `receivePurchaseOrder(db,actor,id,input:{requestId;expectedRevision;receipt:ReceiveInput;allocations:{orderLineId;receiptPosition:number;quantity:string}[]}): Promise<ReceiptDetail>`. Extraer `receiveInTransaction(tx,ctx,operationId,input:ReceiveInput)` de servicio actual para compartir transacción; conservar API pública de compras sin pedido y su comportamiento.

- [ ] Tests: pedido100, recepción40→pendiente60; replay mantiene40; segunda recepción60→received; sobre-recepción409 sin stock parcial; dos recepciones competidoras no superan100; línea de otro proveedor/artículo/sucursal rechazada; recepción sin pedido funciona igual.
- [ ] Actualizar pedido, recepción, saldo y tarea de recepción en una transacción. Tarea «tramitar» finaliza al registrar ordered; nueva tarea vinculada «recibir» mantiene seguimiento hasta cerrar remanente. No deduplicar estas dos etapas como si fueran la misma acción.
- [ ] Ejecutar `pnpm test tests/procurement-receipts.integration.test.ts` y regresiones de recepción existentes identificadas al ejecutar. Añadir caso de orden cancelada parcialmente y otra modificada entre abrir y confirmar.

### T3. Consumo, cobertura y sugerencias

**Files:** crear `src/modules/procurement/{consumption,projection,queries,suggestions}.ts`, `tests/procurement-consumption.test.ts`, `tests/procurement-projection.test.ts`, `tests/procurement-suggestions.integration.test.ts`; adaptar `daily-operations/suggestions.ts`.

**Interfaces:** `calculateDailyConsumption(input:{days:{date:string;covered:boolean;quantity:string}[];manualQuantity:string|null;mode:'manual'|'history'}): {quantity:string|null;source:'manual'|'history'|'unknown';coveredDays:number}`. `projectSupply(input:{today:string;dailyDemand:string;lots:{id;quantity;expiresOn:string|null}[];incoming:{id;quantity;expectedOn:string;confirmed:boolean}[];horizonDays:number}): {depletionDate:string|null;daily:{date;available:string;unmet:string}[]}`. `suggestPurchase(input:{projection;leadDays:number;safetyDays:number;targetDays:number;packQuantity:string;minimumPacks:number}): {baseQuantity:string;packs:number;urgency:Urgency;reasons:string[]}`. Tipar aliases de IDs/fechas en `types.ts`; horizonte≤365.

- [ ] Tests consumo: manual tiene fuente manual; histórico requiere28 fechas completas consecutivas antes de hoy y no anteriores a `historyCoverageStartDate`; faltante de cobertura→unknown; cero explícito no es unknown. Excluir transferencias/conteos; compensar devolución/corrección enlazada al movimiento original y no crear consumo negativo; preparado y materia prima son artículos distintos, sin doble expansión de ventas.
- [ ] Tests proyección con tasa100/día, sin entradas: disponible700→critical,1000→high,1100→scheduled para7+3. Entrada día8 no arregla agotamiento día5. Entrada oportuna cubre riesgo. Borrador/ETA ausente/atrasada sin reconfirmación no cubre. Lote vencido hoy excluido. Reservas descontadas una sola vez. Precisión fraccionaria y packs mínimos no pierden unidades.
- [ ] Implementar lectura de snapshots consistentes; clasificar movimientos por documento/acción/signo, incluyendo revisión de producción. Atribuir correcciones al consumo original, no al día de revisión; recortar histórico al período elegido. Vencimientos al inicio del día y ETA sin hora al final. Separar proyección física actual de entradas proyectadas en DTO.
- [ ] Generar sugerencia única por política/episodio; borrador existente se propone revisar, pedido confirmado solo cuenta remanente oportuno. Compra por sucursal y traslado por ubicación; no comprar dos veces por falta en Barra y Cocina del mismo artículo.
- [ ] Ejecutar tests nuevos y `tests/replenishment.unit.test.ts`; PASS. Integración confirma que consultar/sugerir no mueve stock.

### T4. Interfaz del encargado

**Files:** crear `src/components/daily-operations/{supply-settings,purchase-task,coverage-detail}.tsx`, `src/app/api/procurement/orders/route.ts`, `src/app/api/procurement/orders/[id]/route.ts`, `src/app/api/procurement/policies/route.ts`, `tests/procurement.http.test.ts`, `tests/e2e/daily-supply.spec.ts`; integrar tablero y recepción.

- [ ] Tests: configurar Bolivia7+3; objetivo requerido; elegir IDs/presentación; cobertura desconocida pide configuración; sugerencia muestra disponible/entrante y fecha límite; alerta sigue crítica con ETA tardía; trámite no suma stock; recepción parcial muestra pendiente.
- [ ] Mostrar explicación breve y detalle de cálculo, fuente/tasa/fecha, cantidad base y packs. Pedido generado queda borrador hasta confirmación explícita de encargado. No mostrar controles de pedido/costos a staff no asignado.
- [ ] Verificar API, E2E tablet, tipos/lint y regresiones de compras. No activar política real ni ejecutar compras al demostrar UI.
