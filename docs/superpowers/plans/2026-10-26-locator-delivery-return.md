# Liberación de localizadores al entregar

Pedido explícito: liberar al entregar y reemplazar «Gestionar / devolver» por «Devolver» directo en el listado, sin una pantalla intermedia.

## Criterio

- «Entregar» libera el localizador dentro de la misma transacción, solo si todas las líneas físicas del pedido están entregadas o canceladas. No basta una entrega parcial de Barra/Cocina. Los padres de combos no cuentan como una línea física adicional.
- Mantener historial, responsable, fecha, auditoría, permisos de sucursal y bloqueo compartido con las asignaciones. Un reintento no devuelve un equipo que ya fue asignado a otro pedido.
- «Devolver» envía directamente la asignación visible y conserva la protección frente a una asignación que haya cambiado. El clic registra la devolución; no hay otro modal ni casilla intermedia. El listado informa que al entregar el pedido completo el equipo se libera automáticamente.
- Conservar el editor/historial accesible desde el detalle de una venta para cambios excepcionales de equipo.
- No liberar equipos por cobros ni anulaciones. No modificar datos existentes ni hacer migraciones, commit o push.

## Pasos y verificación

- [x] Cambiar la regresión de entrega directa y probar reutilización/reintentos; agregar entrega parcial y rollback; cubrir Comandas con dos estaciones y combo mixto.
- [x] Ejecutar esas pruebas en PGlite descartable y observar el fallo antes del cambio.
- [x] Incorporar liberación condicional al circuito común `deliverLines`, antes del retorno de `updateTasks: false`; compartir la clave de bloqueo con `assignLocator` y el cambio manual.
- [x] Probar en navegador que «Devolver» envía una sola operación, deshabilita mientras espera y actualiza el listado sin abrir la edición. Cubrir respuesta incierta y conflicto de asignación.
- [x] Simplificar el botón del listado reutilizando `useOperation` y la API existente.
- [x] Verificar las pruebas afectadas, TypeScript, ESLint y diferencias; registrar resultados y límites.

## Evidencia

- RED: la entrega directa, parcial completada, el combo mixto y Comandas mantenían el localizador ocupado. El navegador no encontraba la acción directa «Devolver localizador 3».
- GREEN: 18 pruebas backend en dos archivos y cuatro recorridos de navegador (devolución directa de un pedido anulado, respuesta perdida/reintento, conflicto de asignación y cambio excepcional desde el detalle). Conservan consumo único, historial y devolución de equipos reutilizados.
- TypeScript y ESLint de los archivos de la tarea: correctos. La acción «Listo» mantiene su presupuesto anterior de 49 consultas; esta tarea modifica la entrega.
- Registros descartables: `.next-e2e/locator-{return-red,comandas-red,direct-red,return-green,direct-green,return-types,return-lint}.log`.
- Concurrencia PostgreSQL revisada estáticamente; PGlite serializa las transacciones y no prueba contención entre conexiones PostgreSQL independientes.
- Revisión independiente de solo lectura: sin hallazgos concretos en liberación, bloqueos, sucursal, historial, auditoría, errores y reintentos.
- Sin migraciones, cambios de `.env`, pedidos o movimientos ficticios en Neon, commit ni push. No se hizo una devolución retroactiva de equipos de pedidos anteriores; pueden devolverse directamente desde el listado.
