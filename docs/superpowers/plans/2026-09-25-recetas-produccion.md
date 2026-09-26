# Recetas y producción — plan

Spec: docs/superpowers/specs/2026-09-25-recetas-produccion.md
Base: 7a7dc73. Ejecución inline con Superpowers y una revisión independiente final.

## Global Constraints

Mantener inventario/auditoría/autenticación existentes. Decimales exactos. No datos ficticios en producción. Precios faltantes permanecen nulos. No publicar ni conectar servicios externos. Mantener tokens UI aprobados.

### Task 1: Recetas versionadas

Files: db/recipe-schema.ts, modules/recipes/*, tests/recipes.test.ts, catalog/service.ts, drizzle/*.
Interfaces: save/get/list/cost, versiones y opciones inmutables, helper compartido de transacciones de inventario.
1. Escribir pruebas de versiones, reintentos, alternativas, costos desconocidos/cero, ciclos y unidad base; ejecutar. Expected: falla por servicio ausente.
2. Implementar tablas y migración, validación, servicio y guardia de unidad base. Expected: pruebas verdes y typecheck.
3. Ejecutar suite y commit. Expected: sin regresiones.

### Task 2: Producción transaccional

Files: db/production-schema.ts, modules/production/*, inventory/service.ts/types.ts, tests/production.test.ts, drizzle/*.
Interfaces: usa versiones/opciones de Task 1; preview/record/list/get; movimientos production_in/out.
1. Escribir pruebas FEFO, faltantes, costos/rendimientos, idempotencia, vista previa obsoleta e historial. Expected: falla sin servicio.
2. Implementar vista previa y confirmación atómica, fechas, lotes, auditoría, valuación y movimientos.
3. Ejecutar suite, typecheck y commit. Expected: verde.

### Task 3: Pantallas y API

Files: app/api/recipes/*, app/api/production/*, app/(operations)/recipes/page.tsx, app/(operations)/production/page.tsx, components/recipes/*, components/production/*, app-shell, inventory/shared.tsx, tests/e2e/recipes-production.spec.ts.
Interfaces: consume servicios de Tasks 1/2; extiende reintentos de useOperation; respeta guardias HTTP.
1. Añadir flujo E2E de edición de receta y producción; ejecutar. Expected: rutas ausentes.
2. Implementar UI accesible, API, navegación, recuperación y etiquetas del inventario.
3. Verificar E2E, móvil, capturas, lint, build y suite. Expected: rutas utilizables, sin overflow ni regresiones.

### Task 4: Revisar y entregar

Revisión fresca de toda la rama; corregir problemas importantes con prueba de regresión. Actualizar README y registro de verificación, incrementar versión, empaquetar fuente y guardar nueva versión del ZIP existente. Expected: archivo descargable y límites claros.

## Review Focus

Verificar orden de bloqueos y consistencia entre recetas, catálogo y stock; alternativas y dependencias cíclicas concurrentes; ingredientes repetidos; costos nulos y redondeo al agotar stock; reintentos después de cambiar receta o día; UI con respuestas tardías; autorización y confirmación de vistas previas obsoletas. PGlite no prueba intercalados de múltiples conexiones PostgreSQL: no afirmar validación productiva en Neon.
