# Transición al inventario por sucursal — borrador de implementación

## Actualización: migración de desarrollo aplicada

El 28/09/2026 el usuario autorizó aplicar migraciones a la base de desarrollo. Se ejecutaron cuatro pruebas de transición poblada en PGlite (4/4 aprobadas), luego preflight, expansión 0007, backfill y finalización 0008 en PostgreSQL. Estado ready; nueve hashes del journal coinciden; conciliación sin diferencias; cuenta administradora conservada. Sucursal Principal y ubicación Depósito principal, zona America/Argentina/Buenos_Aires. No había artículos, ventas, lotes ni movimientos en desarrollo. No se modificó .env ni se hicieron commits/push. El código se incorporó al repositorio activo para mantener compatibilidad con la base. Las afirmaciones anteriores de «no se ejecutaron migraciones» describen el checkpoint previo y quedan reemplazadas por esta actualización. Las demás pruebas de aceptación/concurrencia/UI permanecen pendientes. El intento de respaldo de tablas de autenticación fue rechazado por revisión automática; no se exportaron esos registros.


## Estado

Esta transición todavía requiere revisión integral y pruebas de aceptación con PostgreSQL. **No ejecutar en producción en este estado.** En esta sesión no se conectó a la base, no se aplicaron migraciones y no se modificó el `.env`.

El código se prepara en un worktree aislado. La incorporación al repositorio de trabajo queda pendiente de completar la implementación y comparar nuevamente los archivos con el respaldo inicial.

## Qué cambia

- `ingredients` pasa a `items`, conservando los UUID. Las referencias y nombres de columnas se renombran; no se recrean artículos ni documentos históricos.
- Cada artículo tiene código, clase y habilitaciones explícitas de compra y uso en recetas. Los registros archivados no clasificados quedan fuera de nuevas operaciones.
- Catálogo compartido; sucursales, ubicaciones, permisos y productos habilitados por sucursal.
- Inventario por lote y ubicación, reservas separadas del stock físico y valoración por artículo/sucursal.
- Ventas preparadas consumen al completar la preparación; reventa al entregar. Las entregas de lo ya preparado no descuentan de nuevo.
- Una cancelación financiera no repone existencias. Los materiales en proceso requieren resolución física; la reventa recuperable tiene una devolución explícita y limitada al origen.
- Traslados reservados, despachados y recibidos parcialmente; las pérdidas y regresos resuelven el saldo en tránsito.

## Corte diseñado

1. Detener la aplicación anterior y sus procesos de escritura. Conservar una copia recuperable de la base.
2. Ejecutar primero el informe de solo lectura de `scripts/data-model-preflight.ts` contra un destino elegido explícitamente con `KYBO_TRANSITION_DATABASE_URL`. El script no carga `.env` ni usa `DATABASE_URL` como alternativa.
3. Revisar un archivo JSON que identifique sucursal inicial, ubicación, zona horaria, clasificación de artículos, miembros y responsables del catálogo. El esquema está en `src/modules/transition/mapping.ts`. No se deducen permisos de los roles anteriores.
4. Resolver cuentas abiertas, preparaciones pendientes y diferencias entre saldo global y lotes antes del corte.
5. En un entorno de aceptación autorizado, ejecutar el runner con `--apply --mapping <archivo.json>`. Verifica los hashes de las migraciones 0000–0006, bloquea escrituras y realiza expansión, mapeo, conciliación y finalización en una transacción.
6. Conservar los saldos anteriores como puntos de partida: cantidad, valor, lotes y bloqueos. No generar compras ficticias ni recalcular consumos de ventas históricas.
7. Publicar las composiciones comerciales y habilitar deliberadamente los productos por sucursal. Los productos migrados quedan inicialmente deshabilitados para vender.
8. Reabrir la aplicación solamente después de la aceptación. El acceso comprueba que `data_model_state` esté en `ready`.

La migración genérica está bloqueada para impedir que se aplique una expansión sin mapeo. Los borradores `0007_data_model_expand.sql` y `0008_data_model_finalize.sql` no deben ejecutarse individualmente. El runner registra sus hashes solo después de conciliar.

## Verificaciones pendientes de aceptación

Las pruebas puras y los controles de tipos no demuestran comportamiento transaccional. Falta ejecutar, en una base aislada y con autorización:

- Migración de una copia representativa: UUID, historial, cantidades, valores desconocidos y bloqueos preservados; rollback ante fallas intermedias.
- Dos ventas compitiendo por el último saldo; reintento de la misma operación; revocación de acceso antes de un reintento.
- Preparación parcial y entrega sin doble consumo; finalización concurrente con cancelación; resolución parcial de materiales.
- Transferencia entre sucursales, recepción parcial, pérdida/regreso y conservación exacta de valor.
- Reserva cuyo lote vence o se bloquea; reemplazo explícito; imposibilidad de consumir stock comprometido en otro documento.
- Aislamiento de todas las consultas y escrituras por sucursal, incluidas llamadas directas a servicios.
- Producción con entradas reales y rendimiento real, y ausencia de consumo recursivo de sus componentes al usar el preparado.
- Conciliación continua de saldos contra movimientos y puntos de partida, reservas contra asignaciones y valor en tránsito.
- Portar y ejecutar las pruebas de integración existentes y revisar las pantallas en un navegador.

No considerar estas verificaciones como realizadas por el hecho de que los archivos SQL o los servicios existan.
