# Menú lateral colapsable — Implementation Plan

> **For agentic workers:** Ejecutar inline con superpowers:executing-plans, en el checkout actual para preservar los cambios autorizados de navegación y reflejarlos en la app abierta.

**Goal:** Liberar espacio horizontal mediante un menú de íconos reversible y persistente.

**Architecture:** Preferencia de ancho compartida con `useSyncExternalStore`, navegación completa en el drawer y compacta solo en el aside de escritorio de AppShell. Cookie de interfaz inicializada desde ambos layouts del servidor. Tooltips Radix y controles existentes.

**Tech Stack:** Next.js instalado, React, Radix UI, Tailwind, Playwright y Vitest.

**Spec:** `docs/superpowers/specs/2026-10-27-collapsible-sidebar-design.md`.

## Global Constraints

- Preservar nombres, rutas, permisos, formulario en curso y menú móvil/POS.
- Sin dependencias nuevas, migraciones, datos reales, commit ni push.

## Review Focus

- Colapsar debe aumentar el ancho útil y conservar el contenido de la página.
- Íconos con nombres accesibles y ayudas de mouse/teclado; controles alcanzables con navegación extensa.
- Restaurar el modo inicial desde el servidor y tolerar valores de cookie inválidos.
- El drawer permanece completo al usar una preferencia compacta; rotación conserva foco y acceso.
- El POS sigue aprovechando todo el ancho, y cerrar sesión conserva su feedback y protección de repetición.

## Tarea única: menú compacto, persistencia y regresiones

Archivos: `src/components/app-shell.tsx`, `src/lib/sidebar-preference.ts`, layouts `(operations)` y `(selling)`, pruebas `tests/helpers/sidebar-ui.tsx`, `tests/e2e/sidebar.spec.ts` y las pruebas existentes de navegación/layout.

- [x] Crear fixture de AppShell real con navegación/servicios simulados; comprobar RED del botón y reducción del ancho.
- [x] Implementar botón, rail de íconos, tooltips y pie compacto; mantener el drawer completo.
- [x] Leer la cookie desde ambos layouts y escribirla solo al cambiar la preferencia.
- [x] Verificar ancho, conservación del formulario, nombres/foco, persistencia/recarga, móvil, rotación, POS y cierre de sesión.
- [x] Ejecutar pruebas afectadas, lint/tipos e inspección visual. Registrar evidencia y dejar sin commit/push.

## Resultado

- RED comprobado por ausencia del botón y del prop de preferencia en los layouts. También se reprodujeron el estado antiguo al remontar un layout (264 px en lugar de 72) y el recorte del enlace activo (ratio visible 0,8125).
- 10 pruebas de navegador aprobadas, con AppShell real y navegación/servicios simulados. Cubren espacio útil sin perder el formulario, recarga, layouts con props antiguos, visibilidad activa sin desplazar la página, tooltips por mouse/teclado, móvil, rotación, POS, error al salir y cookies bloqueadas. La prueba de caché reproduce un remonte con props antiguos; no ejecuta el Router real de Next. Evidencia: `.next-e2e/sidebar-ui-final.log`.
- 18 pruebas unitarias aprobadas en tres archivos de navegación/render/layout. Los layouts usan la cookie para el snapshot inicial, con valores válidos, ausentes e inválidos. Evidencia: `.next-e2e/sidebar-unit-final.log`.
- ESLint y TypeScript (`--noEmit --incremental false`) aprobados. Evidencia: `.next-e2e/sidebar-lint-final.log` y `.next-e2e/sidebar-types-final.log`.
- Inspección visual en 1440 y 1024 px: `.next-e2e/sidebar-collapsed-1440.png` y `.next-e2e/sidebar-collapsed-1024.png`.
- Revisión independiente: corregido un P2 de restauración entre áreas mediante la preferencia compartida. Segunda revisión sin hallazgos accionables.

Se mantuvieron los cuatro archivos modificados previamente por los nombres de inventario. No se modificaron datos de negocio, `.env`, configuración de TypeScript ni migraciones. La implementación se entregó inicialmente sin staging, commit ni push.

## Publicación autorizada

El usuario pidió hacer commit y push de los nombres de inventario y el sidebar colapsable en `codex/order-pickup`. Los nombres quedan como «Stock actual» e «Insumos y artículos»; «Inventario y compras» se conserva para el grupo. Se incluyen los títulos y la referencia desde Recetas.

Antes de publicar se repitieron las 10 pruebas de navegador y las 18 unitarias del alcance, además de ESLint de todos los archivos TypeScript modificados y la comprobación TypeScript sin emisión. Todas aprobaron. Evidencia local: `.next-e2e/sidebar-commit-ui.log`, `sidebar-commit-unit.log`, `sidebar-commit-lint.log` y `sidebar-commit-types.log` en el mismo directorio.

Después de publicar, se creará la rama local `codex/cash-register` desde ese mismo commit para continuar con apertura/cierre de caja, gastos diarios y pagos vinculados. Este cambio de rama no implementa ni modifica aún el circuito de caja.
