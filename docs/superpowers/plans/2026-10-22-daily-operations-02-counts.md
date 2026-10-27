# Etapa 2 — Controles de apertura, cierre e inventario semanal

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans or superpowers:subagent-driven-development after approval. Steps use checkbox (`- [ ]`) syntax. No commit/push.

**Goal:** Registrar conteos asignados y conciliar diferencias sin sobrescribir operaciones realizadas mientras se contaba.
**Architecture:** Sesiones y observaciones separadas de ajustes; la aprobación invoca helpers transaccionales del inventario existente.
**Tech Stack:** Drizzle/PostgreSQL, Zod, Vitest/PGlite, Next.js y Playwright.
**Spec:** [Diseño](../specs/2026-10-22-daily-operations-design.md).

## Global Constraints
Heredar límites del [plan principal](2026-10-22-daily-operations.md#global-constraints). Dependencia: contratos `TaskRow`, `syncDocumentTask` y comandos de etapa1, extendidos al documento `count`. No autorizar ajustes globales a empleados. Cantidad cero es válida; campo vacío no equivale a cero.

## Review Focus
Conteo con reservas; movimiento después de observar; cruce de medianoche; artículo archivado con saldo; doble aprobación y discrepancia distribuida en varios lotes. Casos obligatorios T1–T3.

### T1. Perfiles, horarios y sesiones

**Files:** crear `src/db/inventory-count-schema.ts`, `src/modules/inventory-counts/{types,schedule,profiles}.ts`, `tests/inventory-count-schedule.test.ts`, `tests/inventory-count-profiles.integration.test.ts`; modificar exports de schema, fixture y journal. Migración propuesta siguiente libre `0026_inventory_counts.sql`.

**Interfaces:** `CountKind='opening'|'closing'|'weekly'`; `CountState='draft'|'counting'|'submitted'|'approved'|'cancelled'`. `scheduledCounts(settings:{timeZone:string;openTime:string;closeTime:string;weeklyDay:number;weeklyTime:string}, businessDate:string): {kind:CountKind;dueAt:Date}[]`. `saveCountProfile(db,actor,input:{requestId:string;expectedRevision?:number;itemIds:string[];locationIds:string[]}): Promise<{id:string;revision:number}>`.

- [ ] Tests horario 09:00–01:00: cierre ocurre al día siguiente y pertenece a jornada anterior; semanal genera una sola sesión; horario sin configurar no genera vencimientos; errores de timezone/fecha no se normalizan silenciosamente.
- [ ] Implementar selección explícita por ID de los 10 grupos críticos del diseño. No seed de artículos ni cantidades. Semanal incluye todos los artículos controlados y saldos positivos archivados. Perfil guardado con revisión y auditoría; fotografías del perfil en cada sesión conservan lo que se pidió contar.
- [ ] Reconciliación diaria genera sesiones/tareas únicas por fecha/kind/ubicación al abrir el tablero; no materializar backlog histórico ilimitado. Crear controles de jornada actual y cierre de la anterior si sigue abierto; los controles antiguos existentes siguen vencidos hasta resolución motivada.
- [ ] Ejecutar `pnpm test tests/inventory-count-schedule.test.ts tests/inventory-count-profiles.integration.test.ts`; comprobar cero saldos/listados faltantes y aislamiento de sucursal.

### T2. Captura y detección de obsolescencia

**Files:** crear `src/modules/inventory-counts/{commands,queries,fingerprint}.ts`, `tests/inventory-count-capture.integration.test.ts`; extender acceso de tarea para `count` en `src/modules/operations/command.ts` y `daily-operations/access.ts`.

**Interfaces:** `startCountEntry(tx,ctx,entryId): Promise<{entryId:string;revision:number;stockToken:string}>`; `submitCountEntry(tx,ctx,input:{entryId:string;expectedRevision:number;stockToken:string;quantity:string;observedAt:string}): Promise<{revision:number}>`. Token calculado en servidor sobre IDs, cantidades físicas/reservadas, bloqueos, revisiones de lotes y ubicación; el cliente no puede aportar un token inventado. `getCountSession(db,actor,id)` oculta cantidades esperadas a staff antes de enviar y nunca entrega valuación.

- [ ] Tests: empleado asignado registra0, vacío400; otro empleado403; compra/venta/reserva entre iniciar y enviar409+recuento; volver a enviar requestId no duplica observación; observación no modifica saldos. Expirar lote también cambia elegibilidad y obliga a revisar el snapshot.
- [ ] Implementar captura por fila con precisión de unidad, revisiones, servidor como fuente de tiempos y eventos. No bloqueo de larga duración mientras la persona cuenta. El cliente puede conservar texto tras error, pero debe reiniciar medición antes de reenviar un token nuevo.
- [ ] Ejecutar `pnpm test tests/inventory-count-capture.integration.test.ts`; comparar ledger y reservas antes/después de solo observar; deben ser idénticos.

### T3. Revisión y conciliación

**Files:** crear `src/modules/inventory-counts/reconciliation.ts`, `tests/inventory-count-reconciliation.integration.test.ts`; extraer helper de `src/modules/inventory/scoped-adjustments.ts` manteniendo API actual.

**Interfaces:** `approveCountEntry(tx,ctx,operationId,input:{entryId:string;expectedRevision:number;stockToken:string;reason:string;lots:{lotId:string;countedQuantity:string;expectedRevision:number}[];excess?:{quantity:string;receivedOn:string;lotCode:string|null;expiresOn:string|null}}): Promise<{revision:number;movementIds:string[]}>`. Las asignaciones por lote deben sumar el total observado; exceso requiere datos completos de ingreso y origen `count_reconciliation` auditado. `excludeCountEntry(tx,ctx,input:{entryId;expectedRevision;reason})` solo encargado.

- [ ] Tests: igualdad→aprobado sin movimiento; dos aprobaciones→una conciliación; lote con reservas→bloqueo sin liberar; cambios después de envío→409 sin ajuste; suma de lotes distinta→400; falla en segundo lote revierte todo; excedente positivo crea lote solo con justificación; excluidas se enumeran y no figuran como contadas.
- [ ] Implementar autorización de encargado antes de replay, locks ordenados y reconciliación atómica. Usar ley de conservación/valuación actual. Agregar vínculo único entry→adjustment/operation; no ejecutar múltiples servicios que abran transacciones por separado.
- [ ] Ejecutar `pnpm test tests/inventory-count-reconciliation.integration.test.ts tests/stock-tracking.integration.test.ts`; revisar movimientos, valores y reservas.

### T4. UI y rutas de conteo

**Files:** crear `src/components/daily-operations/{count-session,count-review,count-settings}.tsx`, `src/app/api/operations/counts/route.ts`, `src/app/api/operations/counts/[id]/route.ts`, `tests/inventory-count.http.test.ts`, `tests/e2e/daily-counts.spec.ts`; integrar manager de etapa1.

**Interfaces:** POST counts crea/inicia sesión; POST counts/[id] usa discriminante `observe|submit|approve|exclude|cancel` con requestId/revision. Toda asignación debe pertenecer a la sucursal activa.

- [ ] Tests UI: empleado captura sin ver esperado; guardar progreso y reabrir; cantidad faltante distinta de cero; conflictos señalan fila; encargado revisa por lote; controles grandes y avance de filas en tres tamaños de tablet.
- [ ] Mostrar apertura/cierre/semanal, estado, responsable y vencimiento; «Pendiente de revisión» no equivale a terminado. Actualizar tablero tras conciliación y recalcular faltantes; no disparar compras reales.
- [ ] Ejecutar pruebas HTTP y navegador de etapa; tipos/lint. Activación real queda pendiente de autorización de migración y configuración de horarios/artículos.
