# Verificación de comandas — 0.5.0

## Cobertura

Las pruebas usan usuarios y bases temporales. No importan ventas ni modifican datos del local.

- Publicación por estación dentro de la misma transacción de venta y sin publicar ventas históricas.
- Toma de tarea con responsable y revisión; permisos para listo, entrega y transferencia con motivo.
- Reintentos después de otros cambios, sin repetir eventos ni devolver una instantánea mezclada.
- Anulación conserva tareas entregadas y cancela las restantes.
- Ruteo y nombres de estación conservados como se confirmaron originalmente.
- Promedios por comanda completa, sin sumar duraciones paralelas ni convertir tiempos faltantes en cero.
- Dos sesiones de navegador, respuesta perdida después del commit, recarga y recuperación del mismo envío.
- Desconexión/reconexión, bloqueo de acciones con datos no confirmados y vistas de escritorio/celular.
- Regresiones de catálogo, compras, inventario, recetas, producción, ventas y mesas.

El dominio llegó a 102/102 pruebas y la suite completa de navegador pasó 21/21 (incluye los dos flujos iniciales y las dos regresiones de revisión). Compilación de producción, TypeScript, lint y comprobación del diff: sin errores. El cierre y la revisión independiente se registran en `progress-preparation.md`.

## Entorno de navegador

Una falla intermitente en el login se reprodujo con una traza temporal fuera del repositorio. Next leyó cero caracteres del `BUILD_MANIFEST` durante su regeneración por webpack: `load-manifest.external.ts:65`, llamado por `route-module.ts:318`. No era una lectura JSON de la aplicación. Separar los directorios de compilación no bastó para resolverla.

Conservar rutas compiladas con `onDemandEntries` tampoco eliminó la carrera, por lo que esa configuración se descartó. El servidor de las pruebas ahora usa Turbopack, cuyo `manifest-loader` escribe el `BUILD_MANIFEST` mediante `writeFileAtomic`. Cada ejecución usa su base, credenciales y compilación temporales; restaura los archivos de tipos/configuración que Next modifica. No se modifica el framework, no se reintentan silenciosamente acciones y no se reduce ningún control de autenticación.

## Límites de la evidencia

PGlite ejecuta las migraciones reales y las consultas PostgreSQL, pero no reproduce todos los intercalados de varias conexiones de Neon. Antes de operar el local hay que comprobar esos intercalados, permisos, latencia y recuperación con una base de desarrollo de Neon y varios dispositivos reales.

No se verifican todavía PWA/offline, impresión, inventario por venta ni integraciones externas: no forman parte de esta implementación. Las imágenes de `docs/previews/preparation-*.png` muestran datos ficticios del entorno de pruebas.
