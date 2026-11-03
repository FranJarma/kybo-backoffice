# Asignación por período Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Asignar turnos por varios días o semanas con una confirmación, conservando lo existente e informando omisiones.

**Architecture:** Rango y días se expanden con una regla compartida. Un planificador de servidor produce la vista previa y se reutiliza al confirmar bajo los bloqueos actuales de Asistencia; asignaciones y auditoría se insertan en grupo. El formulario independiente usa el Autocomplete y Drawer existentes, invalida revisiones al editar y muestra el resultado real.

**Tech Stack:** Next.js 16, React 19, TypeScript, Zod, Drizzle/PostgreSQL, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-11-03-attendance-period-design.md`.

## Global Constraints

- Hasta 90 días por operación, sin recurrencias indefinidas ni migraciones.
- Encargado/administrador y participantes personales habilitados; no ampliar acceso de la cuenta del local.
- Conservar horarios, francos, fichajes y superposiciones. Confirmación idempotente y revalidada, con resultado de cada fecha.
- Reutilizar `src/components/ui/search-combobox.tsx` mediante `Relation`; sin búsqueda y selector separados.
- No commit/push, .env ni pruebas que escriban en Neon. Mantener localhost:3000 real.

## Review Focus

- Un turno nocturno que comienza el día anterior ocupa tiempo del primer día del período: prueba de omisión por intervalo.
- Otro encargado asigna un día tras la vista previa: prueba de revalidación y resultado final distinto.
- Un turno cambia o se desactiva tras revisar: rechazar la confirmación y exigir otra revisión.
- Una respuesta llega después de editar/cerrar el formulario: prueba de cancelación e invalidación de vista previa.
- Respuesta perdida o doble clic: replay del mismo requestId no crea más horarios y el resultado no permite confirmar otra vez.

## Task 1: Planificador y confirmación agrupada

**Files:** Create `src/modules/attendance/period.ts`, `src/modules/attendance/period-planning.ts`, `src/app/api/attendance/schedule-preview/route.ts`; modify `validation.ts`, `scheduling.ts`, `service.ts`; tests `tests/attendance-period.integration.test.ts`, `tests/attendance-period.test.ts`.

**Interfaces:** `schedulePeriodDates({from,to,weekdays}): string[]`; schema `assignPeriodSchema` con action/userId/shiftId/from/to/weekdays/expectedShiftRevision; `previewAssignmentPeriod(db,actor,raw): Promise<AssignmentPeriodPreview>`. Acción `assignPeriod` devuelve id, created, skipped y rows con fecha, estado y motivo.

- [x] Escribir pruebas RED: expansión, validación, omisiones, nocturnos, participantes/permisos, turno cambiado, concurrencia y replay.
- [x] Ejecutar y observar fallos antes de implementar.
- [x] Implementar planificador, endpoint de lectura protegido y acción agrupada con auditoría en la transacción existente. Incorporar `assignPeriod` a la comprobación de participantes y usar el bloqueo del usuario existente.
- [x] Ejecutar pruebas nuevas y regresiones de planificación y HTTP.

## Task 2: Carga y revisión visual

**Files:** Create `src/components/attendance/assignment-period-form.tsx`; modify `planning.tsx`, `manager.tsx`, `shared.tsx`, `attendance.css`; test `tests/e2e/attendance-period.spec.ts`.

**Interfaces:** `AssignmentPeriodForm({data,busy,command,onClose})`; petición privada POST `/api/attendance/schedule-preview` con los campos de período, sin requestId; confirmación vía `command({action:'assignPeriod',...,expectedShiftRevision})`.

- [x] Escribir y observar la prueba RED del flujo semanal: selección, revisión, conservación de ocupados, resultado y edición individual.
- [x] Añadir la acción y el formulario con fechas, días seleccionables, turno/pausa, vista previa y resultado final. Invalidar/cancelar consultas al editar; al 409 exigir revisión nueva.
- [x] Probar varias semanas, atajos, error de consulta y respuesta demorada tras editar. Revisar desktop y celular.

## Task 3: Verificación y entrega

- [x] Ejecutar pruebas pertinentes, TypeScript, lint focalizado, formato y diff check.
- [x] Una revisión independiente enfocada en los archivos nuevos de Asistencia; los cambios previos de Producción ya fueron revisados. Corregir hallazgos relevantes con reproducción y prueba.
- [x] Detener solo el servidor descartable, restaurar los archivos regenerados por pruebas y comprobar localhost:3000. Conservar rama y cambios sin commit/push.

## Resultado

30 pruebas de reglas/integración/HTTP y cuatro recorridos de navegador pasaron. TypeScript, lint focalizado sin advertencias, formato y diff check correctos. Revisión independiente sin hallazgos críticos o importantes. Revisadas vistas de 1440, 768, 390 y 320 px, sin desbordamientos ni errores de navegador. Las pruebas usaron bases descartables y el servidor de pruebas fue detenido. Sin migraciones, cambios de datos reales, commit ni push.

## Autorización de entrega

El 3 de noviembre de 2026 el usuario autorizó hacer commit y push de las mejoras de producción y de la asignación de horarios por varios días. Esta indicación reemplaza la restricción inicial de commit/push para estos cambios.
