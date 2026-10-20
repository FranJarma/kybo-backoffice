# Catálogo: rendimiento del costeo y precios por canal

Fecha: 20/10/2026. Alcance: solicitud de optimizar el costo estimado del listado y agrupar Mostrador, Pedidos Ya y Uber Eats bajo «Precios».

## Cambios

- Lectura de recetas publicadas y modificadores en conjunto. El listado ya no carga el historial ni los datos del editor por cada producto. Se conservan cantidades, merma, variantes, instrucciones y reemplazos.
- Resumen en lotes de hasta 50 productos; los detalles y la rentabilidad siguen limitados a 10. Cada lote se muestra al terminar, aunque otro continúe o falle.
- Reutilización de resultados durante el montaje del catálogo. Buscar, filtrar o interactuar con el formulario no invalida los costos ya obtenidos. Los cambios guardados y la actualización explícita generan una nueva lectura; el cambio de sucursal recarga el contexto.
- Columna «Precios»: tres filas con ícono, canal e importe final. Mostrador gris, Pedidos Ya rojo tenue y Uber Eats negro. Un precio cero se distingue de «Sin precio». Sin desgloses de IVA en el listado.

## Medición

Lectura del mismo catálogo de desarrollo, con 20 productos. Perfil del servicio completo de resumen, sin escrituras ni cambios en los datos:

| Versión | Consultas SELECT | Tiempo |
| --- | ---: | ---: |
| Anterior, dos lotes de 10 | 245 | 14.221 ms |
| Optimizada, un lote de 50 | 22 | 1.596 ms |
| Repetición optimizada | 22 | 1.729 ms |

Los resultados normalizados de costos fueron idénticos en las tres lecturas. La mejora reduce viajes a la base de datos; estos tiempos son mediciones del servicio, no una garantía del tiempo total de carga de la página. No se agregó una caché financiera global ni persistente.

## Verificaciones

- 47 pruebas correctas en siete archivos: consultas acotadas, comparación con el lector anterior, modificadores compartidos, factores y reemplazos, recargos, rendimiento de recetas antiguas, merma, referencias, inventario por sucursal, combos y caché del montaje.
- La regresión de consultas falló con 83 lecturas para seis recetas y pasó al agruparlas. La regresión de lotes verificó el nuevo límite de 50 y la entrega de resultados fuera de orden.
- Se reprodujo y corrigió la pérdida del mensaje de error de un lote cuando otro terminaba después. La prueba de navegador comprueba resultados parciales, reintentos, búsqueda sin nuevas consultas y actualización explícita.
- Revisión independiente del lector y la caché: sin hallazgos críticos o importantes adicionales.
- Tres flujos de navegador correctos en la corrida final, sobre una base descartable: carga parcial y reutilización de costos; pestañas de receta/costeo y borrador conservado; precios por canal en escritorio/móvil, impuestos, comisiones, cobro e historial. Se verificó que los nombres de canales no se superpongan con sus importes.
- Capturas de escritorio y móvil revisadas visualmente. Lint y formato de los archivos afectados correctos.
- Una corrida inicial tuvo un timeout de cinco segundos al cerrar el formulario guardado. La repetición con traza y la corrida final completa pasaron; no se cambió el comportamiento de guardado.

- Comprobación final de tipos correcta (`pnpm typecheck`, salida 0). `git diff --check` correcto. Los archivos de configuración temporales del navegador quedaron restaurados.

Se conservan las modificaciones anteriores y el `.env`. Sin migraciones en desarrollo, commits ni push.
