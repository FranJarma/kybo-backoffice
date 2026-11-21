# Tarea 7. Verificación del POS en navegador

Fecha: 2026-11-21. Rama: feature/ux-ui-pos-improvements. Chrome 157.0.8103.79, Node v24.21.0, Playwright con un trabajador. La página aislada monta SalesManager y sus componentes reales. Las rutas, respuestas y recursos fueron interceptados. El alcance de esta evidencia es el comportamiento en el navegador con esos fixtures.

## Cambios y comprobaciones

| Caso | Resultado |
| --- | --- |
| Catálogo después del cobro a 390 × 844 | La captura previa mostraba cero espacio para tarjetas entre las categorías y el resumen. Tras compactar los controles, el caso conserva el scroll previo del catálogo. Con el recibo presente, encontró 44 píxeles verticales consecutivos de Cappuccino bajo el puntero y un clic en esas coordenadas agregó una línea al pedido nuevo. Hubo un solo POST de venta. |
| Enlace de cuenta a 320 × 720 | La altura previa era 37 px. La prueba final requiere 44 × 44 px, verifica el href de la cuenta y abre su detalle con clic normal, sin enviar operaciones. |
| Vaciar el pedido a 320 × 720 | Conservar pedido y Vaciar pedido son accesibles por toque. Conservar devuelve el foco al botón de apertura y conserva la línea. El X anterior ya cumplía 44 px por el estilo compartido. La implementación final deja la cancelación explícita. |
| Tipografía de los portales | Antes, los títulos de localizador y detalle calculaban Manrope cargada y la superficie POS calculaba Barlow. En ambos portales, el test final verifica que la primera familia calculada coincide con la del POS y que existe una FontFace cargada de esa familia. Conserva las pruebas de cierre de 44 × 44 px y de foco para localizador. |
| Pantalla reducida durante el cobro | A 390 × 540, el ingreso por teclado propaga 5000 al campo activo. El campo, Cancelar y Confirmar cobro conservan 44 píxeles consecutivos bajo el puntero. Cancelar devuelve el pedido con la línea y sin POST. El viewport se redujo en Chromium para simular el espacio visible bajo el teclado. |
| Nueve paletas canónicas y fotos | El test separado carga las nueve identidades persistentes y compara los colores visibles de las ocho filas en cada semicírculo de 152 px con la auditoría de Figma. El adaptador de pruebas usa la implementación instalada de Next Image. Una miniatura fixture de 2 × 4 píxeles carga con contain y el HTTP404 de otra muestra Sin foto. La captura muestra la imagen diagnóstica. Hubo exactamente dos GET de miniatura y un GET de catálogo en todo el recorrido y tras cambiar entre seis anchos. |

El RED completo de los cuatro primeros casos dio 3 fallos y 1 caso correcto en 26,7 s. Hubo evidencia del enlace de 37 px y de Manrope en los portales. La primera comprobación de altura exigía tocar específicamente la primera tarjeta, aunque se acababa de desplazar hasta Cappuccino. La captura previa demuestra que toda la zona de tarjetas desaparecía. La comprobación final conserva el requisito de acceso físico a una tarjeta y permite conservar la posición de desplazamiento. Durante el desarrollo del escenario de miniaturas se corrigió la búsqueda del DTO de configuración de los IDs canónicos en el fixture. Durante el desarrollo del escenario de teclado se ajustó el criterio al área tocable de 44 px y se incorporó la etiqueta Cancelar del flujo sin error. Estas correcciones fueron de pruebas.

La ejecución enfocada de las seis comprobaciones finales y los tres recorridos de perfil superó **9/9 en 26,0 s**. La primera ejecución completa de superficie y operaciones superó 69/70. El único fallo fue el selector de Cancelar del caso de teclado, corregido para la ejecución enfocada.

Antes de la corrección de la revisión global, la ejecución completa en c6c295f pasó **86/86 en 2,2 min**, con 52 casos de superficie POS, 18 de operaciones y 16 del diálogo de cobro. Registro: task7-browser-final.log.

Después de la corrección, la ejecución completa de be21941 pasó **99/99 en 2,4 min**. Incluye 63 casos de superficie POS, 20 de operaciones y 16 del diálogo de cobro. Entre ellos hay seis con AppShell real que verifican el acceso físico al catálogo para Delivery y al crear un pedido bajo el recibo anterior, a 320 × 720, 360 × 740 y 390 × 844. Esa ejecución también cubre descarte tras rechazo definitivo, revisión de precio actualizada en el payload y recuperación tras un fallo de limpieza local. Evidencia: final-fix-report.md y final-fix-browser.log.

## Comparación visual

Las seis capturas canonical-catalogue-{ancho}.png muestran las paletas auditadas de Figma. A 1280 × 800 el catálogo tiene tres columnas y el pedido queda a la derecha. A 1024 × 768 el catálogo baja a dos columnas junto al pedido. A 768 × 1024 mantiene dos columnas con acceso al pedido desde el resumen. A 390 × 844, 360 × 740 y 320 × 720 usa una sola columna. Las capturas del pedido muestran el mismo carrito en los seis tamaños. Se documentó el ajuste a una vista de pedido en tablet y celular, frente al espacio disponible para el pedido lateral en escritorio.

Los casos existentes cubren altura corta del pedido y modificadores a 390 × 640, cuerpo de modificadores desplazable con cabecera y pie visibles, foco por teclado en los extremos de categorías y tarjetas, y nombre largo con foto ausente a 320 × 720 sin desbordamiento horizontal. El perfil conserva el pedido de tres productos, su total de 18.900, el cambio de filtros y dimensiones y el regreso del cobro sin registrar la venta.

Auditoría visual: task-7-product-visuals-audit.md. [Catálogo Figma de escritorio](https://www.figma.com/design/C0M35OEPwFwn7aqaabqKaq?node-id=160-686) · [Tablet](https://www.figma.com/design/C0M35OEPwFwn7aqaabqKaq?node-id=186-2136) · [Celular](https://www.figma.com/design/C0M35OEPwFwn7aqaabqKaq?node-id=186-2972)

## Perfil comparable

La medición conserva los nueve productos ilustrativos con sus IDs, respuestas, precios y recorrido originales, sin fotos. La prueba canónica es independiente y no altera este perfil. Fuentes de la comparación final: baseline/metrics.json y final-clean-profile/metrics.json. El perfil final corrió sobre be21941, después de terminar Vitest y la compilación Webpack. Pasaron los tres recorridos en 15,2 s, código 0. AppShell se verifica en el escenario separado de regresión. El perfil mantiene el host aislado original para que ambas mediciones usen la misma altura y los mismos fixtures.

En los tres tamaños se mantuvieron **15 GET** por recorrido: 1 de estado de caja, 1 de retiro, 1 de medios de pago, 1 de catálogo, 1 de reposición, 1 de clientes y 9 de configuraciones. Filtrar, cambiar de tamaño y editar no generaron una nueva consulta de catálogo o configuración. Los tres anchos mantuvieron cuatro commits React para búsqueda y filtros. La edición consumió diez commits donde era posible. A 390 px la versión anterior omitía la edición porque la altura disponible para las líneas era cero.

| Tamaño | Catálogo listo, ms | Configuración lista, ms | Commits totales | Tiempo React, ms | Altura de líneas, px |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1280 × 800 | 627,1 → 566,3 | 118,9 → 84,5 | 40 → 40 | 146,1 → 118,2 | 307,9 → 340,1 |
| 768 × 1024 | 562,9 → 495,7 | 125,3 → 112,5 | 41 → 41 | 135,1 → 143,0 | 379,9 → 425,9 |
| 390 × 844 | 537,2 → 504,6 | 107,9 → 103,1 | 31 → 41 | 114,8 → 118,8 | 0 → 189,9 |

El conjunto de rutas y métodos HTTP coincide exactamente entre línea base y versión final en los tres tamaños. Las duraciones React de búsqueda y filtros pasaron de 4,1/3,0/4,1 ms a 3,4/4,7/3,2 ms. La edición pasó de 14,6/14,7/sin edición a 13,2/14,6/12,8 ms. Los diez commits adicionales a 390 px corresponden al recorrido de edición que ahora se puede ejecutar.

El script de profiling sin comprimir pasó de 2.771.954 a 2.799.946 bytes (+27.992, +1,01%). Las cuatro variantes Barlow TTF suman 424.172 bytes de archivos originales. La medición de script excluye recursos de fuente. Los tiempos describen una ejecución local de Chrome con respuestas interceptadas y pueden variar según la carga del host. Falta medir transferencia real de fuentes e imágenes, tiempos de red y tamaño del bundle optimizado por Next.

El perfil anterior en task7-profile/metrics.json se tomó mientras Vitest usaba el host. Midió catálogo listo a 560,6/534,4/542,3 ms, configuración lista a 123,4/108,7/109,0 ms y 2.799.558 bytes de script. Se conserva como registro de la etapa previa.

## Reproducción y capturas

~~~powershell
$env:PLAYWRIGHT_BASE_URL='http://127.0.0.1:3017'
$env:E2E_BROWSER_PATH='C:\Program Files\Google\Chrome\Application\chrome.exe'
$env:POS_SURFACE_REPORT_DIR='.superpowers/sdd/2026-11-20-ux-ui-pos-improvements/task7-profile'
Remove-Item Env:POS_SURFACE_USE_FROZEN_SOURCE -ErrorAction SilentlyContinue
.\node_modules\.bin\playwright.cmd test tests/e2e/pos-surface.spec.ts --reporter=line --grep 'Task 7 |POS baseline preserves'
~~~

La variable PLAYWRIGHT_BASE_URL evita que la configuración arranque un servidor. Las rutas del fixture responden dentro de Chrome. Para la ejecución completa se usa la misma configuración con POS_SURFACE_REPORT_DIR terminado en task7-browser y los tres archivos pos-surface.spec.ts, pos-operation.spec.ts y payment-receipt.spec.ts, sin filtro.

~~~powershell
$env:POS_SURFACE_REPORT_DIR='.superpowers/sdd/2026-11-20-ux-ui-pos-improvements/task7-browser'
.\node_modules\.bin\playwright.cmd test tests/e2e/pos-surface.spec.ts tests/e2e/pos-operation.spec.ts tests/e2e/payment-receipt.spec.ts --reporter=line
~~~

Perfil final sobre be21941:

~~~powershell
$env:POS_SURFACE_REPORT_DIR='.superpowers/sdd/2026-11-20-ux-ui-pos-improvements/final-clean-profile'
.\node_modules\.bin\playwright.cmd test tests/e2e/pos-surface.spec.ts --reporter=line --grep 'POS baseline preserves'
~~~

Evidencia: final-clean-profile.log, final-clean-profile/metrics.json, final-fix-browser.log, task7-browser-final.log, task7-browser-red.log, task7-browser-red/mobile-confirmation-and-first-product.png, task7-browser-profile.log, task7-profile/metrics.json y las capturas en task7-browser/ y task7-profile/. Las pruebas administradas de Next para touch-pos, pos-options-cache y los recorridos de retiro quedan fuera del alcance de la interceptación. Se necesitan un servidor, una base de pruebas habilitada y un dispositivo real para confirmar sus recorridos, el teclado nativo y la entrega de fotos privadas.

Archivos de pruebas del cambio: tests/e2e/pos-surface.spec.ts y tests/helpers/pos-surface-next-image.ts.
