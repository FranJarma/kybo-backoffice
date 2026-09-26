# Verificación de recetas y producción — 25/09/2026

## Comportamiento verificado

- Esquema normalizado y migraciones reales sobre PostgreSQL embebido nuevo.
- Versiones inmutables, conflictos de revisión y reintentos de guardado sin duplicados.
- Costos de reposición recursivos, alternativas, omisión opcional, precios desconocidos y cero explícito.
- Dependencias circulares rechazadas, incluso a través de alternativas. Unidad de insumos referenciados protegida.
- FEFO, exclusión de lotes vencidos/bloqueados, agregación de ingredientes repetidos y rechazo atómico de faltantes.
- Transferencia del costo promedio al rendimiento real; conservación del remanente de redondeo al agotar stock.
- Consumo de preparados sin descontar su materia prima otra vez.
- Vista previa obsoleta invalidada y confirmación con transacción e idempotencia.
- Reintentos de una producción ya confirmada después de cambiar receta o día sin duplicar el lote.
- Permisos de administración y límites de cantidades/fechas/selections.
- Flujos de navegador de edición de recetas, comparación, revisión de faltantes, producción, recarga y recuperación de respuesta perdida.
- Escritorio 1440 px y móvil 390 px; header alineado, controles legibles, lista de recetas con tarjetas en móvil.

## Evidencia

- Suite de dominio: 78/78 pruebas aprobadas.
- Suite completa de navegador: 14/14 aprobadas. Luego de adaptar la lista a tarjetas móviles, los dos flujos afectados aprobaron: comparación 1/1 y producción 1/1.
- Corrección de reselección: se reprodujo un panel que quedaba cargando al tocar el registro seleccionado; la prueba pasa tras conservar el panel y el borrador de producción.
- Build, TypeScript y ESLint finales sin errores, incluyendo los ajustes móviles.
- Capturas en `docs/previews/recipes-*.png` y `production-*.png`: datos ficticios creados solo en bases temporales de pruebas.
- Revisión independiente del cambio completo: sin hallazgos bloqueantes ni menores pendientes; detalle en `docs/recipes-review.md`.

## Límites

Estas pruebas no validan una impresora física, servicios externos ni intercalados de múltiples conexiones de Neon. La conexión real y el despliegue siguen pendientes. El módulo no registra ventas ni reemplaza todavía la caja de Fudo.

La producción es del día comercial de Salta. Los lotes confirmados no tienen aún reversión y los costos pendientes no tienen corrección auditada. Estos límites figuran en README y no se disimulan con valores inventados.
