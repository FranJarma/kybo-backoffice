# Verificación de compras e inventario — versión 0.2

Alcance: recepciones manuales, pagos independientes, lotes, existencias físicas/utilizables, mermas, conteos y bloqueo. Se amplía la administración existente, sin integrar Neon ni publicar el sistema.

## Evidencia

- Baseline de la entrega anterior: 39 pruebas aprobadas.
- Frontera HTTP: cinco pruebas inicialmente rojas contra el comportamiento incompleto y luego verdes. Verifican sesión, rol, Origin, JSON y errores privados.
- Verificación final del coordinador tras formatear: `npm test`, 67 pruebas aprobadas en siete archivos, 29,86 s. Incluye conteos positivos sobre insumos archivados, límites numéricos y rollback íntegro.
- `npm run build`, `npm run typecheck`, `npm run lint` y `git diff --check`: salida 0. La compilación incluye las páginas y rutas de compras e inventario.
- Navegador: 11 escenarios distintos comprobados. La última suite completa aprobó 10/11; el único fallo fue un selector ambiguo de la prueba móvil. Se corrigió y ese recorrido aprobó por separado (1/1, 37,9 s). También aprobó la regresión reforzada del borrador de pago (1/1, 28,4 s), con campos no vacíos antes de crear otra recepción. No se afirma una tercera ejecución completa. Detalle en `stock-ui-report.md`.
- Capturas de escritorio y móvil inspeccionadas con lotes y movimientos cargados, sin desborde horizontal: `previews/inventory-desktop.png` y `previews/inventory-mobile.png`.
- Revisión independiente en `stock-review.md`: los tres hallazgos quedaron corregidos y aprobados por inspección. Las comprobaciones finales anteriores cierran las verificaciones de ejecución pendientes en ese informe.

Las pruebas de base usan PGlite con las migraciones SQL versionadas. Los reintentos concurrentes y sobrepagos se verifican en ese entorno; el orden de bloqueos también fue revisado en código. Esto no sustituye probar múltiples conexiones contra PostgreSQL/Neon en el entorno de despliegue.

La recuperación de operaciones pendientes conserva el payload exacto por usuario y tipo en el almacenamiento de la pestaña antes de enviar. Se prueba una recepción guardada por servidor cuya respuesta se pierde, recargando y repitiendo la misma clave. No constituye la futura cola offline del POS y no cubre cerrar la pestaña o borrar su almacenamiento.

Los costos desconocidos se mantienen pendientes. Una recepción confirmada no tiene todavía corrección financiera; un total pendiente bloquea su pago. No se implementaron órdenes al proveedor/recepciones parciales, producción/recetas, ventas, caja, OCR, fichaje ni impresión. La aplicación existente y sus datos reales se mantuvieron intactos.
