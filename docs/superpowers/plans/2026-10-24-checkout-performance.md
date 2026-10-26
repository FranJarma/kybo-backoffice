# Agilizar la confirmación de cobro

El usuario solicita reducir la demora al confirmar el cobro. Se conserva la confirmación real de la transacción: pago, pedido, reservas y localizador se guardan juntos. No crear ventas de prueba en Neon ni aplicar migraciones.

## Diagnóstico reproducible

- Prueba descartable: dos bebidas, seis insumos controlados compartidos, una estación, efectivo y localizador.
- Línea de base: 309 sentencias, 531 ms en PGlite sin red. Mayor concentración: bloqueos y reservas repetidos por insumo y por línea; configuración de receta cargada dos veces.
- Siete `SELECT 1` de solo lectura en Neon: conexión inicial 476 ms, consultas calientes 58–61 ms (mediana 59 ms). Los viajes secuenciales dominan la espera; no confundir el tiempo local de PGlite con latencia real de un cobro.

## Ejecución

1. Mantener una prueba de presupuesto de consultas y comprobar pago único, reserva conjunta e idempotencia.
2. Agrupar operaciones por pedido: bloqueo y disponibilidad, asignación FEFO, documentos y snapshots. Reutilizar configuración validada dentro de la transacción; conservar validación de permisos, precios, IVA, versiones y localizador.
3. Comparar consultas antes/después y ejecutar pruebas de ventas, stock, reservas, combos, preparación y localizadores. Revisar tipos, lint y revisión independiente si la modificación afecta reservas compartidas.

Sin commit ni push. Sin cambios de esquema o de configuración de conexión.
