# Pedidos y recepción parcial — plan de implementación

**Goal:** registrar lo pedido, recibir parcialmente y evitar compras duplicadas en Operación del día.
**Spec:** [Diseño aprobado en la conversación](../specs/2026-10-23-purchase-orders-design.md).
**Architecture:** documentos nuevos, recepción transaccional existente, proyección FEFO y tareas enlazadas. Ejecutar inline con Superpowers; una revisión independiente al final.

## Global Constraints

No tocar .env ni stock real. Nueva autorización antes de aplicar 0027 en Neon. Manager/admin, sucursal vigente, CSRF, auditoría, idempotencia y revisiones. Reutilizar checkout de la rama de trabajo existente. BigInt y snapshots; nunca convertir pedido pendiente en stock físico. Conservar recepciones independientes, flete y pagos. Sin nuevas dependencias.

## Interfaces y archivos

- `src/db/procurement-schema.ts`, `drizzle/0027_purchase_orders.sql`: pedidos, líneas y vínculos de recepción; export y fixture.
- `src/modules/procurement/{types,validation,orders,queries,receipts,tasks}.ts`: crear borrador, confirmar, reprogramar/cancelar, consulta y recepción ligada. Comandos mediante executeCommand; recepción usa el claim existente y la misma transacción.
- `src/modules/inventory/{types,validation,service}.ts`: referencia opcional al pedido y línea, snapshots de conversión y actualización transaccional del remanente.
- `src/modules/supply-alerts/{types,engine,service,suggestions}.ts`: entradas por fecha, cobertura física/proyectada, pedidos excluidos y compra pendiente.
- `src/modules/daily-operations/{reconcile,read-suggestions}.ts`: seguimiento de recepción y alertas sin duplicados.
- `src/app/api/procurement/orders/{route.ts,[id]/route.ts}`, `src/components/inventory/{purchase-orders-manager,purchase-order-editor,purchase-order-detail,purchases-manager,purchases-workspace}.tsx`: gestión dentro de Compras, acceso directo a un pedido desde tarea y reutilización del formulario de recepción existente.

## Task 1 — Documento, comandos y recepción

- [x] Agregar tests RED de borrador→confirmado, sin stock, permisos/replay/revisión/sucursal, recepción parcial 40/100, repetición, saldo 60, sobre-recepción y cancelación del remanente. Expected: falla por circuito ausente.
- [x] Implementar schema/0027/fixture, comandos y enlace en recepción con snapshots y bloqueo.
- [x] Ejecutar tests de pedidos y regresiones de compras. Expected: PASS con stock y pendientes exactos.

## Task 2 — Proyección y seguimiento

- [x] Tests RED: entrada oportuna evita compra duplicada, tardía conserva faltante, llegada fin del día, parcial solo aporta remanente, sin fecha/vencida/borrador no cubren, recepción cierra tarea. Expected: falla por cálculo actual sin entradas.
- [x] Implementar proyección y tareas, preservar cobertura física, integrar lectura consistente y conciliación.
- [x] Ejecutar tests de alertas, pedidos y operación. Expected: PASS.

## Task 3 — Compras y API

- [x] Tests RED API (permisos/CSRF/errores) y pantalla tablet (crear, confirmar, ETA, parcial, pendiente). Expected: rutas/controles ausentes.
- [x] Implementar pestañas, editor y detalle/recepción, reintento seguro, enlaces y explicación de cobertura.
- [x] Ejecutar pruebas, tipos, lint y build. Expected: PASS (usar build Webpack si persiste falla IPC de Turbopack documentada).

## Task 4 — Revisión y activación

- [x] Revisión independiente de todos los cambios, resolver hallazgos importantes mediante RED→GREEN; ejecutar suite completa y verificaciones.
- [x] Preparar aplicador de únicamente 0027 con historial/fingerprints, solicitar autorización específica antes de Neon. No crear pedidos de demostración reales.
- [x] Tras autorización, aplicar/verificar y comunicar uso, pruebas y limitaciones; commit/push conforme autorización vigente.

## Review Focus

Carrera entre recepciones, revisión vieja, repetición tras red incierta, autorización revocada en replay, proveedor/línea/sucursal cruzada, cambios de presentación tras confirmar, ETA al final del día o vencida, recepción/cancelación parcial y doble conteo en proyección. Conservar costos/flete y recepción sin pedido; no tocar stock al consultar/confirmar pedido. Límites de cantidades y fechas, tareas asignadas y acceso staff.
