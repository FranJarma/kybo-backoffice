# Catálogo: costos en lote y precios por canal

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cargar el costo estimado con menos consultas y presentar los tres precios de venta en una columna legible.

**Architecture:** Mantener las reglas de costo existentes y la lectura consistente por sucursal. Un lector en lote obtiene únicamente las versiones publicadas, composiciones y modificadores necesarios para costear todos los productos del lote. El cliente reutiliza resultados durante el montaje y entrega progresivamente los lotes, sin recalcular por interacciones del formulario.

**Tech Stack:** Next 16, React 19, Drizzle PostgreSQL, Vitest, Playwright.

**Spec:** Solicitud del usuario del 20/10/2026: costo lento en Catálogo y precios; columna Precios con Mostrador gris, Pedidos Ya rojo tenue y Uber Eats negro.

## Global Constraints

- Preservar cambios locales y .env. Sin commits, push ni migraciones de desarrollo.
- Conservar precisión, merma, versiones publicadas, stock/referencia/preparaciones, rango de variantes y aislamiento por sucursal.
- No guardar costos financieros en una caché global ni en localStorage.
- Los precios del catálogo son finales; ausencia de precio no significa cero.

## Review Focus

- Modificadores heredados y reemplazos: mismo costo y recargo que la lectura anterior.
- Recetas antiguas y preparaciones anidadas: no cambiar cantidades ni mermas.
- Cambios de sucursal o generación: no reutilizar costos ajenos ni resultados de solicitudes anteriores.
- Precio cero y precio ausente: deben mostrarse distintos en escritorio y móvil.
- Muchos productos y grupos compartidos: lecturas agrupadas y actualización visual sin esperar todos los lotes.

## Task 1 — Costos en lote

- [x] Medir consultas del camino actual con conexión de solo lectura o fixtures descartables.
- [x] Agregar regresión que compare los costos y acote la cantidad de lecturas para varias recetas con modificadores.
- [x] Implementar lector de configuraciones en lote sin historiales, y usarlo en catalogProductCosts conservando el cálculo.
- [x] Ampliar el lote de resumen a 50 productos; limitar detalle/rentabilidad a 10. Entregar resultados de lotes completos mientras continúan los demás.
- [x] Verificar ramas, rangos, referencias, instrucciones, herencia/reemplazos, combos y caché de montaje.

## Task 2 — Precios por canal

- [x] Reemplazar columna por Precios y reutilizar un componente con tres filas de ícono, nombre e importe.
- [x] Usar Store gris, Bike rojo tenue y Utensils negro; indicar Sin precio cuando falte.
- [x] Actualizar el flujo de navegador y revisar escritorio/móvil, conservación del borrador y ausencia de nuevas consultas por interacción.
- [x] Revisar tipos, lint, resultados, mediciones y diff. Revisión final independiente del alcance.
