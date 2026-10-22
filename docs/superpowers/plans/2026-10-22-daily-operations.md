# Operación del día — plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement each approved stage task-by-task. Steps use checkbox (`- [ ]`) syntax. Do not execute this draft until the user reviews the design and selects an execution method.

**Goal:** Centralizar tareas por urgencia y responsable, conteos, abastecimiento y capacidad de producción por sucursal.

**Architecture:** Tablero coordinador sobre los documentos y el libro de inventario existentes. Cuatro entregas independientes con contratos explícitos; los motores calculan sugerencias y los comandos transaccionales ejecutan operaciones reales.

**Tech Stack:** Next.js instalado (16.3.6 al revisar), React, TypeScript, Drizzle/PostgreSQL, Zod, Vitest/PGlite y Playwright. Sin dependencias nuevas previstas.

**Spec:** [Diseño](../specs/2026-10-22-daily-operations-design.md).

## Global Constraints

- Sin commit ni push. No implementar en esta entrega de planificación.
- No modificar datos reales ni `.env`; las migraciones nuevas requieren autorización específica antes de aplicarlas a la base configurada.
- Conservar todos los cambios existentes sin commit. Verificar el estado inicial al comenzar cada entrega; no usar reset/clean.
- Leer documentación pertinente de `node_modules/next/dist/docs/` antes de escribir rutas o componentes.
- Stock se modifica exclusivamente por comandos del dominio y ledger existentes; sugerencias y GET no escriben.
- Membresía, sucursal y asignación se verifican antes de ejecutar y de devolver un replay.
- 7 días de plazo + 3 de margen para artículos Bolivia seleccionados; 10 días activa aviso. Días corridos, configurable.
- Cantidades canónicas con seis decimales y BigInt; dinero conserva utilidades actuales.
- Táctil: 48×48 px; acción principal 56 px. Pruebas 600×960, 768×1024, 1024×768.
- Claves de idempotencia + revisiones + unicidad de necesidad/documento. No transacciones anidadas.
- Fuera de alcance: enviar a proveedores, scheduler instalado, notificaciones externas, predicciones ML.

## Review Focus

1. Reasignación o revocación entre comando y replay: etapa 1/T2 debe rechazar al responsable anterior.
2. Dos pantallas crean o actualizan la misma necesidad: etapa 1/T3 verifica unicidad; PostgreSQL real requiere entorno autorizado.
3. Ventas/recepciones/reservas durante el conteo: etapa 2/T2–T3 exige recuento y cero movimientos parciales.
4. Entrada atrasada, parcial o sin ETA: etapa 3/T2–T3 no duplica stock ni oculta quiebre anterior a la llegada.
5. Ingredientes compartidos, modificadores y merma: etapa 4/T1–T2 compara capacidad con composición real; no suma capacidades independientes.

## Orden y entregables

| Etapa | Entregable usable | Dependencias |
|---|---|---|
| [1. Tablero y tareas](2026-10-22-daily-operations-01-board.md) | Responsables, urgencia básica, tareas vinculadas a producción/traslados y stock por ubicación | Base actual con 0024 y cambios previos |
| [2. Conteos](2026-10-22-daily-operations-02-counts.md) | Apertura/cierre de críticos y semanal, revisión y conciliación | Etapa 1 |
| [3. Abastecimiento](2026-10-22-daily-operations-03-supply.md) | Compras pendientes, cobertura y anticipación Bolivia | Etapa 1; usar conteos de etapa 2 para mejorar confianza |
| [4. Rendimientos](2026-10-22-daily-operations-04-capacity.md) | Insumo → unidades y preparables ahora, limitantes e historial de rendimiento real | Etapa 1; composición actual |

La implementación es secuencial por defecto, en el orden de la tabla. Cada etapa se entrega probada y se revisa antes de activar la siguiente; ningún botón de una función pendiente aparenta estar funcionando.

## Protocolo común de cada tarea

- [ ] Leer diseño y archivo de plan de la etapa; comprobar archivos y firmas actuales antes de editar.
- [ ] Escribir los casos concretos indicados; ejecutar y comprobar fallo por la función ausente o comportamiento incompleto.
- [ ] Implementar el contrato mínimo, conservando interfaces actuales salvo cambios enumerados.
- [ ] Ejecutar casos nuevos y regresiones indicadas; resolver fallos antes de continuar.
- [ ] Revisar diff y documentar evidencia. No hacer commit ni push aunque la skill tenga ese paso por defecto.

Pruebas sin datos reales. Para integración, `KYBO_ALLOW_TEST_MIGRATIONS=disposable-only` en el proceso y fixture PGlite en memoria sin `directory`. Usar `TEMP`/`TMP` en `.next-e2e/pickup-test-temp` si Windows lo requiere; no escribir sobre `.env`. Si se necesita PostgreSQL real, crear un plan verificable de destino descartable y solicitar autorización específica.

Comprobación final por etapa: `pnpm typecheck`; ESLint sobre archivos modificados; tests indicados; Playwright de la etapa. El lint global incluye artefactos preexistentes en `.local`, por lo que no sustituye la revisión del alcance. Build al integrar la pantalla completa, sin migrar al arrancar. No repetir suites ya verdes sin cambios que lo justifiquen.

## Handoff

Diseño y cuatro planes preparados para revisión, no aprobados automáticamente por existir. Recomendación de ejecución futura: por etapas en este chat, con revisión independiente al cerrar cada etapa; decidir modalidad con el usuario antes de ejecutar. No se han creado tareas en otros chats, aplicado migraciones ni programado automatizaciones.
