# Selección obligatoria de localizador

Pedido: «La selección del localizador debería ser obligatoria si es que hay disponibles».

- Al registrar un pedido nuevo, incluido un agregado a una cuenta de mesa, se exige elegir un equipo libre cuando la sucursal tiene disponibilidad.
- «Sin localizador» aparece únicamente cuando todos los equipos están ocupados. La disponibilidad desconocida o un error de lectura no se interpreta como flota vacía.
- La disponibilidad se actualiza durante el cobro. Si otro cajero ocupa el elegido, se bloquea la confirmación con un aviso, conservando la opción de cancelar el diálogo y cambiar de equipo.
- La validación del servidor ocurre dentro de la transacción de venta/pedido. Un rechazo revierte venta, cobros y reservas. El índice de asignación existente conserva la protección frente a dos cajas eligiendo el mismo número.
- Devolver o cambiar equipos de pedidos existentes conserva su circuito. Pagar una cuenta ya registrada y reintentar una operación de resultado incierto conserva sus permisos e idempotencia.

Verificación: 50 pruebas en 10 archivos de Vitest y 7 pruebas de interfaz aprobadas; TypeScript, ESLint de archivos tocados y `git diff --check` correctos. Se actualizaron las ventas de prueba de recetas, combos, IVA y stock para seleccionar equipos libres de forma explícita. Pruebas de base únicamente sobre PGlite descartable autorizado; interfaz con respuestas ficticias.

No requiere migraciones. No se modificó la configuración ni el stock de la base real. Cambios conservados en el checkout actual, sin commit ni push.

Evidencia local ignorada: `.next-e2e/required-locator-red.log`, `required-locator-ui-red.log`, `required-locator-all.log`, `required-locator-ui.log`, `required-locator-types.log` y `required-locator-lint.log`.
