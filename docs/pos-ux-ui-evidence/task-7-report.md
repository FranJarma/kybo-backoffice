# Tarea 7. Cierre visual de la aplicación

## Cambios

- El catálogo aplica las nueve paletas verificadas en Figma mediante el ID persistente de cada producto. Cada paleta define ocho filas de 19 px y el semicírculo de 152 px se pinta con un único gradiente lineal. Los otros IDs, incluidos los de Taro Iced Latte, Matcha Iced Latte y Kybo Tea, conservan los cuatro colores neutros. Las fotos siguen el `imageAssetId` persistido.
- El catálogo y el pedido comparten la presentación compacta de los controles a 1023 px o menos. Los cambios de origen, cumplimiento, cliente y localizador siguen usando los componentes y el estado compartidos.
- El enlace a una cuenta abierta tiene un área mínima de 44 × 44 px y foco visible. Conserva su `href` y el manejador existente. Vaciar el pedido ofrece «Conservar pedido» como cancelación explícita de al menos 48 px.
- El POS pasa su clase de superficie a los portales de localizador, detalle de venta, ayuda de stock y anulación. Localizador y detalle reciben una propiedad opcional para conservar el estilo de otros usos. Sus controles de cierre ya medían al menos 44 px.
- La prueba administrada de opciones compara la primera familia calculada con `--font-pos` y verifica que existe una `FontFace` cargada de esa familia. Conserva las aserciones de carga, caché, edición y redimensionado.

## Evidencia

| Comprobación | Antes | Después |
| --- | --- | --- |
| Identidad persistente y semicírculo | Vitest 7/9. El Oreo Iced Latte con ID real usaba la paleta neutra y el gradiente se repetía. | Vitest 9/9. Un cruce con la tabla auditada confirmó los nueve IDs y los 72 colores de fila. Chromium confirmó los nueve gradientes canónicos. |
| Catálogo al confirmar a 390 × 844 | La captura muestra las categorías seguidas de «Ver pedido» sin una tarjeta visible entre ambos. El test original confirmó que la primera tarjeta carecía de 44 px consecutivos interactivos. | Chromium encontró un producto visible con 44 px consecutivos interactivos. El clic abrió la configuración del siguiente pedido con el recibo todavía abierto al iniciar la interacción. |
| Enlace de cuenta a 320 px | Chromium midió 37 px de altura. Validó el enlace nativo y la apertura con clic. | La prueba pasó con 44 px mínimos en ambas dimensiones, el mismo destino y apertura en el POS. |
| Tipografía de localizador y detalle | Ambos resolvieron Manrope cargada. La superficie del POS resolvió Barlow cargada. | Ambos resolvieron la misma familia Barlow cargada que el POS, con controles de cierre de al menos 44 px. |
| Cierre y foco al conservar el pedido | El cierre X medía al menos 44 px por el estilo global existente. El botón permitía cancelar y devolver el foco. | Chromium verificó la cancelación explícita, sin un segundo cierre X, y la devolución del foco. |

El test de catálogo ahora mide un producto visible y habilitado, porque la posición de scroll previa puede dejar otros productos antes del área visible. La captura inicial demuestra que el defecto era la ausencia de tarjetas accesibles. La posición de scroll se conserva.

Pasaron seis casos dirigidos de Chromium y tres recorridos con las mismas condiciones de perfilado de 1280, 768 y 390 px en una sola ejecución (9/9, 26 s). Se probaron la miniatura y el fallback de Next Image en la fixture HTTP interceptada. La reducción de altura simula el espacio disponible con un teclado abierto. Playwright listó `pos-options-cache.spec.ts`, pero el arranque de E2E administrado se detuvo en la protección de migración genérica de esta versión antes de probar la fuente bajo Next.

Evidencia local en `task7-presentation-red.log`, `task7-presentation-green.log`, `task7-browser-red.log`, `task7-browser-profile.log`, `task7-browser-red/mobile-confirmation-and-first-product.png` y `task7-profile/`. ESLint dirigido, Prettier dirigido y `git diff --check` terminaron con código 0.

## Archivos de aplicación y pruebas

- `src/components/sales/pos-presentation.ts`, `src/components/sales/product-card.tsx` y `tests/pos-presentation.test.ts`.
- `src/components/sales/pos.css`, `src/components/sales/order-controls.tsx` y `src/components/sales/sales-manager.tsx`.
- `src/components/pickup/locator-picker.tsx` y `src/components/sales/sale-detail-dialog.tsx`.
- `tests/e2e/pos-options-cache.spec.ts`.

