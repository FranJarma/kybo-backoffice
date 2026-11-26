# Evidencia POS

[Verificación y límites](../pos-ux-ui-verification.md). [Comparación JSON](comparison.json), [baseline](baseline/metrics.json) y [perfil final](final/metrics.json).

Las capturas usan SalesManager, sus componentes reales, CSS y fuentes locales en Chrome de Windows. Todas las respuestas HTTP son fixtures; no se escribieron ventas reales. Los nueve productos ilustrativos del recorrido de comparación son idénticos antes y después. Las capturas `canonical-catalogue-*` usan un escenario adicional con los nueve IDs persistentes cuya paleta se verificó en Figma.

La pequeña imagen de prueba de Oreo en ese escenario es un PNG sintético de 2×4 píxeles: comprueba Next Image real, thumbnail128, proporción y fallback ante 404. No es una foto de producción. La entrega de fotos privadas desde Vercel Blob no se verificó; la aplicación conserva imageAssetId y su ruta de medios existentes.

## Comparación de comportamiento

| Medida | Antes | Después |
| --- | --- | --- |
| Peticiones por recorrido y ancho | 15 | 15 |
| Catálogo / configuraciones / localizadores | 1 / 9 / 1 | 1 / 9 / 1 |
| Renders al buscar | 4 | 4 |
| Renders al editar, escritorio y tablet | 10 | 10 |
| Área de líneas, celular 390×844 | 0 px; edición bloqueada | 189,875 px; edición funcional |
| Script del fixture con profiling | 2.771.954 bytes | 2.799.946 bytes (+1,01 %) |

Los diez renders adicionales del recorrido móvil corresponden a la edición que el baseline no pudo realizar. No hubo peticiones adicionales al filtrar, redimensionar o reabrir configuraciones. Se conservaron el TTL, solicitudes en vuelo, dos workers de precarga y consulta compartida de localizadores.

Las mediciones de tiempo son observaciones locales con red interceptada y una muestra por ancho. No representan latencia de producción. El perfil final se repitió en `be21941` después de terminar build y tests, sin comprobaciones intensivas en paralelo: 3/3 recorridos pasaron en 15,2 s. El script de profiling no es el bundle optimizado de Next. Las cuatro fuentes Barlow suman 424.172 bytes sin comprimir; no se atribuye ese valor a transferencia comprimida.

## Capturas

- `baseline/` y `final/`: catálogo, modificadores, pedido y efectivo a 1280×800, 768×1024 y 390×844.
- `final/canonical-catalogue-*`: identidad visual a 320, 360, 390, 768, 1024 y 1280 px.
- `final/order-*`, `focus-*`, `320-long-name.png`: altura corta, otros anchos, foco y nombres largos.
- `final/390-payment-keyboard-equivalent.png`: viewport reducido de Chrome; no es un teclado Android/iOS físico.
- `final/mobile-confirmation-catalogue.png`: una tarjeta visible admite un toque normal e inicia el siguiente pedido sin descartar el recibo anterior, conservando el scroll.
- `final/320-locator.png` y `320-sale-detail.png`: portales con la fuente POS cargada y cierres táctiles.

La ejecución final de navegador pasó 99/99 casos: 63 de superficie POS, 20 del hook de operaciones y 16 de cobro aislado. Seis casos adicionales montan el AppShell real y verifican la cabecera, altura del contenido, desplazamiento y toque físico de productos a 320/360/390 px en delivery y después de cobrar. El perfil y sus capturas mantienen el fixture original sin AppShell para que el antes/después sea comparable; no representan la altura útil del shell real. La revisión final y su única corrección están en [reviews](reviews/).

El E2E administrado y PostgreSQL con dos conexiones tienen límites separados en la verificación principal. Los informes conservan los hallazgos y correcciones; sus rutas temporales indican dónde se produjo la evidencia, mientras que las capturas durables están en este directorio. Las capturas contienen fixtures. Su publicación en el repositorio público quedó pendiente de autorización explícita después del rechazo de la revisión automática; la entrega local conserva la evidencia completa.
