# P1 — Artículos y sucursales — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Definir identidad física y ámbito operativo sin duplicar catálogo.
**Architecture:** Schema de artículos separado del comercial; contexto validado de sucursal en servidor.
**Tech Stack:** Versiones y restricciones del plan principal `2026-09-28-data-model.md`.
**Spec:** `docs/superpowers/specs/2026-09-28-data-model-design.md`, secciones 2–4.

## Global Constraints

Heredar todas las del plan principal. No aplicar SQL, no modificar migraciones 0000–0006 ni `.env`. Las tareas con base se escriben pero su ejecución requiere autorización independiente.

## Review Focus

Replays fuera de ámbito y segunda sucursal → T2. Un artículo archivado no impide resolver reservas previas → T1 y P4. No usar una sucursal global mutable.

## T1. Identidad de artículos y unidades

**Files:** crear `src/db/item-schema.ts`, `src/db/types.ts`, `src/modules/items/validation.ts`, `src/modules/items/units.ts`, `src/modules/operations/types.ts`; modificar `src/db/business-schema.ts`, `src/db/schema.ts`, `src/modules/catalog/{types,definitions,validation,service}.ts` y las referencias a `ingredients` en schemas/servicios/componentes/pruebas identificadas con `rg`.
**Test:** `tests/items.unit.test.ts`, `tests/items.integration.test.ts`.
**Interfaces:** exportar `items`, `itemSchema` y `ItemInput = z.infer<typeof itemSchema>`; `convertToBase(value: string, unit: 'g'|'kg'|'ml'|'l'|'unit', baseUnit: 'g'|'ml'|'unit'): Decimal`; tipos compartidos según plan principal.

- [ ] Escribir `converts_units_without_changing_dimension`: `convertToBase('1.250000','kg','g') === '1250.000000'`, ml→g rechaza, exceso de precisión rechaza. `cleaning_cannot_be_recipe_component`: validación rechaza clase cleaning con composición habilitada; packaging sí permite. Las cantidades canónicas no pasan por el parser localizado de formularios.

  ```ts
  expect(convertToBase('1.250000', 'kg', 'g')).toBe('1250.000000');
  expect(() => convertToBase('1.000000', 'ml', 'g')).toThrow();
  ```
- [ ] Ejecutar `node node_modules/vitest/vitest.mjs run tests/items.unit.test.ts`; confirmar fallo por el comportamiento ausente.
- [ ] Crear schema con UUID, código único, nombre, clases exactas del spec, unidad, costo de referencia, `purchasable`, `recipeUsable`, revisión/archivo. `unclassified` sólo mediante transición controlada, no alta ordinaria. Aplicar CHECK cleaning→no recipeUsable. Producción/venta se expresan por relaciones, no flags redundantes.
- [ ] Portar nombres de código a items/itemId y snapshots itemName; conservar datos históricos. Retirar exportaciones antiguas en la misma tarea; una incompatibilidad de contrato HTTP se coordina con adaptador temporal explícito que P5 elimina. No crear segunda tabla de stock para envases.
- [ ] Escribir pruebas de base: código duplicado rechazado, unidad protegida por historial, referencia archivada nueva rechazada, archivo preserva FK y resolución histórica. No ejecutarlas sin autorización.
- [ ] Repetir prueba pura y TypeScript; inspeccionar `rg -n 'ingredients|ingredientId' src` para distinguir referencias aún pendientes y migraciones históricas que deben quedar intactas. Documentar cada compatibilidad temporal, no hacer reemplazo ciego sobre SQL histórico.

## T2. Sucursales, membresías y contexto

**Files:** crear `src/db/branch-schema.ts`, `src/modules/branches/{context,service,validation}.ts`, `src/modules/operations/business-date.ts`; modificar `src/db/auth-schema.ts`, `src/lib/{auth,access}.ts`, `src/db/{sales,preparation,production,inventory}-schema.ts`.
**Test:** `tests/branches.unit.test.ts`, `tests/branches.integration.test.ts`, `tests/branch-access.http.test.ts`.
**Interfaces:** `requireOperationalContext(db: AppDb, actor: Actor, branchId: string): Promise<OperationalContext>`; `requireCatalogManagement(db: AppDb, actor: Actor): Promise<void>`; `businessDate(instant: Date, timeZone: string): string`; `createBranch(db: AppDb, actor: Actor, raw: unknown): Promise<{id: string}>` con validación Zod de código, nombre, zona y ubicaciones iniciales.

- [ ] Escribir prueba pura de fecha en cambio de día por zona; contexto simulado rechaza manager sin membresía y usuario deshabilitado. HTTP con branchId ajeno no llega al servicio comercial. Ejecutar archivos `.unit`/`.http` explícitos y confirmar fallo.

  ```ts
  expect(businessDate(new Date('2026-09-28T02:00:00Z'), 'America/Argentina/Salta')).toBe('2026-09-27');
  ```
- [ ] Crear branches/locations/memberships y permiso global de catálogo. Comprobar sesión, discapacidad global, ámbito y rol antes de construir contexto; nunca confiar en rol/branch del cuerpo. Preservar rol global actual durante transición sin ampliarlo a sucursales nuevas.
- [ ] Añadir branchId al origen de documentos operativos y referencias compuestas en mesas/estaciones/rutas; ubicación de consumo por estación y despacho por sucursal. Constraints destino final son NOT NULL; backfill se prepara en P5, no se ejecuta aquí.
- [ ] Escribir prueba de integración `second_branch_reuses_catalog_with_zero_stock`: crear A y B, mismo item/producto compartido, stock en A no aparece en B; mismo nombre de mesa y coordenadas permitidos entre A/B, no dentro de A. `replay_requires_current_membership` debe rechazar después de revocar acceso.
- [ ] Implementar altas/archivo de sucursal con códigos únicos y controles de saldo/trabajo pendiente. Los permisos globales de catálogo se preservan sólo mediante mapeo explícito de transición.
- [ ] Repetir pruebas permitidas, TypeScript y diff; entregar tabla de cambios de FK a P2 y listado de rutas que deberán adoptar contexto en P5. No afirmar aislamiento demostrado hasta ejecutar pruebas reales de base.
