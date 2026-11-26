# Fotos y paletas del POS — 21/11/2026

Se incorporan los dos ZIP adjuntados por Francisco: `kybo-fotos-productos-actualizadas.zip` y `kybo-circulos-y-semicirculos-actualizados.zip`.

Las 43 fotos WebP originales y la versión WebP de sándwich con gaseosa suministrada después se conservan en `public/images/pos-products`, con transparencia y sombra integradas. Las 43 paletas de ocho bandas se transcriben de `productos-y-paletas.json` a `src/components/sales/product-visual-assets.ts`; el semicírculo existente conserva la forma y usa esos colores exactos, en orden de arriba hacia abajo. Alimentos y combos usan crema #fff1d4. Los SVG/WebP decorativos son referencias equivalentes al gradiente; no se añaden solicitudes de imagen para cada fondo.

Las coincidencias verificadas cubren 37 productos actuales. La asociación se resuelve por UUID en `pos-presentation.ts`, independientemente del nombre. La foto suministrada prevalece sobre la foto anterior solo en las tarjetas del POS. Las fotos locales pasan por el optimizador de Next con un espacio declarado de 100 px; las fotos autenticadas del catálogo conservan su ruta y modo sin optimización. Todas se muestran completas, sin agregar otra sombra.

El producto configurable Kybo Shake usa Americana y Kybo Frozen usa Mango y Durazno como imágenes representativas. Las otras variantes entregadas se conservan disponibles, sin crear productos nuevos ni cambiar las opciones actuales. Waffle Clásico y Waffle de Salame comparten la foto de Waffle salado según la descripción del ZIP.

## Asociación con el catálogo

| Producto actual               | Archivo de imagen                |
| ----------------------------- | -------------------------------- |
| Blue Iced Matcha              | blue-iced-matcha.webp            |
| Blueberry Bubble              | blueberry-bubble.webp            |
| Bubble Sunrise                | bubble-sunrise.webp              |
| Café                          | americano.webp                   |
| Cappuccino                    | cappuccino.webp                  |
| Coffee Iced Latte             | coffee-iced-latte.webp           |
| Combo 2 medialunas + Café     | medialunas-cafe.webp             |
| Combo Box waffle para 4       | box-waffle-para-4.webp           |
| Combo Superpancho + Gaseosa   | superpancho-lata-de-gaseosa.webp |
| Combo Superpancho para 2      | 2-superpanchos-gaseosa.webp      |
| Combo Waffle + Café           | waffle-cafe.webp                 |
| Combo Waffle + Gaseosa        | waffle-lata-de-gaseosa.webp      |
| Combo Waffle para 2           | 2-waffles-gaseosa.webp           |
| Kybo Frozen                   | frozen-mango-y-durazno.webp      |
| Kybo Shake                    | kybo-shake-americana.webp        |
| Kybo Shake Oreo               | kybo-shake-oreo.webp             |
| Kybo Shake Taro               | kybo-shake-taro.webp             |
| Kybo Soft Sundae Chocolate    | kybo-soft-chocolate.webp         |
| Kybo Soft Sundae Frutilla     | kybo-soft-frutilla.webp          |
| Kybo Soft Sundae Frutos rojos | kybo-soft-frutos-rojos.webp      |
| Kybo Tea                      | kybo-tea.webp                    |
| Matcha Caliente               | matcha-caliente.webp             |
| Matcha Iced Latte             | iced-matcha.webp                 |
| Medialuna                     | medialunas.webp                  |
| Oreo Iced Latte               | oreo-iced-latte.webp             |
| Red Matcha                    | red-matcha.webp                  |
| Superpancho                   | superpancho.webp                 |
| Taro Caliente                 | taro-caliente.webp               |
| Taro Iced Latte               | taro-iced-latte.webp             |
| Tropical Matcha               | tropical-matcha.webp             |
| Waffle Clásico                | waffle-salado.webp               |
| Waffle de Salame              | waffle-salado.webp               |

## Equivalencias aprobadas el 23/11/2026

Francisco confirmó usar Flat White para Café con Leche, Mocca para Chocolatada Caliente y Tostados para las dos fichas de Sándwich de miga. Las fotos y paletas quedan asociadas por UUID, sin cambiar nombres, recetas ni precios.

| Producto actual            | Archivo de imagen          |
| -------------------------- | -------------------------- |
| Café con Leche             | flat-white.webp            |
| Chocolatada Caliente       | mocca.webp                 |
| Sandwich de miga clásico   | tostados.webp              |
| Sandwich de miga de salame | tostados.webp              |
| Combo Sandwich + Gaseosa   | tostados-lata-gaseosa.webp |

La foto suministrada de Tostados incluye café y es idéntica a `tostados-cafe.webp`. Para Combo Sandwich + Gaseosa, Francisco adjuntó después `tostados-lata-gaseosa-sin-fondo.png`: se publica como `tostados-lata-gaseosa.webp`, como WebP de calidad 95, conservando su resolución, canal alfa y composición. El PNG fuente se conserva sin cambios. Este combo utiliza la paleta crema #fff1d4 de los alimentos y combos.

Verificación de estas equivalencias: 24/24 pruebas focalizadas de presentación y carga del catálogo y el recorrido de imágenes reales, colores y fallback en seis anchos de pantalla. Las cuatro asociaciones nuevas se comprobaron también con una foto antigua y sin foto en el catálogo.

Verificación del combo adjuntado: 25/25 pruebas focalizadas y recorrido de fotos reales y paletas en seis anchos; el PNG fuente se conserva sin cambios y la versión web mantiene exactamente el canal alfa y la resolución.

## Productos sin coincidencia confirmada

Conservan su foto del catálogo, si existe, y el fondo neutro.

- 7up 500 ml
- 7up en lata
- Cookie chispas de chocolate
- Cookie chocolate
- Cookie especial
- Cookie red velvet
- Kybo Soft Cono
- Mirinda 500 ml
- Mirinda en lata
- Pepsi 500 ml
- Pepsi Max 500 ml
- Pepsi en lata
- Pepsi max en lata

Las fotos futuras cambiadas desde la ficha administrativa no reemplazan automáticamente los recursos aprobados de estas tarjetas; para actualizar la identidad del POS se modifica esta asociación. No se escribieron productos, imágenes ni otros registros en la base compartida con producción.

## Verificación

- 43/43 WebP coinciden byte por byte con los adjuntos y tienen transparencia real. Las 43 paletas conservan las ocho bandas originales, en orden.
- 20/20 pruebas focalizadas de presentación y carga del catálogo; el cambio se reprodujo primero con cinco fallos y luego pasó.
- 63/63 recorridos de navegador con HTTP interceptado, incluidos fotos reales, fallback del catálogo, paletas y seis anchos de pantalla (1280, 1024, 768, 390, 360 y 320 px). No aumentan las lecturas del catálogo al cambiar de ancho.
- TypeScript, ESLint focalizado, formato y build de producción con Webpack pasaron. La revisión independiente no encontró problemas críticos ni importantes.
- El optimizador real devolvió HTTP 200, WebP de 128 × 96 px, canal alfa no opaco y 2398 bytes para Oreo Iced Latte. Esta comprobación completa el límite del fixture de navegador, que entrega los archivos originales.
- Suite global: 1201 pruebas pasaron, 2 fallaron y 86 se omitieron; 11 archivos figuran fallidos. Ocho suites históricas fallan al preparar sus fixtures (`catalog`, `inventory`, `modifiers-schema`, `modifiers`, `preparation`, `production`, `recipes`, `sales`) y `data-model.concurrency` requiere `KYBO_TEST_DATABASE_URL` dedicada. Las dos aserciones fallidas son `checkout-performance.integration` (52 consultas frente al límite de 50, ya reproducido en la base de la rama) y `manual-day-isolation` (EPERM al crear una junction). La suite global no está verde; estos resultados no proceden del cambio de fotos.
