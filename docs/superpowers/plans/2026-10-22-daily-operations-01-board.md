# Etapa 1 — Tablero, tareas y stock por ubicación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans or superpowers:subagent-driven-development after user approval. Steps use checkbox (`- [ ]`) syntax. No commit/push.

**Goal:** Dar al encargado y empleados un tablero operativo con ejecución trazable de tareas existentes.
**Architecture:** Persistir coordinación y auditar transiciones; proyectar documentos de producción/traslado existentes y ejecutar con el mismo `Tx`.
**Tech Stack:** Next.js, React, Drizzle/PostgreSQL, Zod, Vitest/PGlite, Playwright.
**Spec:** [Diseño](../specs/2026-10-22-daily-operations-design.md).

## Global Constraints
Aplican todos los límites del [plan principal](2026-10-22-daily-operations.md#global-constraints), en particular no commits, push, cambios reales de stock ni migraciones de proyecto sin autorización. Solo base descartable para pruebas. Urgencia y tareas no otorgan permisos adicionales por sí mismas.

## Review Focus
Replays tras reasignación; documentos creados fuera del tablero; dos reconciliaciones simultáneas; faltante parcial en origen; bloqueo/error de lectura que nunca aparezca como tablero sano. Casos en T2/T3/T4.

### T1. Modelo de tareas y reglas de prioridad

**Files:** crear `src/db/daily-operation-schema.ts`, `src/modules/daily-operations/{types,priority,validation}.ts`, `tests/daily-operation-priority.test.ts`, `tests/daily-operation-schema.integration.test.ts`; modificar `src/db/schema.ts`, `drizzle/meta/_journal.json`, fixture `tests/helpers/data-model-database.ts`. Migración propuesta `drizzle/0025_daily_operations.sql`, verificar siguiente índice antes de generarla.

**Interfaces:** `TaskState = 'pending'|'in_progress'|'blocked'|'awaiting_review'|'done'|'cancelled'|'superseded'`; `TaskKind = 'transfer'|'production'|'purchase'|'count'`; `Urgency = 'critical'|'high'|'scheduled'`. `classifyUrgency(input: { now: Date; dueAt: Date|null; blockedCurrentDemand: boolean; coverageDays: number|null; leadDays: number|null; safetyDays: number|null; incomingCoversGap: boolean }): { urgency: Urgency; overdue: boolean; reasons: string[] }`. Comparaciones exactas usan horas/días derivadas del motor, no texto formateado.

- [ ] Tests: falta actual→critical; plazo7/margen3 con cobertura7→critical, 10→high, 11→scheduled; entrada oportuna evita la razón de quiebre, entrada tardía no; conteo vencido→high+overdue; sin datos no produce «Al día».
- [ ] Ejecutar `pnpm test tests/daily-operation-priority.test.ts` y confirmar fallo inicial.
- [ ] Implementar tablas descritas en el diseño, `revision`, claves únicas activas de necesidad y vínculo único `(branch_id, document_type, document_id, document_role)`, FK compuestas, eventos inmutables y dependencias sin autoenlace. `document_role` distingue `execute` para traslado/producción/conteo y `order`/`receive` para compras, permitiendo dos etapas del mismo pedido sin duplicar cada etapa. Tipos de cantidades canónicas string; DTO no contiene costo/proveedor para staff.
- [ ] Verificar `pnpm test tests/daily-operation-priority.test.ts tests/daily-operation-schema.integration.test.ts`: conflictos de unicidad, sucursal incorrecta y rollback de migración; PASS.

### T2. Comandos, permisos y adaptadores de ejecución

**Files:** crear `src/modules/daily-operations/{commands,access,document-adapters}.ts`, `tests/daily-operation-commands.integration.test.ts`; modificar `src/modules/operations/command.ts`, `src/modules/transfers/service.ts` y `src/modules/production/planning.ts` solo en los puntos necesarios para compartir `Tx`/autorización específica.

**Interfaces:** `runTaskCommand(db: AppDb, actor: Actor, taskId: string, command: { requestId: string; expectedRevision: number; action: 'assign'|'start'|'report_blocked'|'cancel'|'dispatch'|'receive'; assignedTo?: string; reason?: string; payload?: unknown }): Promise<{taskId:string; revision:number}>`. `syncDocumentTask(tx: Tx, ctx: OperationalContext, document: {type:'production'|'transfer'; id:string}): Promise<void>` lee datos reales del documento. Las cargas de despacho/recepción se validan con esquemas del dominio, nunca se confía en `unknown`.

- [ ] Tests: staff asignado ejecuta solo su tarea; otro empleado403; asignación revocada antes del replay403; intento de cambiar destino/cantidad autorizado409/403; confirmar/recibir no puede terminalizar una tarea sin documento; fallo de movimiento revierte estado y evento.
- [ ] Ejecutar `pnpm test tests/daily-operation-commands.integration.test.ts` → fallo inicial esperado.
- [ ] Extraer helpers transaccionales de traslado conservando las APIs actuales de encargado. Comandos de tarea autorizados verifican la tarea y solo llaman helpers internos con límites persistidos; producción conserva sus reglas actuales. Revisiones obligatorias, orden estable de bloqueos y autorización antes de replay.
- [ ] Verificar tests nuevos más `tests/production-assignments.integration.test.ts` y `tests/transfers.unit.test.ts`. Añadir regresión integración que compare reservas/ledger antes y después de despacho y recepción repetidos.

### T3. Snapshot, recomendaciones y reconciliación

**Files:** crear `src/modules/daily-operations/{queries,reconcile,suggestions}.ts`, `tests/daily-operation-reconcile.integration.test.ts`; reutilizar `src/modules/replenishment/engine.ts` sin cambiar el contrato de su panel existente.

**Interfaces:** `getDailyOperationSnapshot(db: AppDb, actor: Actor, filters: {businessDate:string; mine:boolean; locationId?:string; state?:TaskState; offset:number}): Promise<{asOf:string; tasks:TaskRow[]; total:number; configurationWarnings:string[]}>`. Definir `TaskRow` en `types.ts`: ID, revisión, tipo/estado, urgencia/razones, vencimiento, responsable, cantidades/unidad, origen/destino, documento, dependencias; empleados solo propias. `reconcileDailyOperations(db: AppDb, actor: Actor, input:{requestId:string; businessDate:string}): Promise<{created:number;updated:number;superseded:number}>`.

- [ ] Tests: dos reconciliaciones→una tarea activa; mantener responsable al recalcular; no cambiar cantidad autorizada; tarea desaparecida→superseded; producción externa se incorpora una vez; traslado cubre solo parte y queda sugerencia del remanente; entrada esperada no se suma al físico; consulta GET no cambia filas.
- [ ] Implementar bloqueo de reconciliación por sucursal y claves de necesidad. Snapshot repeatable-read; vigencia horaria con timezone de sucursal. No crear compras reales ni forecasts antes de etapa3. Las sugerencias de compra básicas abren compras existente e indican esa limitación.
- [ ] Ejecutar `pnpm test tests/daily-operation-reconcile.integration.test.ts tests/replenishment.unit.test.ts tests/replenishment.integration.test.ts`; PASS. Dejar prueba de exclusión con dos conexiones PostgreSQL para entorno descartable autorizado, no atribuir esa garantía al test PGlite.

### T4. Pantalla y permisos HTTP

**Files:** crear `src/app/(operations)/operations/day/page.tsx`, `src/app/api/operations/day/route.ts`, `src/app/api/operations/day/reconcile/route.ts`, `src/app/api/operations/tasks/[id]/route.ts`, `src/components/daily-operations/{manager,task-list,task-detail,stock-by-location}.tsx`, `tests/daily-operation.http.test.ts`, `tests/e2e/daily-operations.spec.ts`; modificar `src/lib/navigation.ts` y acceso al tablero desde `src/components/sales/replenishment-panel.tsx`.

**Interfaces:** GET day consume snapshot; POST reconcile consume comando de encargado; POST tasks/[id] consume `runTaskCommand`. `DailyOperationsManager({actorId,role,businessDate})`; componentes pequeños, sin copiar `SalesManager`. Stock por ubicación muestra físico/reservado/no utilizable/disponible y origen/destino, sin sumar unidades distintas.

- [ ] Tests HTTP: sin sesión401; otra sucursal403/404; staff solicita equipo→403; datos de proveedores/costos no salen al empleado; migración ausente503 con mensaje de actualización, no lista vacía.
- [ ] Tests navegador: filtros urgencia/responsable, asignar e iniciar tarea, explicación de bloqueo, conflicto409 preserva formulario, teclado/foco, tres tamaños de tablet y sin overflow. API simulada en pruebas UI; no ejecutar movimientos contra Neon.
- [ ] Implementar refresco60s visible y POST reconcile solo para encargado; advertencia última actualización ante fallo de red; acciones deshabilitadas sin datos vigentes. Entrada a `/operations/day` siempre usa sucursal de sesión, no IDs del cliente para autorizar.
- [ ] Ejecutar tests anteriores, tipos y lint del alcance. Revisar visualmente antes de entregar. Registrar lo que todavía no incluye la etapa (conteos recurrentes, compras pendientes y rendimiento).
