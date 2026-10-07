# P2 — Inventario por ubicación — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Registrar cantidades, reservas, valor y traslados sin duplicación ni mezcla de sucursales.
**Architecture:** Núcleo transaccional de movimientos con FK de origen tipadas; proyecciones reconciliables de saldos y valoración. Reservas y tránsito tienen identidad separada del stock disponible.
**Tech Stack:** Versiones del plan principal; reutilizar decimal.ts y utilidades de valoración comprobadas.
**Spec:** `docs/superpowers/specs/2026-09-28-data-model-design.md`, secciones 5, 8–10.

## Global Constraints

Heredar plan principal. Sin migraciones, commits, push ni consultas a la base real. Entrada: P1 terminado y tipos OperationalContext/StockAllocation/StockOrigin/CommandMeta/OperationResult disponibles.

## Review Focus

Lotes vencidos/bloqueados reservados → T2; replays ajenos → T1; recepción parcial y redondeo de tránsito → T3; ajustes durante elaboración → T2. Costos desconocidos nunca son cero.

## T1. Movimientos, bloqueo y valoración

**Files:** crear `src/db/{stock,reservation,transfer,inventory-document}-schema.ts`, `src/modules/inventory/{ledger,locking,valuation,operations}.ts`; modificar `src/db/inventory-schema.ts`, `src/db/schema.ts`, `src/modules/inventory/{service,types}.ts`.
**Test:** `tests/valuation.unit.test.ts`, `tests/ledger.integration.test.ts`.
**Interfaces:** `PostingLeg = StockAllocation & { direction: 'in'|'out'; incomingValue: Decimal|null }`; `PostingInput = {meta: CommandMeta; origin: StockOrigin; action: 'receipt'|'opening'|'count'|'waste'|'production'|'sale_consume'|'direct_dispatch'|'transfer'|'internal_use'|'return'; legs: PostingLeg[]; reason: string|null}`; `postMovement(tx: Tx, ctx: OperationalContext, input: PostingInput): Promise<OperationResult>`; `nextValuation(quantity: Decimal, value: Decimal|null, delta: Decimal, incomingValue: Decimal|null): {quantity: Decimal; value: Decimal|null; appliedValue: Decimal|null}`.

- [ ] Escribir `weighted_average_and_unknown_cost`: 10 unidades/valor 100 + 10/valor 200 = 20/300; salida de 5 aplica -75, deja 15/225; costo pendiente mantiene valor null; agotar saldo deja cantidad/valor cero. Reutilizar representación canónica de seis decimales.

  ```ts
  expect(nextValuation('20.000000', '300.000000', '-5.000000', null))
    .toEqual({quantity:'15.000000', value:'225.000000', appliedValue:'-75.000000'});
  ```
- [ ] Ejecutar `node node_modules/vitest/vitest.mjs run tests/valuation.unit.test.ts`; observar fallo antes de implementar.
- [ ] Crear balances lote-ubicación y artículo-ubicación, valoración artículo-sucursal y movimientos inmutables. Un movimiento pertenece a una ubicación; encabezados multi-sucursal de traslado usan relaciones de origen/destino. FK lote-artículo y ubicación-sucursal verifican pertenencia. Encabezado origen tiene FK concreta según StockOrigin y exclusividad validada; no se acepta sólo referenceId sin relación.
- [ ] Centralizar orden de locks: requestId, documentos fuente ordenados, tareas/líneas, items ordenados, valoraciones por branchId/itemId, luego ubicaciones/lotes/reservas ordenados. APIs compuestas bloquean todo el conjunto antes de publicar movimientos. `postMovement` no vuelve a reclamar el mismo requestId dentro de un comando compuesto ni inicia una transacción anidada.
- [ ] Extraer cálculo de valoración sin cambiar el manejo actual de null/cero. Definir claves de operación globalmente únicas y huella que incluye contexto/origen/datos normalizados. Replays validan acceso vigente antes de devolver resultado. Un requestId usado con otro cuerpo o por otro actor no devuelve datos ni vuelve a operar.
- [ ] Escribir integración: rollback revierte movimiento y ambos resúmenes; lote de item B con item A falla incluso por SQL directo; count/waste no atraviesan reservas; IDs ajenos/replays no filtran datos. No ejecutarla todavía.
- [ ] Repetir pruebas puras y verificación estática. Portar recepción/apertura/ajuste existentes al núcleo, manteniendo snapshots y origen documental; no permitir que el servicio viejo siga escribiendo balances globales.

## T2. Reserva y disponibilidad

**Files:** crear `src/modules/inventory/{availability,reservations,reservation-types}.ts`; modificar `src/modules/inventory/service.ts` y los schemas de T1.
**Test:** `tests/availability.unit.test.ts`, `tests/reservations.integration.test.ts`, `tests/reservations.concurrency.test.ts`.
**Interfaces:** `Demand = {itemId: string; locationId: string; quantity: Decimal}`; `ReserveInput = {meta: CommandMeta; origin: StockOrigin; demands: Demand[]}`; `reserveStock(tx: Tx, ctx: OperationalContext, input: ReserveInput): Promise<{reservationId: string; allocations: StockAllocation[]}>`; `settleReservation(tx: Tx, ctx: OperationalContext, input: {reservationId: string; consume: StockAllocation[]; release: StockAllocation[]; operationId: string}): Promise<void>`; `availableQuantity(input: {registered: Decimal; reserved: Decimal; blocked: boolean; expiresOn: string|null; businessDate: string}): Decimal`.

- [ ] Escribir `availability_excludes_reserved_and_unusable`: registrado 1000/reservado 300 da 700; mismo lote bloqueado o vencido da 0, nunca -300; vencimiento igual a fecha comercial ya es vencido. Escribir FEFO determinista con lotes sin fecha al final.

  ```ts
  expect(availableQuantity({registered:'1000.000000', reserved:'300.000000', blocked:false,
    expiresOn:null, businessDate:'2026-09-28'})).toBe('700.000000');
  ```
- [ ] Ejecutar `node node_modules/vitest/vitest.mjs run tests/availability.unit.test.ts` y confirmar fallo.
- [ ] Implementar selección local, reserva atómica y asignaciones con cantidad consumida/liberada acumuladas, sumas bajo bloqueo. Al confirmar faltante, no deja reservas parciales. `settleReservation` pertenece a un comando ya idempotente; verifica cantidades pendientes y sólo registra progreso, no duplica postings del llamador.
- [ ] Añadir estado de asignación afectada por bloqueo/vencimiento. Reasignar libera la asignación anterior y crea otra dentro del mismo comando, sin liberar la demanda del pedido a otras ventas. En proceso: si material ya fue usado, exigir resolución física explícita, no simular sustitución retroactiva.
- [ ] Escribir integración y concurrencia con dos conexiones: últimas 10 unidades, solicitudes de 7+7, exactamente una confirma; `reserved <= registered`, sin estados parciales. Bloquear/vencer tras reservar impide finalizar normal y mantiene demanda. Conteo no puede reducir stock por debajo de reservas o ignorar trabajo en proceso.
- [ ] Repetir pruebas permitidas y TypeScript; estas garantías concurrentes siguen pendientes hasta ensayo autorizado.

## T3. Transferencias y consumo interno

**Files:** crear `src/modules/transfers/{service,validation,types}.ts`, `src/modules/inventory/internal-use.ts`; modificar schemas/documentos de T1.
**Test:** `tests/transfers.unit.test.ts`, `tests/transfers.integration.test.ts`, `tests/internal-use.integration.test.ts`.
**Interfaces:** `createTransferService(db: AppDb)` expone `confirm(ctx, raw)`, `dispatch(ctx, id, raw)`, `receive(ctx, id, raw)`, `resolveDifference(ctx, id, raw)`, todos `Promise<OperationResult>`; validación de raw produce meta, revisión, origen/destino y líneas de item/lote/cantidad. `recordInternalUse(tx: Tx, ctx: OperationalContext, input: {meta: CommandMeta; allocations: StockAllocation[]; reason: string}): Promise<OperationResult>`.

- [ ] Escribir transición pura: borrador→confirmado→en tránsito→parcialmente recibido→recibido; recepción mayor al tránsito y cancelación simple tras despacho son inválidas. Repartir valor 1.000000 en tres recepciones conserva exactamente 1.000000 al cerrar el remanente.
- [ ] Ejecutar `node node_modules/vitest/vitest.mjs run tests/transfers.unit.test.ts`; confirmar fallo y luego implementar máquina de estados/valor restante.
- [ ] Implementar traslado interno con dos piernas atómicas y sin variar valoración de sucursal. Entre sucursales: confirmar reserva origen; despacho genera tránsito valorado; recepción usa ese valor, no el promedio actual de origen. Recepción parcial y diferencias tienen documentos/operaciones propios, relación al despacho y control de pendientes.
- [ ] Autorizar cada fase en su sucursal. La validación relacional del destino no exige dar al despachante permisos operativos en destino; la recepción sí exige pertenencia allí. Bloquear mutaciones fuera del estado permitido y cierre con tránsito pendiente no resuelto.
- [ ] Escribir integración: 12 unidades despachadas, 5+7 recibidas, destino nunca recibe 24; cambio posterior de costo origen no revaloriza tránsito; misma recepción repetida no suma stock; misma ubicación origen/destino rechazada. Uso interno descuenta detergente con motivo y origen real, sin venta ficticia, respetando reservas.
- [ ] Repetir pruebas puras, revisar FK/valores/estado e informar integración pendiente. No implementar todavía UI de navegación nueva.
