# Modelo de datos de Kybo — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementar artículos, inventario por sucursal/ubicación y consumo al finalizar preparación, preservando historial.

**Architecture:** Catálogo físico compartido, productos comerciales versionados y operaciones con ámbito de sucursal. Un núcleo transaccional gestiona movimientos, saldos y reservas; ventas, producción y transferencias lo consumen. Se divide en cinco planes dependientes y verificables; ninguna etapa incompleta se despliega a la instalación activa.

**Tech Stack:** Node >=24, TypeScript 6.0.3, Next.js 16.3.6, PostgreSQL, Drizzle 0.45.3, Zod 4.6.5, Vitest 5.0.1 y Playwright 1.63.0 existentes; conservar pnpm.

**Spec:** `docs/superpowers/specs/2026-09-28-data-model-design.md`.

## Global Constraints

- No ejecutar migraciones, commits ni push. No editar `.env` ni el cambio local en `scripts/create-user.ts`.
- Conservar UUID, documentos históricos y migraciones 0000–0006 con sus snapshots.
- Reservar al confirmar; consumir al terminar; entregar preparado no vuelve a consumir.
- Reventa: salida al entregar; producción: consumo y entrada al finalizar el lote.
- Catálogo y precios por canal compartidos; cantidades por ubicación, valoración por artículo-sucursal.
- Un solo negocio con varias sucursales; no diseñar empresas independientes ni ventas offline.
- Decimales exactos; `null` es costo desconocido, cero es explícito. Prohibir stock negativo.
- Consultar `node_modules/next/dist/docs/` antes de escribir rutas, layouts o componentes Next.js.
- Cada plan hereda estas restricciones. Ejemplos con letras son identificadores lógicos de fixtures; usar UUID válidos al escribir pruebas.
- No ejecutar `npm test`/`pnpm test` indiscriminadamente: las suites existentes preparan bases con migraciones.
- Las pruebas de integración y sus fixtures pueden escribirse, pero su ejecución queda pendiente de autorización para una base desechable. No sustituir migraciones por DDL manual para eludir esa restricción.
- La aprobación de este plan autoriza implementación de código, no aplicación de SQL, ensayos de migración ni despliegue.

## Review Focus

1. Otro usuario intenta repetir una operación por requestId: no recibe datos fuera de su alcance (P1-T2, P2-T1).
2. Un lote reservado vence o se bloquea antes de marcar lista: no se consume silenciosamente ni se libera demanda incorrectamente (P2-T2, P4-T1).
3. Dos cajas intentan reservar el último saldo: sólo una confirma y la otra no deja cobro/pedido parcial (P3-T2).
4. Cancelación mientras otra persona marca lista: una sola resolución física, sin doble devolución o descuento (P4-T1/T2).
5. Se abre otra sucursal después de años de datos: catálogo e historial intactos, saldo inicial cero, aislamiento real (P1-T2, P5-T2).

## Etapas y archivos del plan

| Orden | Plan | Entrega verificable |
| --- | --- | --- |
| P1 | [Artículos y sucursales](2026-09-28-data-model-01-foundations.md) | Artículos, ámbito y permisos con contratos explícitos |
| P2 | [Inventario](2026-09-28-data-model-02-inventory.md) | Lotes por ubicación, núcleo de movimientos, reservas y traslados |
| P3 | [Ventas](2026-09-28-data-model-03-sales.md) | Suministro comercial y confirmación con reservas |
| P4 | [Preparación y producción](2026-09-28-data-model-04-fulfillment.md) | Finalización, cancelación, reventa y producción |
| P5 | [Integración y transición](2026-09-28-data-model-05-transition.md) | Contratos HTTP/UI, transición, conciliación y aceptación |

La separación reduce el tamaño de revisión; P2 usa P1, P3 usa P1/P2, P4 usa P1–P3 y P5 integra todas. No despachar implementaciones simultáneas sobre schemas compartidos. Cada etapa compila y tiene pruebas propias; eso no significa que pueda activarse por separado en producción.

## Contratos compartidos

Crear `src/db/types.ts`: exportar `Tx = Parameters<Parameters<AppDb['transaction']>[0]>[0]`; reutilizar `AppDb` de `src/db/client.ts`. Retirar la dependencia circular que supone importar el tipo Tx desde un servicio de inventario.

Crear `src/modules/operations/types.ts`:

```ts
export type Decimal = string; // normalizado, punto decimal; frontera HTTP valida con Zod
export type OperationalContext = {
  actorId: string; branchId: string; timeZone: string;
  role: 'admin' | 'manager' | 'staff';
};
export type CommandMeta = { requestId: string; expectedRevision?: number };
export type OperationResult = { operationId: string; revision: number; replayed: boolean };
export type StockAllocation = {
  itemId: string; lotId: string; locationId: string; quantity: Decimal;
};
export type StockOrigin =
  | { kind: 'receipt'; receiptId: string }
  | { kind: 'sale'; saleLineId: string }
  | { kind: 'production'; productionOrderId: string }
  | { kind: 'transfer'; transferId: string }
  | { kind: 'adjustment'; adjustmentId: string }
  | { kind: 'internal_use'; internalUseId: string }
  | { kind: 'return'; returnId: string };
```

Estos tipos no validan autorización por sí solos. Contexto sólo se construye después de comprobar sesión y membresía. `StockOrigin` se persiste mediante FK concretas y exclusividad de origen; no sólo JSON.

Los servicios de escritura compuestos reciben `Tx`: jamás abren una segunda transacción dentro de la operación principal. Métodos HTTP inician la transacción una vez. Fechas operativas usan la zona del contexto; timestamps permanecen UTC.

Una sola operación raíz reclama el requestId. Cuando reserveStock/postMovement/settleReservation participan de un comando compuesto, comparten su identidad persistida y no reclaman nuevamente la clave. Pasar esa identidad mediante el contexto transaccional de `src/modules/inventory/operations.ts`; distinguir la marca de fase interna de una nueva petición externa.

## Estrategia de pruebas y ejecución

- Pruebas puras nuevas: sufijo `.unit.test.ts`; HTTP con dependencias simuladas: `.http.test.ts`. Comandos de cada tarea nombran archivos explícitos.
- Pruebas con base: sufijo `.integration.test.ts`; PostgreSQL concurrente: `.concurrency.test.ts`. Se escriben pero no se ejecutan todavía. Sus helpers rechazan una configuración sin permiso de pruebas explícitamente habilitado, nunca toman `DATABASE_URL` como fallback.
- Sin autorización de migraciones, reportar por separado pruebas puras aprobadas y garantías de base pendientes. No declarar completo el proyecto con esa brecha.
- Por tarea: prueba que demuestra el comportamiento faltante, ejecución permitida, implementación mínima, repetición y revisión del diff. No agregar commits a esta secuencia.
- Verificación estática: `node node_modules/typescript/bin/tsc --noEmit`, `node node_modules/eslint/bin/eslint.js .`, `git -c core.safecrlf=false diff --check`.
- Build: `node node_modules/next/dist/bin/next build --webpack`, con variables del proceso de prueba que impidan usar la base real; preservar archivos generados y no escribir `.env`.

## Preparación de ejecución

- [ ] Leer spec y cinco planes antes de editar producto; registrar huellas de `.env`, `scripts/create-user.ts`, HEAD y archivos con cambios locales sin imprimir secretos.
- [ ] Guardar un respaldo fuera del diff de los archivos que se modificarán. No usar reset, checkout masivo ni stashes destructivos. Si se necesita aislamiento, resolver un checkout que incluya la entrega 0.6.0-rc.1 no confirmada; partir sólo de HEAD perdería esa base.
- [ ] Identificar nuevos cambios del usuario desde la planificación y reconciliarlos antes de editar.
- [ ] Implementar etapas secuencialmente y mantener un registro de pruebas reales en `docs/verification-data-model.md`.
- [ ] Solicitar por separado los datos de transición y autorización de ensayo en una base dedicada cuando los artefactos estén listos para revisar.

## Cobertura y revisión del plan

Spec 1–4 → P1/P3; spec 5 → P2; spec 6 → P3/P4; spec 7–8 → P2/P4; spec 9–10 → P2 y pruebas concurrentes P3/P4; spec 11 → P5; spec 12–13 → todos y aceptación P5.
Extensibilidad → P1, ámbito de datos P2–P4 y prueba de alta de segunda sucursal P5.

Auto-revisión: 13 tareas con 80 pasos de implementación/prueba más preparación global;
contratos compartidos definidos y consumidos por dependencia. Se corrigieron el
riesgo de reclamar requestId dos veces en un comando compuesto y el orden de
expand/backfill/finalize. Los datos privados para transición permanecen como entrada
operativa pendiente, no como valores inventados. Los tests de base están especificados,
no ejecutados ni aprobados.

La navegación/Breadcrumb tiene especificación separada pausada y no se incluye como modificación adicional en estos planes. Primero actualizar esa especificación con el vocabulario de artículos que resulte de esta implementación.

**Estado:** plan preparado, pendiente de revisión y selección del método de ejecución. Recomendación: ejecución en esta conversación, secuencial, con revisión independiente al cerrar; las interfaces y transacciones están fuertemente relacionadas.
