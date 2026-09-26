# Rediseño de interfaz — 0.2.1

## Referencia y alcance

Francisco pidió reemplazar el aspecto de la primera implementación por los cinco prototipos adjuntos: Inicio, Inventario, Productos y recetas, Registrar producción y Cierre diario. También indicó que el header debe estar en la misma línea. Esta entrega modifica las pantallas existentes de Inicio, catálogos, Compras, Inventario y acceso. Producción, recetas y cierre diario conservan sus referencias visuales para una entrega funcional posterior. No se muestran controles falsos ni estadísticas de ventas inventadas.

La skill `frontend-design` de la ruta Windows indicada no existe en este entorno. Se comprobó el catálogo de skills y el sistema de archivos, se informó la limitación y se continuó usando los prototipos explícitos. Se aplicaron las instrucciones disponibles de Superpowers y una revisión independiente de UI, comportamiento y accesibilidad.

## Diseño aplicado

- Sidebar blanco de 250–264 px, con grupos de operación y administración y estado activo azul suave.
- Logo y topbar con exactamente 64 px de altura y borde inferior alineado.
- Título y acción principal alineados arriba en la misma fila en escritorio; adaptación natural a dos filas en teléfonos.
- Tipografía Manrope variable servida localmente, con licencia incluida.
- Fondo azul grisáceo muy claro, superficies blancas con bordes suaves y sombras mínimas.
- Acción principal naranja con texto azul oscuro para mantener contraste; links azules más oscuros que los íconos decorativos.
- Tablas de lectura rápida en escritorio y registros adaptados a móvil, manteniendo todos los datos y acciones.
- Compras organizadas en datos, renglones, revisión y resumen. Selectores cortos sin campo de búsqueda redundante; la búsqueda aparece para listas extensas y conserva el foco al limpiar.
- Inicio consulta los servicios existentes para mostrar los conteos reales, inventario, alertas y compras recientes. Las alertas indican cuántos insumos se consultaron y no representan un análisis financiero completo.
- Menú móvil modal, foco controlado, cierre con Escape y liberación del modal al pasar a escritorio.

## Datos y seguridad

Las migraciones y contratos de escritura no cambian. Permanecen los controles de permisos, costos pendientes, precisión decimal y reintentos de la entrega anterior. Las capturas usan una base temporal de prueba y llevan una etiqueta visible de datos ficticios. No se cargan estos datos al negocio ni se conectan servicios externos.

## Revisión

Se corrigieron los hallazgos de contraste de texto, conservación de seis decimales en Inicio, foco y cambio de breakpoint del menú, y desplazamiento horizontal de Compras. También se corrigió la pérdida de foco de búsqueda al limpiar un filtro y la ventana de interacción con lotes desactualizados después de un ajuste.

## Evidencia

- `npm test`: 67 pruebas aprobadas en siete archivos (23,66 s).
- `npm run build`, `npm run lint`, `npm run typecheck` y `git diff --check`: salida 0 sobre el código final.
- Navegador: 12 escenarios distintos comprobados. La última ejecución completa aprobó 11/12; el único fallo reveló que se podía abrir un conteo con una revisión anterior durante la actualización de una merma. Después de corregirlo, la repetición focal de ese recorrido y del recorrido visual aprobó 2/2 (49 s). No se presenta esto como una tercera ejecución completa.
- La prueba visual verifica la alineación de 64 px entre logo y topbar, título/acción en una fila, ausencia de desborde móvil, cierre del menú con Escape, restauración de foco, cierre al ampliar a escritorio y conservación de foco al limpiar búsquedas.
- Se inspeccionaron las seis capturas finales: Inicio, Inventario, Productos, Compras, formulario de recepción y vista móvil. Se encuentran en `docs/previews/ui-*.png`.
- Un primer intento de la prueba visual falló por un campo faltante en su fixture de precios; se corrigió el fixture. Las pruebas de inventario ahora reutilizan su sesión de prueba, evitando golpear el límite real de inicios de sesión. No se redujo ni desactivó la protección del servidor.

La validación usa Chromium y PostgreSQL embebido en bases temporales. No equivale a una validación de despliegue, Neon, impresoras o integraciones; esos trabajos siguen pendientes según lo acordado.
