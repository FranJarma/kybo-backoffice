# Production workspace UX Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Facilitar la planificación y el registro de producción en PC y móvil.

**Architecture:** Reorganizar el cliente existente en pestañas persistentes; reutilizar las API y operaciones actuales. Extraer el selector de preparación y compartir estilos locales entre el gestor y las órdenes del personal.

**Tech Stack:** Next 16, React 19, Radix Tabs, SearchCombobox, CSS Modules, Playwright.

**Spec:** `docs/superpowers/specs/2026-11-03-production-ux-design.md`

## Global Constraints

- Sin migraciones, datos reales, cambios de permisos ni cambios a reservas, recetas, costos, revisión o idempotencia.
- Preparación y responsable usan el Autocomplete compartido.
- Los borradores permanecen al cambiar de pestaña.
- Las cantidades conservan precisión; solo se eliminan ceros finales innecesarios.
- Sin commit ni push en esta etapa.

## Review Focus

- Cambiar de pestaña no descarta cantidades, responsable ni revisión válida del borrador.
- Una operación pendiente o incierta bloquea navegación y nuevas acciones incompatibles.
- El enlace `?recipe=` sigue abriendo una planificación seleccionada.
- El historial diferencia órdenes de lotes, sin esconder órdenes finalizadas ni permitir doble registro.
- En 320 px, nombres largos, unidades y acciones no desbordan; personal conserva solo tareas propias.

### Task 1: Workspace y selección contextual

**Files:** `src/components/production/production-manager.tsx`, new `preparation-picker.tsx`, new `production.module.css`, `tests/e2e/production-workspace.spec.ts`.

**Interfaces:** `PreparationPicker({ initialRecipe?, onChange: (recipe: RecipeDetail | null) => void, disabled? })`; gestor conserva `ProductionManager` props actuales.

- [x] Añadir prueba de navegador del borrador al alternar Órdenes/Registrar lote/Historial y del enlace con receta; comprobar fallo antes de implementar.
- [x] Separar tres pestañas persistentes y trasladar el catálogo a Autocomplete contextual; historial con paginación y estados vacíos claros.
- [x] Comprobar selección de receta, conservación de borrador y navegación de teclado.

### Task 2: Planificación, órdenes y registro de lote

**Files:** `src/components/production/orders-panel.tsx`, `production-manager.tsx`, `production.module.css`, `src/modules/production/queries.ts`, `tests/e2e/production-workspace-review.spec.ts`, `tests/production-result-review.integration.test.ts`.

**Interfaces:** `ProductionOrdersPanel` agrega props opcionales de planificación, scope controlado y aviso de bloqueo al padre; las llamadas del personal conservan sus valores por defecto.

- [x] Mostrar la planificación al solicitarla; autocomplete del responsable, ingredientes fijos legibles y alternativas explícitas.
- [x] Agrupar seguimiento, filtros, estados y acciones; historial en sección distinta. Ocultar paginación innecesaria.
- [x] Ordenar rendimiento/consumos y resumen lateral; cantidades editables con unidad y precisión preservada. Mantener revisión/confirmación y prevención de dobles envíos.
- [x] Verificar el recorrido real en base descartable y el registro desde móvil.

### Task 3: Verificación y entrega

**Files:** resultado en `docs/superpowers/plans/2026-11-03-production-ux-result.md`.

- [x] TypeScript y lint de archivos cambiados; pruebas modernas de producción/consumo/revisión/horarios.
- [x] Navegador y capturas fuera de Git en 1440/1024/768/390/320 px, incluyendo vista de personal.
- [x] Una revisión independiente del diff, corregir problemas importantes y repetir solo verificaciones afectadas.
- [x] Entregar rama y cambios comprobados, sin commit/push.

## Autorización de entrega

El 3 de noviembre de 2026 el usuario autorizó hacer commit y push de las mejoras de producción y de la asignación de horarios por varios días. Esta indicación reemplaza la restricción inicial de commit/push para estos cambios.
