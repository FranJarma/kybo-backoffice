# Compras unificada — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Native execution selected for the existing local checkout; one fresh final review.

**Goal:** Aplicar la propuesta aprobada de Compras unificada, anticipación por insumo y tareas legibles.

**Architecture:** Reusar previsión, pedidos y recepciones existentes; datos estructurados y componentes compartidos de configuración/panel. No alterar el esquema ni las reglas cargadas.

**Tech Stack:** Next 16.3.6, React 19.3, TypeScript, Tailwind, Radix, Drizzle, Vitest y Playwright.

**Spec:** `docs/superpowers/specs/2026-10-23-unified-purchases-design.md`

## Global Constraints

- Sin migraciones, escrituras de negocio reales, cambios a `.env`, commit ni push.
- Encargado/administrador administran reglas; personal conserva solo sus accesos actuales.
- Cantidades base exactas; no convertir gramos/ml a bultos implícitamente.
- Superficies claras, naranja/azul, controles táctiles y 600/768/1024 px.
- Checkout actual `codex/order-pickup` para reflejar la app local; dependencias ya instaladas.

## Review Focus

- Necesidad que cambió al abrir el enlace: recalcular al preparar, sin registrar compra por navegar.
- Presentaciones y cantidades fraccionarias: conservar unidad base y validación de enteros.
- Regla desactivada o sin consumo: no inventar cobertura ni permitir precarga de compra inexistente.
- Fallo de lectura/resultado incierto/cambio de sucursal: conservar bloqueos e idempotencia.
- Documento vinculado e historial: abrir el documento correcto y no ofrecer cancelación de tarea imposible.

### Task 1: Presentación, navegación y lectura estructurada

**Files:** `src/lib/navigation.ts`, `src/modules/supply-alerts/{presentation,suggestions}.ts`, `src/modules/daily-operations/{types,queries}.ts`, páginas anteriores y pruebas unitarias/integración.

**Interfaces:** `purchaseSeed(alerts)` produce `{itemId,itemName,baseUnit,quantity,leadDays}[]` para alertas accionables. `TaskRow.purchaseAlert?` contiene `SupplyAlert`; `DailySnapshot.timeZone?` provee calendario de sucursal. Títulos genéricos sin país, claves persistentes intactas.

- [x] Agregar pruebas RED de menú Inicio/día bajo Negocio y ausencia de acceso separado; necesidades y precarga exacta sin alertas cubiertas/sin consumo; copiar tareas sin país.
- [x] Implementar funciones puras y datos estructurados en snapshot solo para compras sugeridas activas del encargado.
- [x] Correr pruebas unitarias y de lectura afectadas; confirmar permisos e historial.

### Task 2: Configuración en ficha del insumo

**Files:** `src/components/items/purchase-settings.tsx`, `src/components/inventory/supply-policy-editor.tsx`, `src/components/{catalog-page,catalog-manager}.tsx`, pruebas UI de configuración.

**Interfaces:** `ItemPurchaseSettings({itemId,actorId,onBusy?})` reutiliza GET/POST `/api/inventory/supply-alerts` y editor con insumo fijo. `CatalogManager.canManagePurchases` se resuelve en servidor por rol, no por permiso de catálogo.

- [x] Agregar prueba RED de consumo de 150 sin truncar ceros, edición 7+3, objetivo mayor a anticipación y payload con revisión.
- [x] Implementar campos claros y avance calculado; preservar reintento incierto/409; integrar pestaña para item guardado elegible y encargado/admin.
- [x] Verificar teclado, guardado, actualización de regla e independencia del formulario de catálogo.

### Task 3: Espacio de Compras y pedidos precargados

**Files:** `src/components/inventory/{purchases-workspace,purchase-needs,purchase-orders-manager,purchase-order-editor,purchases-manager}.tsx`, `src/components/ui/operation-panel.tsx`, página Compras, pruebas procurement/supply UI.

**Interfaces:** workspace recibe `initialOrderId?`, `initialItemId?`; navegación de tarea usa item y relee previsión vigente. `PurchaseOrderEditor.initialLines?` consume seeds exactos. Solo componente activo monta hooks de mutación.

- [x] Escribir pruebas RED de necesidades → seleccionar varios → preparar borrador; enlace directo a pedido existente y a necesidad; recepción parcial intacta.
- [x] Implementar encabezado/tabs, listado adaptable y panel de cálculo; usar editor común por insumo. Habilitar paneles para preparación/detalle y mantener avisos de estado incierto dentro del panel.
- [x] Pasar suite procurement/supply UI en tres tamaños y verificar ninguna escritura al navegar.

### Task 4: Nuevo diseño de tareas y revisión final

**Files:** `src/components/daily-operations/{task-list,task-detail,manager}.tsx`, pruebas daily UI, documentación de resultado.

**Interfaces:** consume DTO y panel de Tasks 1/3; conserva callbacks de asignación, reconciliación y comandos. Compra sugerida enlaza `?item=...`; documento vinculado enlaza `?order=...`.

- [x] Pruebas RED para cálculo oculto, unidades/fechas humanas, acción correcta por documento y ausencia de cancelar tarea de pedido vinculado.
- [x] Aplicar panel con acción principal fija y detalles secundarios; conservar acciones existentes y bloqueos.
- [x] Correr tipos, lint de fuentes tocadas, pruebas afectadas, UI responsive y build; revisión fresca de diff completo; corregir defectos con regresiones.
- [x] Documentar resultado, abrir Compras real local y dejar cambios sin commit/push para probar.
