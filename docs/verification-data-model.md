# Modelo de datos — verificación del 28 de septiembre de 2026

## Actualización: migración de desarrollo aplicada

El 28/09/2026 el usuario autorizó aplicar migraciones a la base de desarrollo. Se ejecutaron cuatro pruebas de transición poblada en PGlite (4/4 aprobadas), luego preflight, expansión 0007, backfill y finalización 0008 en PostgreSQL. Estado ready; nueve hashes del journal coinciden; conciliación sin diferencias; cuenta administradora conservada. Sucursal Principal y ubicación Depósito principal, zona America/Argentina/Buenos_Aires. No había artículos, ventas, lotes ni movimientos en desarrollo. No se modificó .env ni se hicieron commits/push. El código se incorporó al repositorio activo para mantener compatibilidad con la base. Las afirmaciones anteriores de «no se ejecutaron migraciones» describen el checkpoint previo y quedan reemplazadas por esta actualización. Las demás pruebas de aceptación/concurrencia/UI permanecen pendientes. El intento de respaldo de tablas de autenticación fue rechazado por revisión automática; no se exportaron esos registros.


Estado: implementación en copia aislada, todavía no aceptada para integrar o activar. No se ejecutaron migraciones, preflight contra una base, commits ni push. La navegación global y Breadcrumb continúan pausados según el plan aprobado.

## Ubicación y preservación

Copia de trabajo: `C:/Users/franj/.codex/worktrees/data-model/kybo-operations-next`.
Repositorio activo: `C:/Users/franj/DEV/PERSONAL/kybo-operations-next`.

Se compararon los 263 archivos originales con el respaldo inicial: ninguna diferencia. `.env`, `scripts/create-user.ts` y HEAD permanecen intactos. La copia aislada no contiene `.env`. `package.json` y ambos lockfiles tampoco cambiaron respecto del respaldo. Las migraciones 0000–0006, sus snapshots y las entradas históricas del journal se conservaron byte por byte.

No se copió la implementación al repositorio activo: el nuevo código requiere una transición que todavía no está autorizada ni ensayada.

## Implementación preparada

- Catálogo físico `items`, separado de productos comerciales, con clases y capacidades explícitas, códigos únicos y unidades exactas. Renombre de ingredientes que conserva identidades.
- Sucursales y ubicaciones, membresías, catálogo compartido y configuración comercial por sucursal. Edición de accesos y permisos de catálogo separados del rol operativo. Archivado lógico con controles de saldo y trabajo pendiente.
- Saldos físicos y reservas por lote/ubicación; valoración por artículo/sucursal; movimientos con orden persistido, documentos de origen tipados e historial protegido.
- Confirmación de ventas con reserva, finalización parcial de preparación con consumo, entrega sin segundo descuento y despacho de reventa. Cancelación física separada del reintegro financiero.
- Producción planificada: reserva, consumos reales, rendimiento real, sobrantes liberados y pérdida total. Se conserva el registro directo de una producción ya terminada.
- Traslados internos y entre sucursales, recepción parcial, pérdida y regreso; listados activos e históricos paginados.
- Consumo interno, devoluciones físicas de reventa limitadas a lotes entregados, reasignación de reservas y retiro global de lotes preservando bloqueos locales.
- Herramientas de transición con destino explícito, modo informe predeterminado, importación sin efectos, mapeo revisable, corte transaccional y conciliación. La migración genérica se bloquea para evitar una transición incompleta.
- Conciliación de saldos, lotes, reservas, valoración y tránsito contra movimientos y baselines. Diferencias se informan; no se corrigen borrando historial.

## Verificaciones realizadas

- TypeScript sin emisión y comprobación de tipos del build final: aprobados.
- Pruebas puras y fronteras HTTP con dependencias simuladas: 20 archivos, 83 pruebas aprobadas en la ejecución conjunta final (13:44, 37,43 s). No se ejecutaron helpers de base.
- Compilación final Next.js con Webpack: aprobada, tipos aprobados y 37 páginas generadas. Conexiones DATABASE_URL/KYBO_LOCAL_DB vacías en el proceso y secreto ficticio de build; sin .env.
- ESLint final sobre src, herramientas nuevas, pruebas unitarias y fixtures nuevos: aprobado sin errores ni advertencias.
- `git diff --check`: aprobado.
- Dos revisiones estáticas del conjunto y seguimientos acotados. Se corrigieron precio manual según permiso vigente, historial anterior invisible, reintentos después de degradación de permisos, producción planificada desconectada, paginación, vencimiento del preparado, pérdida física con lote bloqueado y conciliación de tránsito.

Las comprobaciones automáticas de aprobación bloquearon algunos comandos amplios. Se inspeccionó el código y se reemplazaron por cambios acotados; no se ejecutó ninguno de los comandos rechazados. Se mantuvieron los bloqueos locales y la separación de permisos. Ningún rechazo autorizó migraciones ni acceso a la base.

## Pruebas de base escritas, no ejecutadas

- `tests/transition.integration.test.ts`: corte con un artículo/lote histórico, conservación de UUID/cantidad/costo desconocido, baselines inmutables, segunda sucursal vacía, FK cruzada rechazada y divergencia detectable.
- `tests/data-model.concurrency.test.ts`: traslado de 12 con recepción 5+7; dos conexiones compitiendo por la última unidad.
- `tests/helpers/data-model-database.ts`: PGlite en memoria con autorización explícita.
- `tests/helpers/postgres-data-model.ts`: destino PostgreSQL exclusivo, vacío, nombre `kybo_test_*`, variable específica y sin fallback a la conexión de la aplicación. No borra una base existente ni elimina automáticamente sus datos.

Estos archivos son borradores de aceptación, no resultados aprobados. No se invocaron sus helpers. El helper de pruebas antiguo también exige autorización explícita antes de preparar una base.

## Trabajo que falta para cerrar el plan

1. Ensayar expansión, backfill y finalización en una base desechable y corregir cualquier diferencia observada. El fixture nuevo no demuestra todavía el registro del journal del runner en una base real.
2. Adaptar y ejecutar las suites de integración heredadas, cuyos supuestos de ingredientes, permisos globales y descuento de stock anterior cambiaron. No se consideran aprobadas ni reemplazadas por las pruebas unitarias.
3. Completar y ejecutar aceptación de venta mixta, producción, reservas vencidas/bloqueadas, cancelación concurrente con finalización, reintentos y revocación; verificar todos los accesos cruzados entre sucursales.
4. Revisar las pantallas en un navegador sobre una base de prueba y completar sus pruebas E2E. No se hizo validación visual ni funcional con datos persistidos.
5. Ensayar recuperación; obtener el mapeo operativo real de sucursal, ubicación, clasificaciones, membresías y suministro comercial. No se deducen esos datos ni se solicitan credenciales por chat.
6. Recomparar archivos locales antes de integrar. Mantener el corte productivo como acción posterior y explícita.

El diseño incorpora las invariantes necesarias, pero todavía no hay evidencia de base/concurrencia suficiente para afirmar que el nuevo modelo está listo para operar.
