# Comprobante del posnet por cobro — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement task-by-task. The user requested adding the receipt number to the existing checkout; continue in the prepared branch without another approval pause. No commits or pushes.

**Goal:** Registrar el número del ticket del posnet al confirmar cada cobro local con tarjeta.

**Architecture:** Reutilizar `sale_payments.reference`, que ya se guarda transaccionalmente y se copia al movimiento de Caja. Validar la obligatoriedad usando el tipo real del medio de pago en `preparePayments`; mostrar el campo directamente en PaymentDialog y etiquetarlo en el detalle de venta.

**Tech Stack:** React 19, Next 16, Zod, Drizzle/PostgreSQL, Vitest/PGlite y Playwright.

**Spec:** Aclaración del usuario del 27/10/2026: las empleadas cobran primero en el posnet, imprimen su ticket y luego confirman la venta en la app; el dato solicitado es el número de comprobante individual. Complementa `docs/superpowers/specs/2026-10-27-cash-register-design.md`.

## Global Constraints

- Rama existente `codex/cash-register`; sin commit/push ni cambios en Neon/.env. No se requiere migración.
- Campo inline para tarjeta, etiqueta «Número de comprobante», hasta 120 caracteres, conservación de ceros iniciales. El cobro dividido registra un comprobante por pago con tarjeta.
- El servidor consulta el medio activo y exige la referencia para nuevos cobros locales con `kind=card`; efectivo, transferencias directas y cobros de plataforma conservan referencia opcional.
- No agregar una restricción global de unicidad: numeraciones de tickets pueden repetirse entre equipos/fechas.
- Mantener el valor en errores/reintentos y conservar la identidad de comando actual. La app registra el cobro externo; no vuelve a ejecutarlo en el posnet.
- Historial previo permanece legible; devoluciones conservan la referencia original y no requieren un nuevo dato en este cambio.

## Review Focus

- Referencia vacía/solo espacios: rechazo atómico de creación y cobro posterior, sin pagos ni movimientos parciales.
- Dos tarjetas en un cobro dividido: cada número queda asociado a su pago correcto, con ceros iniciales.
- Cambio de método a efectivo/plataforma: no exigir comprobante del posnet.
- Reintento de un cobro: mismo comprobante y mismo pago, sin duplicar el libro de Caja.
- Cierre de lote y comprobante individual: etiquetas diferenciadas; referencias históricas nulas y devolución original siguen comprensibles.

### Task 1: Persistencia y presentación del comprobante

**Files:** `src/modules/sales/service.ts`, `types.ts`, `queries.ts`; `src/components/sales/sale-detail.tsx`; pruebas `tests/cash-sales.integration.test.ts`, `tests/pricing-sales.integration.test.ts`.

- [x] Escribir y observar RED de referencia obligatoria en creación y cobro posterior. Ejercitar referencia `0000123`, replay y devolución con su original.
- [x] Validar en `preparePayments` contra el medio real. Devolver `methodKind` en el detalle y presentar «Comprobante Nº» en cobros de tarjeta, «Comprobante original Nº» en devoluciones.
- [x] Actualizar los casos válidos existentes de tarjeta con un ticket de ejemplo; ejecutar suites afectadas contra base descartable.

### Task 2: Captura inline durante el cobro

**Files:** `src/components/sales/payment-dialog.tsx`; nueva fixture `tests/helpers/payment-receipt-ui.tsx`; `tests/e2e/payment-receipt.spec.ts`; ajuste `tests/e2e/vat-payment-fees.spec.ts`.

- [x] Observar RED de campo visible tras elegir tarjeta, confirmación bloqueada sin número, múltiples comprobantes en pago dividido y conservación del valor tras un error.
- [x] Reutilizar `PaymentDraft.reference`; enfocar el campo al elegir tarjeta, mostrar ayuda breve y no duplicar la referencia opcional de otros medios. Conservar el límite de 120 caracteres.
- [x] Verificar casos de efectivo/plataforma y tamaños 390/1024/1440 con APIs simuladas.

### Task 3: Entrega

- [x] Ejecutar typecheck, lint y suites nuevas/afectadas. No ejecutar el fixture genérico de `sales.test.ts` que ya falla en la transición 0008.
- [x] Revisar el diff, registrar resultados y entregar sin commit/push. No registrar ventas reales ni aplicar migraciones.

## Resultado

Implementado en el circuito existente, sin migración: el número se exige por cada nuevo cobro local con tarjeta, se preserva como texto y se muestra en la venta. El movimiento de Caja conserva la misma referencia. Cambiar de medio/beneficiario limpia la referencia anterior; un error de registro conserva el formulario. Las devoluciones identifican el comprobante original y el historial previo sigue legible.

Verificación: 36 pruebas aprobadas en cinco suites de ventas/IVA/POS/HTTP; seis pruebas de Ventas–Caja volvieron a aprobar al agregar verificaciones explícitas de atomicidad y referencia del movimiento. Siete pruebas de navegador aprobaron captura, foco, ceros iniciales, error, pago dividido, efectivo, plataforma y anchos 390/1024/1440. Typecheck y ESLint finales aprobados. Evidencia `.superpowers/cash-implementation/payment-receipt-{server-red,server-green,ledger-final,browser-red,browser-final,types-final,lint-final}.log`.

El escenario administrado `vat-payment-fees.spec.ts` fue actualizado con un comprobante de ejemplo, pero no se ejecutó en esta pasada; las pruebas equivalentes de datos y el modal se verificaron por separado. No se ejecutó el fixture genérico de ventas que conserva el fallo previo de transición 0008. No se registraron operaciones reales ni se hizo commit/push.
