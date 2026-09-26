# Compras e inventario — persistencia y servicio

Servicio implementado con recepciones confirmadas y snapshots de catálogo, pagos separados, lotes, saldos, movimientos y eventos de bloqueo. Migración `0001_curvy_wildside.sql` agrega FKs, checks, índice único por comprobante de proveedor, renglón/lote y claves de idempotencia. `createInventoryService` cubre los ocho métodos del contrato, búsqueda y offset en listados de lotes/movimientos.

La aritmética usa enteros BigInt: cantidades y valores a seis decimales, importes en centavos y redondeo por renglón. Un costo desconocido queda pendiente aun después de ingresos valorados; se reinicia cuando el stock llega a cero. Una revisión obsoleta del lote o catálogo produce conflicto. Cada operación reclama su UUID transaccionalmente antes de los bloqueos del negocio, con huella del payload validado y actor; las repeticiones no vuelven a escribir. Movimientos, balance, auditoría y resultado se confirman juntos. Las lecturas de stock y detalle usan instantánea de lectura repetible.

Evidencia:

- RED inicial: `npm test -- tests/inventory.test.ts` falló por servicio ausente. RED adicional: fecha futura aceptada, valor conocido erróneo al revivir lote agotado de costo desconocido, y revisiones de catálogo ignoradas. Luego se corrigieron esas conductas.
- `npm test -- tests/inventory.test.ts`: 23/23 casos en PGlite migrado. Incluyen recepción 2 × 800 g, pagos y sobrepago concurrente, tres clases de reintentos simultáneos, rollback, valor conocido/cero/desconocido, FEFO y paginación >100 lotes, expiración/bloqueo, costo promedio/merma, conversión exacta, historial de unidad y revisiones obsoletas.
- `npm test`: 7 archivos, 67/67 casos pasan. `npm run typecheck`: pasa. ESLint focal de archivos propios: sin avisos.

Límites del incremento: no hay corrección auditada de costos pendientes ni anulación financiera, por lo que una recepción de total desconocido no admite pagos. Un conteo positivo en lote agotado con costo previo desconocido deja pendiente la valoración. El libro conserva el historial y los bloqueos en eventos separados; no se borran recepciones, lotes ni movimientos.

Revisión final: se agregó regresión RED para insumo archivado con conteo positivo; antes se permitía el ingreso y aumentaba valor. Ahora devuelve `ARCHIVED_REFERENCE` (409) sin modificar saldo, mientras conteo descendente y merma existentes permanecen permitidos. Focal 23/23 y suite 67/67 en PGlite.

Validación de límites: las operaciones calculadas se verifican con BigInt antes de persistir importes `numeric(18,2)` y valores/costos `numeric(24,6)`. Dos regresiones RED mostraron que cantidad × costo/precio válidos por campo podían exceder la precisión de la columna y devolver error de base; ahora ambas entradas responden `VALIDATION` (400), revierten la transacción y dejan stock/clave sin escribir. Focal 23/23, suite 67/67 y typecheck pasan.
