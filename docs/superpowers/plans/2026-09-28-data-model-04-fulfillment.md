# P4 — Preparación, cancelación y producción — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Consumir sólo lo efectivamente finalizado y resolver cancelaciones sin doble descuento.
**Architecture:** Eventos de cumplimiento por cantidad, ligados a reservas y movimientos. Separar resolución física de estado financiero.
**Tech Stack:** Versiones del plan principal y servicios de P1–P3.
**Spec:** `docs/superpowers/specs/2026-09-28-data-model-design.md`, secciones 6–8.

## Global Constraints

Heredar plan principal. Ninguna operación hace migraciones. Las suites integration/concurrency se preparan y quedan pendientes de autorización para ejecutarlas.

## Review Focus

Ready frente a cancelación concurrente → T1/T2; finalización parcial de una línea de varias unidades → T1; preparado ya consumido no devuelve materias primas → T2/T3; receta modificada después de reserva → T3.

## T1. Finalización y entrega por cantidades

**Files:** crear `src/db/fulfillment-event-schema.ts`, `src/modules/fulfillment/{service,validation,types}.ts`; modificar `src/modules/preparation/{service,publication,types,validation}.ts`, `src/modules/sales/service.ts` y `src/db/{sales,preparation}-schema.ts`.
**Test:** `tests/fulfillment-events.unit.test.ts`, `tests/preparation-stock.integration.test.ts`, `tests/preparation-stock.concurrency.test.ts`.
**Interfaces:** `LineQuantity = {saleLineId:string; quantity:Decimal}`; `completePreparation(tx: Tx, ctx: OperationalContext, input: {meta:CommandMeta; taskId:string; lines:LineQuantity[]; reason?:string}): Promise<OperationResult>`; `deliverLines(tx: Tx, ctx: OperationalContext, input: {meta:CommandMeta; orderId:string; lines:LineQuantity[]}): Promise<OperationResult>`.

- [ ] Escribir `remaining_quantities`: pedidas 3, terminadas 1 → quedan 2; terminar 3 más rechaza; entrega de preparado no terminado rechaza; reventa no requiere estado de cocina. `task_readiness` sólo es ready cuando se resuelven todas sus cantidades pendientes.
- [ ] Ejecutar `node node_modules/vitest/vitest.mjs run tests/fulfillment-events.unit.test.ts`; confirmar fallo.
- [ ] Agregar eventos inmutables con requestId, cantidades, actor, origen y revisión; clave de unicidad por operación. Pertenencia línea-pedido-tarea y sucursal mediante FK compuestas y validación bajo lock. Revisión protege contra cambios simultáneos; replays válidos devuelven el resultado sin requerir revisión actual igual a la anterior.
- [ ] Implementar completar: ctx autorizado, responsable o transferencia válida, bloquear venta→tarea/líneas→items→valores→asignaciones en orden acordado; usar composición reservada; postMovement y settleReservation en misma transacción; actualizar progreso y timestamps. Fallo deja tanto estado como stock sin cambios.
- [ ] Implementar entrega: receta ya consumida no produce otro movimiento; direct consume y liquida reserva; pedido mixto opera sólo sobre las líneas/cantidades solicitadas. Desvíos de materiales se registran con permisos, motivo y nueva disponibilidad; no editar snapshots históricos para ocultarlos.
- [ ] Escribir integración doble ready/retry, 1 de 3 unidades, venta ya cobrada aún pendiente de preparar, lote vencido al finalizar. Concurrencia ready/cancel y ready/ajuste exige un solo resultado físico coherente. No ejecutar aún.
- [ ] Repetir pruebas permitidas/TypeScript y revisar que todos los caminos de «Lista» usan este servicio; no mantener un cambio de estado alternativo que omita inventario.

## T2. Cancelaciones y recuperación

**Files:** crear `src/db/stock-resolution-schema.ts`, `src/modules/fulfillment/{cancellation,returns}.ts`; modificar `src/modules/sales/{service,validation}.ts`, `src/modules/preparation/publication.ts`.
**Test:** `tests/cancellation.unit.test.ts`, `tests/cancellation-stock.integration.test.ts`.
**Interfaces:** `cancelStock(tx: Tx, ctx: OperationalContext, saleId: string, meta: CommandMeta): Promise<{resolutionId:string; status:'resolved'|'pending'}>`; `resolveCancellation(tx: Tx, ctx: OperationalContext, input: {meta:CommandMeta; resolutionId:string; consumed:StockAllocation[]; unused:StockAllocation[]; reason:string}): Promise<OperationResult>`; `recordReturn(tx: Tx, ctx: OperationalContext, raw: unknown): Promise<OperationResult>` con schema de origen, artículo/lote, ubicación, cantidad, estado utilizable y motivo.

- [ ] Escribir `cancel_by_progress`: pending libera todo; preparing sin cantidades declaradas queda pendiente y mantiene reserva; ready no resta/restaura componentes otra vez. Rechazar resolución donde consumido+sin usar supera asignación pendiente o utiliza lote de otra reserva.
- [ ] Ejecutar `node node_modules/vitest/vitest.mjs run tests/cancellation.unit.test.ts`; confirmar fallo.
- [ ] Separar cancelación financiera de resolución física. CancelSaleTasks no libera implícitamente materiales en proceso. Estados pendientes tienen responsable y visibilidad para encargado; registrar relación a venta, tareas, reservas y operaciones físicas. La devolución de dinero conserva comportamiento actual pero no dispara una devolución automática de stock.
- [ ] Resolver bajo lock: material ya consumido al finalizar no sale otra vez; en proceso registrar una única salida por consumo/merma y liberar sólo el remanente declarado. La clasificación como desperdicio del preparado es evento, no segundo consumo.
- [ ] Implementar devoluciones explícitas de artículos recuperables con límite respecto del origen y cantidades devueltas antes; artículo/lote/sucursal relacionados por FK. No desarmar automáticamente un producto elaborado en materias primas.
- [ ] Escribir integración doble cancelación, resolución parcial seguida de resto, devolución mayor al entregado, reintento después de devolución y ready concurrente. Revisar que solicitudes cross-branch no revelan resolución ni actor. Repetir pruebas permitidas y comprobación de tipos.

## T3. Producción para almacenar

**Files:** crear `src/db/production-order-schema.ts`, `src/modules/production/orders.ts`; modificar `src/db/production-schema.ts`, `src/modules/production/{service,types,validation}.ts`, `src/modules/recipes/service.ts`.
**Test:** `tests/production-orders.unit.test.ts`, `tests/production-stock.integration.test.ts`.
**Interfaces:** `confirmProduction(tx: Tx, ctx: OperationalContext, raw: unknown): Promise<{orderId:string; reservationId:string}>`; `finishProduction(tx: Tx, ctx: OperationalContext, orderId:string, raw:unknown): Promise<OperationResult>`; raw validado incluye meta, versión de receta, consumo por StockAllocation, rendimiento real, ubicación salida, fecha y lote/vencimiento opcional.

- [ ] Escribir validación: rendimiento real >0, ubicaciones de misma sucursal, expiración dentro de la política existente y fecha comercial del contexto. No borrar las restricciones actuales de vencimiento por las materias primas.
- [ ] Ejecutar `node node_modules/vitest/vitest.mjs run tests/production-orders.unit.test.ts`; confirmar fallo.
- [ ] Crear orden/reserva con versión fija; preview registra revisiones y usa saldos locales. Finalizar vuelve a verificar, consume allocations reservadas, crea lote salida y alta de inventario en una transacción. El costo total consumido se reparte por rendimiento real; null se conserva.
- [ ] Mantener flujo rápido actual: permitir confirmar y finalizar la orden en una sola transacción cuando el formulario registra una elaboración ya completada, conservando entidades/eventos y sin exponer reserva intermedia a otras operaciones. No saltarse validación de stock.
- [ ] Escribir integración leche→preparado→venta: producción consume materias primas una vez; venta consume el preparado; reintento no crea otro lote. Cancelar una orden en proceso usa resolución física de T2, no liberación indiscriminada. Repetir pruebas permitidas y tipos.
