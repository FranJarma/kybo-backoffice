# Alertas de Bolivia — plan

> **For agentic workers:** Use superpowers:executing-plans inline. Una revisión independiente al terminar.

**Goal:** Detectar compras con plazo7+margen3 y urgencia explicable.
**Architecture:** Políticas separadas de reposición, motor FEFO puro, tareas existentes.
**Tech Stack:** Next.js instalado, Drizzle/PostgreSQL, BigInt, Vitest/PGlite, Playwright.
**Spec:** `docs/superpowers/specs/2026-10-23-bolivia-alerts-design.md`.

## Global Constraints

No modificar stock, proveedores, pagos, .env o compras reales. Migración Neon con
autorización específica; integración solo en memoria. Configuración manager-only,
revisiones e idempotencia. Cantidades de seis decimales y días corridos.

## Review Focus

Vencimientos previos al consumo; reservas de traslado interno; tasas cero/vacías;
ausencia de migración; duplicación con compras genéricas y pérdida de asignación.

## Task 1: políticas y cobertura

- [x] Tests RED para umbrales7/10, FEFO, tasa vacía/cero, redondeo y fechas.
- [x] Implementar `supply-alerts/{types,engine}.ts`, esquema y migración0026.
- [x] Servicio auditado `saveSupplyPolicy` y snapshot manager-only, protegido ante
      migración pendiente; incluir reservas internas por lote una sola vez.
- [x] Tests de integración con dos ubicaciones, reglas, replay y permisos.
      Expected: pruebas nuevas verdes y stock intacto.

## Task 2: tareas y configuración

- [x] Tests RED de conciliación, deduplicación, orden por urgencia y vencimiento.
- [x] Integrar sugerencias en `daily-operations/read-suggestions.ts`, actualizar
      dueAt en conciliación y enriquecer detalle de compra sin nuevos estados falsos.
- [x] UI `/inventory/supply-alerts` con edición, cobertura y enlaces de Inventario
      y Operación del día; API GET/POST con CSRF y permisos. Expected: pruebas HTTP y
      navegador tablet verdes; sin controles de administración para staff.

## Task 3: revisión y activación

- [x] Tipos, formato, lint focalizado y regresiones afectadas; revisión independiente.
- [x] Preparar migración exacta, manifiesto de ocho reglas y lectura previa de Neon.
- [x] Solicitar permiso concreto para0026 cuando el resultado esté revisable.
- [x] Si autorizado: aplicar solo0026, guardar reglas auditadas, conciliar y verificar
      valores/urgencias, sin stock modificado. Commit/push según autorización vigente.
