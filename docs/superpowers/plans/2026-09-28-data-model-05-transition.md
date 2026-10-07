# P5 — Integración, transición y aceptación — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Integrar los servicios y preparar una transición verificable sin perder datos.
**Architecture:** Contratos HTTP y UI operativa consumen ámbito/servicios comunes; migraciones nuevas y herramientas explícitas preservan UUID e históricos. Activación sólo después de conciliación y ensayo autorizado.
**Tech Stack:** Versiones del plan principal; no nuevas dependencias salvo necesidad demostrada.
**Spec:** `docs/superpowers/specs/2026-09-28-data-model-design.md`, secciones 10–13.

## Global Constraints

Heredar plan principal. Aquí se escriben SQL y pruebas para revisión, pero no se ejecutan migraciones, ensayos ni despliegue. No modificar `.env`, `scripts/create-user.ts`, migraciones 0000–0006 ni sus snapshots. Conservar cambios locales de 0.6.0-rc.1.

## Review Focus

Segunda sucursal con datos antiguos → T2/T3; historial legacy sin consumos inventados → T2; selector cambia mientras el usuario edita → T1; consolidado duplica tránsito → T3; conteo durante WIP → T1/T3.

## T1. Fronteras HTTP y pantallas operativas

**Files:** crear `src/modules/branches/http.ts`, `src/components/branch-selector.tsx`, `src/app/api/branches/route.ts`, `src/app/api/branches/[id]/route.ts`, `src/app/api/branches/[id]/members/route.ts`, `src/app/api/branches/[id]/locations/route.ts`, `src/app/api/transfers/route.ts`, `src/app/api/transfers/[id]/[action]/route.ts`, `src/app/api/inventory/internal-use/route.ts`, `src/app/api/stock-resolutions/[id]/route.ts`; modificar `src/app/api/catalog/[entity]/route.ts`, `src/app/api/catalog/[entity]/[id]/route.ts`, todos los handlers existentes bajo inventory/purchases/sales/preparation/production/recipes/modifier-groups y sus helpers http cuando corresponda a ámbito global/operativo; modificar `src/components/app-shell.tsx`, `catalog-manager.tsx` y managers/board/card/detail de inventory, recipes, production, sales, preparation, modifiers.
**Test:** `tests/branch-routing.http.test.ts`, `tests/branch-selection.unit.test.ts`, `tests/e2e/branches-inventory.spec.ts`.
**Interfaces:** `operationalContext(request: Request): Promise<OperationalContext>` usa sesión + encabezado `X-Kybo-Branch-Id` validado, nunca actor del cuerpo. `useBranchContext()` en `src/components/branch-selector.tsx` produce `{branchId:string; setBranchId:(id:string)=>void}` con membresías del servidor; su valor no sustituye autorización. APIs globales usan `requireCatalogManagement` y no fingen pertenencia a una sucursal.

- [ ] Escribir pruebas HTTP: branch ausente en operación nueva rechaza; ajeno rechaza antes de servicio; recurso existente exige correspondencia con sucursal persistida; peticiones globales usan permiso global. Cambiar selector no modifica el branchId ligado a un formulario/documento abierto.
- [ ] Ejecutar `node node_modules/vitest/vitest.mjs run tests/branch-routing.http.test.ts tests/branch-selection.unit.test.ts`; confirmar fallo.
- [ ] Leer guías instaladas Next.js para route handlers, layouts, params async y componentes cliente. Propagar contexto en todos los servicios/consultas. El resumen inicial y SSR cargan sólo sucursales permitidas; una cookie de preferencia se valida y no otorga acceso. Caches por branch+actor/alcance cuando corresponda, y cliente invalida datos al cambiar contexto.
- [ ] Actualizar terminología interna a items/itemId, formularios de clase/unidad, vínculo directo/receta, ubicaciones y cantidades reservadas/disponibles. Ofrecer resolución física de cancelaciones pendientes y confirmación de cambios de sucursal con ediciones sin guardar. Agregar pantallas operativas mínimas para altas/configuración de sucursal, membresías, ubicaciones, traslados y uso interno en `src/components/branches/manager.tsx`, `src/components/transfers/manager.tsx`, `src/components/inventory/internal-use.tsx`, con rutas `/branches`, `/transfers`, `/inventory/internal-use` protegidas. La reorganización global y Breadcrumb siguen fuera de alcance.
- [ ] Botones listos/entregar/cancelar usan servicios P4, sin duplicar reglas en cliente. Actualizar pruebas HTTP antiguas por cambios de contrato. Retirar adaptadores antiguos documentados en P1 después de actualizar todos los clientes propios; conservar migraciones históricas y snapshots JSON sin reescribir su significado.
- [ ] Escribir E2E para navegación de selector, venta mixta, finalización y cancelación; no ejecutar el arnés que migra. Repetir pruebas puras/HTTP, lint y TypeScript.

## T2. SQL nuevo y herramientas de transición

**Files:** crear `scripts/data-model-preflight.ts`, `scripts/data-model-transition.ts`, `src/modules/transition/{mapping,validation,reconcile}.ts`, `docs/data-model-migration.md`; crear nuevas migraciones `drizzle/0007_data_model_expand.sql` y `drizzle/0008_data_model_finalize.sql` con metadatos nuevos (recomprobar numeración libre al ejecutar); extender `_journal.json` sin editar entradas anteriores.
**Test:** `tests/transition.unit.test.ts`, `tests/transition.integration.test.ts`.
**Interfaces:** `TransitionMapping = {initialBranch:{id:string;code:string;name:string;timeZone:string}; initialLocation:{id:string;code:string;name:string}; memberships:{userId:string;branchId:string;role:'manager'|'staff'}[]; catalogManagers:string[]; itemClassifications:{itemId:string;class:'food'|'beverage'|'packaging'|'cleaning'|'other'}[]; cutoverAt:string}`; `validateMapping(raw: unknown): TransitionMapping`; `reconcile(db: AppDb, branchIds: string[]): Promise<{ok:boolean; differences:{code:string;recordId:string;expected:string|null;actual:string|null}[]}>`.

- [ ] Escribir `mapping_requires_explicit_assignments`: configuración ausente no elige sucursal ni clasifica nombres; usuario/ubicación desconocidos rechazan; repetición del mismo mapping no duplica entidades. Corte inválido y cantidades históricas ambiguas producen informe, no corrección silenciosa.
- [ ] Ejecutar `node node_modules/vitest/vitest.mjs run tests/transition.unit.test.ts`; confirmar fallo.
- [ ] Preparar expand SQL: renombres preservando UUID, tablas nuevas, campos de alcance inicialmente rellenables y restricciones relacionales compatibles con backfill. Finalize SQL endurece NOT NULL/constraints sólo después de las comprobaciones. Herramienta coordina explícitamente expand→mapping/backfill→validación→finalize; `db:migrate` genérico no debe saltarse ese orden ni inventar valores por defecto.
- [ ] Definir precondición SQL de finalize: aborta sin marca de transición y conciliación satisfactoria. Documentar comandos separados de preparación/aplicación y recuperación en mantenimiento; el script exige modo `--apply` explícito y conexión de destino explícita, nunca aplica nada al importarse. Su modo por defecto es informe sin escrituras.

  La herramienta aplica cada etapa y su registro de historial de migraciones juntos,
  con hash/orden compatibles con el migrador instalado. No marcar finalize aplicada
  antes del backfill ni falsear el journal. El modo informe no llama al migrador.
  Antes de publicar estos SQL, probar que el comando genérico bloquea un intento
  de finalizar prematuramente y no deja el historial diciendo que finalizó.
- [ ] Preservar snapshots, montos, nombres históricos, lotes, saldos y eventos. Marcar ventas antiguas como inventario no gestionado; nunca crear consumos retroactivos. Confirmar las recetas legacy ambiguas antes de activar. Vinculación de productos directos usa configuración revisada, no coincidencia de nombres.
- [ ] Crear prueba de migración poblada hasta 0006, con costos null/cero, archivos, reservas inexistentes antiguas y recetas modificadas: IDs/conteos/historial conservados y sumas iguales; finalize sin mapping falla; segunda ejecución no duplica. Escribir fixture con métodos existentes, sin ejecutarlo aún.
- [ ] Documentar datos a pedir al usuario sobre informe concreto: ubicación inicial, membresías, clasificaciones, suministro de productos y corte. Reportar cualquier dato cuya preservación no pueda demostrarse. No solicitar credenciales por chat ni volcarlas en logs.

## T3. Pruebas de aceptación y recuperación

**Files:** crear `tests/helpers/postgres-data-model.ts`, `tests/data-model.concurrency.test.ts`, `tests/data-model-acceptance.integration.test.ts`, `docs/verification-data-model.md`; modificar helpers existentes sólo para soporte de nuevo esquema sin cambiar su necesidad de autorización.
**Interfaces:** `createDedicatedTestContext(): Promise<{db:AppDb;secondDb:AppDb;close:()=>Promise<void>}>` en helper nuevo exige `KYBO_TEST_DATABASE_URL` y autorización registrada antes de configurar un namespace de prueba. Nunca usa DATABASE_URL ni base activa como fallback.

- [ ] Escribir tabla de casos que cubra todos los escenarios de la sección 12 del spec, indicando prueba concreta, qué conexión y resultado esperado. Incluir pruebas cross-branch por SQL directo además de HTTP, y dos conexiones para reservas/finalización/cancelación simultáneas.
- [ ] Crear aceptación segunda sucursal: A con historial, abrir B, catálogo compartido, saldos de B cero; transferir 12, recibir 5+7; consolidado conserva cantidad/valor y tránsito se cuenta una vez. Cambio de selector no devuelve caché de A a usuario de B.
- [ ] Crear conciliación y recuperación: divergencia introducida deliberadamente es detectada; no se «repara» borrando historial. Ensayar restauración en entorno dedicado antes de activar; un rollback después de nuevas escrituras exige preservar esas operaciones, no sólo restaurar backup antiguo.
- [ ] Ejecutar ahora sólo pruebas nuevas `.unit`/`.http` nombradas explícitamente, TypeScript, lint, diff y build con base ficticia. Registrar comando, fecha, salida real y limitaciones. No contar tests escritos/omitidos como aprobados.
- [ ] Cuando exista autorización de ensayo y destino dedicado verificado, ejecutar suites integration/concurrency y E2E. Si esa autorización no existe, entregar código/SQL revisables e informar que no está listo para activar; no afirmar garantías concurrentes/migración verificadas.
- [ ] Comparar huellas de archivos protegidos y HEAD; revisar diff final contra base local inicial. Actualizar estado del spec/plan según resultados reales; mantener navegación pausada hasta cerrar aceptación del modelo.
