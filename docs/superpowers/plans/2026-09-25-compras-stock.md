# Compras e inventario Implementation Plan

> **For agentic workers:** Use superpowers:subagent-driven-development. El usuario pidió continuar desarrollo; las tareas se ejecutan localmente sin nuevos pasos de aprobación ni integración externa.

**Goal:** Entregar recepciones manuales, pagos independientes, lotes y movimientos auditados con interfaz usable.

**Architecture:** Subsistema inventory con esquema PostgreSQL propio, transacciones y claves de idempotencia; API Next autenticada y pantallas cliente Shadcn. Root integra HTTP y verifica; trabajo backend/UI separado por contratos.

**Tech Stack:** Next.js, TypeScript, Drizzle/PostgreSQL, PGlite local, Better Auth, Shadcn, Vitest y Playwright ya instalados; sin dependencias nuevas.

**Spec:** ../specs/2026-09-25-compras-stock.md; amplía secciones 4–5 del diseño general.

## Global Constraints

- Español Argentina, ARS; fechas comerciales Salta y timestamps UTC.
- Costo desconocido permanece pendiente; aritmética decimal exacta en servidor.
- Reintentos no duplican stock ni pagos; operaciones sin borrado destructivo.
- No conectar Neon ni servicios externos ni modificar/publicar el sitio vigente.
- Mantener permisos administrativos, Origin exacto, auditoría, relaciones y datos históricos.

## Review Focus

1. Respuesta perdida/reenvío y clave repetida con contenido diferente — pruebas de servicio tarea 1, navegador tarea 3.
2. Cantidades fraccionarias, redondeo a centavos y costo desconocido — literales de balance/valor tarea 1.
3. Doble merma/conteo o sobrepago concurrente — transacciones, revisión y pruebas tarea 1.
4. Catálogo cambia mientras se recibe; unidad con historial, presentación incompatible/archivada — tarea 1.
5. Vencimiento justo en fecha de Salta y errores HTTP conservando datos — tarea 1 y tarea 3.

### Task 1: Persistencia y servicio de compras/inventario

**Files:** Crear `src/db/inventory-schema.ts`, migración `drizzle/0001_*.sql`/meta, `src/modules/inventory/{types,validation,decimal,service}.ts` (separar helpers si necesario), `tests/inventory.test.ts`. Modificar schema.ts y bloqueo de unidad en catalog/service.ts.

**Interfaces:** Todos los métodos y tipos descritos en spec y types.ts. Reutiliza Actor/AppDb y tablas catálogo. No modifica rutas ni componentes. Produce servicio probado para root/UI.

- [ ] Escribir pruebas RED con una base migrada: recepción 2 × 800 g a ARS 1.000 por paquete → cantidad `1600.000000`, valor `2000.000000`, total `2000.00`; repetir requestId conserva un solo ingreso. Precio nuevo 4 g a 3 ARS/g sobre 4 g a 1 ARS/g → promedio 2 ARS/g; merma2g aplica costo4ARS.
- [ ] Probar pagos parciales, sobrepago rechazado, clave distinta mismo comprobante, mismatch requestId, usuario staff, referencias archivadas, revisión obsoleta, rollbacks, vencido bloqueado y costo null versus cero. Ejecutar `npm test -- tests/inventory.test.ts` y guardar resultado RED.
- [ ] Implementar esquema con FK/CHECK/índices, migración nueva (no alterar0000). Servicio calcula decimales con BigInt; locks ordenados por insumo. Historial y auditoría en misma transacción. Serializar pago por recepción y mutaciones por insumo. No tocar costos de reposición.
- [ ] Ejecutar suite focal y `npm test`; registrar log y preocupaciones. No ejecutar build/browser (root coordina). Commit solo archivos propios; reporte `docs/stock-backend-report.md`.

### Task 2: API y permisos

**Files:** Crear `src/modules/inventory/http.ts`, rutas api/purchases e inventory, `tests/inventory-http.test.ts`.

**Interfaces:** Endpoints exactos de spec; consumo de createInventoryService. Respuesta receive/pay `{receipt}`, adjustment `{lot}`. Entrada requestInput existente; getActor existente. Errores JSON sin información sensible.

- [ ] Probar operaciones directas sin autorización y Origin inválido: rechazan sin escribir; reutilizar pruebas de permiso reales del servicio.
- [ ] Rutas llaman `requireActor`, requestInput para escrituras y método servicio. No confiar en actor o totales del cliente.
- [ ] Typecheck y suite integrada; leer documentación Next instalada sobre Route Handlers antes de código.

### Task 3: Pantallas y recorridos operativos

**Files:** Crear `src/components/inventory/*`, `src/app/(operations)/purchases/page.tsx`, inventory/page.tsx y `tests/e2e/inventory.spec.ts`. Modificar app-shell.tsx/home para navegación, sin cambiar componentes genéricos innecesariamente.

**Interfaces:** Types compartidos y HTTP de spec. Catálogo consulta API existente con búsqueda/recuento (no asumir solo100 registros).

- [ ] Escribir recorrido RED navegador: crear insumo/presentación víaAPI, recibir2paquetes800g mediante formulario, verificar1.600g alrecargar, pago parcial independiente, merma/conteo y entradas pendientes. No agregar timeout arbitrario.
- [ ] Construir Compras con listado/detalle/pago y formulario de recepción revisable; Inventario con físico/utilizable/valorpendiente, detalle de lotes y movimientos; ingreso manual y merma/conteo/bloqueo con motivo. Confirmación clara de stock; no formulario editable de recepción confirmada.
- [ ] Retener clave/payload exacto en respuesta incierta; reintentar misma operación. No afirmar éxito tras fallo al refrescar una escritura ya confirmada. Botones Cancelar type=button, controles deshabilitados al guardar.
- [ ] Ejecutar Playwright tras integración root, en escritorio y390px; preservar pruebas anteriores. Reportar logs y capturas en docs/stock-ui-report.md. No correr browser mientras root build activo.

### Task 4: Revisión y entrega

**Files:** Actualizar README, docs/progress-stock.md, docs/verification-stock.md, previews; paquete zip versionado.

- [ ] Revisión independiente de contratos/servicio y código integrado; corregir fallos demostrados con regresión.
- [ ] `npm test`, `npm run typecheck`, `npm run lint`, `npm run build`, E2E integrado. No repetir pruebas sin riesgo concreto.
- [ ] Archivar fuente/migraciones/tests/documentación/capturas sin secretos ni DB; persistir artefacto y comunicar exactamente lo implementado y límites.

## Self-review

Tarea1 produce tipos/servicio que2consume;1/3comparten solo types.ts propiedad1;2/3 comparten HTTPdescrito.3 es dueño shell/home; root no cambia esos archivos.1modifica catalog/service bloqueo unidad; añade prueba con historial. Cobertura explícita de5 riesgos. No se implementan órdenes/pedidos parciales, OCR, producción oPOS en esta entrega.
