# Toma de pedidos rápida Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Una revisión final independiente; sin commit ni push.

**Goal:** Reducir interacciones al tomar pedidos mediante cliente en línea y localizador automático.

**Architecture:** Extender el Autocomplete compartido con creación opcional al confirmar texto. Registrar clientes y asignar equipos dentro de la transacción de venta existente; mantener payloads anteriores compatibles.

**Tech Stack:** Next 16, React 19, TypeScript, Drizzle PostgreSQL/PGlite, Playwright y Vitest existentes.

**Spec:** `docs/superpowers/specs/2026-10-24-pos-order-entry-design.md`.

## Global Constraints

Sin migraciones ni datos ficticios en Neon, sin commit ni push. Mantener cambios previos de Compras y de rendimiento. Selectores buscables usan `SearchCombobox`, nunca input separado de select.

## Review Focus

Coincidencias exactas frente a homónimos y email inválido; texto sin seleccionar y respuestas de búsqueda tardías; disponibilidad desconocida y cambios durante el cobro; reintentos del mismo envío sin clientes/pagos duplicados; disposición y accesibilidad en tablet vertical y horizontal.

### Task 1: Cliente y localizador dentro de la venta

- [x] Escribir y observar fallar pruebas de alta, reutilización, rollback, permisos de personal y asignación automática sin equipos duplicados.
- [x] Ampliar `sales/validation.ts`, implementar resolución de clientes y asignación automática en `pickup/service.ts`; conectarlos en `sales/service.ts` manteniendo el serializador y la huella de inputs anteriores.
- [x] Ejecutar pruebas de ventas y localizadores en PGlite descartable.

### Task 2: Interacción en línea y composición visual

- [x] Escribir y observar fallar pruebas UI de Autocomplete sin modal, nombre y email opcional, localizador automático/cambio manual, grupos y tablet.
- [x] Extender `ui/search-combobox.tsx` de forma compatible, sustituir `sales/customer-picker.tsx`, ajustar `pickup/locator-picker.tsx` y el encabezado de `sales/sales-manager.tsx`.
- [x] Guardar la preferencia permanente de Autocomplete en `AGENTS.md`.
- [x] Verificar UI con APIs simuladas en 600, 768 y 1024 px y guardar captura para inspección.

### Task 3: Verificación y revisión

- [x] Revisar impacto en el presupuesto de cobro y ejecutar tipos, lint y suites afectadas.
- [x] Revisión independiente de identidad de clientes, concurrencia de equipos, reintentos y accesibilidad; corregir hallazgos importantes y registrar resultados.
