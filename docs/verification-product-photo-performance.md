# Rendimiento de las fotos de productos

Fecha: 20/10/2026.

## Problema y cambio

Las fotos se devolvían con `private, no-store`, lo que impedía la reutilización normal de la caché HTTP del navegador. Las miniaturas del catálogo y del punto de venta descargaban la imagen completa, de hasta 1600 píxeles.

- Catálogo y punto de venta solicitan una miniatura WebP de hasta 128 píxeles. El editor utiliza una vista previa de hasta 384 píxeles. Se conserva la proporción y no se agrandan las fotos pequeñas.
- El navegador puede conservar las respuestas correctas durante un día (`private, max-age=86400, immutable`), con `Vary: Cookie` y validadores ETag por imagen/tamaño. Los errores y las respuestas sin sesión no se guardan.
- El servidor conserva originales y versiones reducidas en una caché LRU de hasta 32 MiB y 256 entradas, con vencimiento a los 15 minutos. Comparte las lecturas simultáneas y no conserva fallos ni fotos inexistentes.
- La autenticación y los permisos se comprueban antes de acceder a la caché de bytes. La validación del creador o del vínculo con un producto pasó de dos consultas a una. Las fotos en eliminación siguen excluidas.
- Una foto reemplazada tiene un identificador nuevo y una URL diferente. Las fotos existentes se benefician sin volver a subirlas ni migrar datos. La URL original sin parámetro de tamaño sigue funcionando.

## Medición con fotos actuales

Lecturas de la misma muestra de cinco fotos, sin cambios en la base ni en el almacenamiento. El perfil rechaza cualquier sentencia SQL que no sea SELECT.

| Medición | Anterior | Final |
| --- | ---: | ---: |
| Bytes devueltos para las cinco imágenes | 243.452 | 6.668 |
| Lecturas al almacenamiento en la primera pasada | 5 | 5 |
| Lecturas al almacenamiento en la segunda pasada | 5 | 0 |
| Primera pasada del servicio | 837 ms | 787 ms |
| Segunda pasada del servicio | 355 ms | 66 ms |

Las miniaturas transfieren aproximadamente un 97% menos de datos. El tiempo de la primera lectura todavía depende de la conexión y del almacenamiento; estas cifras corresponden al servicio y no garantizan el tiempo total de carga de una pantalla. La caché del servidor es por proceso y puede reiniciarse en un despliegue. Su ausencia no impide servir las fotos.

## Verificaciones

- Regresiones reproducidas antes de corregir: cabeceras sin caché ni validadores, falta de selección de tamaño y dos consultas para validar una foto.
- Pruebas de caché: lecturas simultáneas, reutilización, expulsión por memoria/entradas, vencimiento y reintentos tras fallos o fotos inexistentes.
- Integración con base descartable y almacenamiento simulado: tamaños, proporción, fotos pequeñas, original intacto, reemplazos, acceso del creador, vínculo y desvinculación del producto y exclusión durante eliminación.
- HTTP: caché privada, ETag por variante, respuesta 304, tamaños permitidos y errores/anonimato sin caché.
- Chrome real, con servidor local temporal, componente y manejador HTTP reales y fotos/identidad de prueba: reutilización después de volver a insertar la imagen y navegar, URL nueva al reemplazarla y rechazo de nuevas lecturas sin sesión. No se interceptan solicitudes del navegador, porque eso desactivaría su caché HTTP.
- La prueba distingue las nuevas solicitudes de los píxeles ya descargados que Chrome puede conservar localmente: cerrar sesión no implica borrar del navegador una foto ya descargada.
- Revisión independiente: sin hallazgos críticos o importantes; comprobada también la equivalencia de permisos de la consulta agrupada.

- Resultado final: 15 pruebas de caché/HTTP/integración correctas en cuatro archivos, más una prueba real de Chrome correcta (16 en total). Tipos, lint, formato y `git diff --check` correctos. Evidencias en `.local/photo-cache-unit-final.log`, `.local/photo-cache-browser-final.log`, `.local/photo-cache-types-final.log`, `.local/photo-cache-lint-final.log` y `.local/photo-cache-format-final.log`.

Se conservan el `.env` y las modificaciones locales anteriores. Sin escrituras en los datos o fotos de desarrollo, migraciones en desarrollo, commits ni push.
