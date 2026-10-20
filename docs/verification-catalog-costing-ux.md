# Catálogo y Costeo: simplificación de navegación — 19/10/2026

## Alcance

- El listado muestra un único precio de venta, Mostrador, en escritorio y móvil. Se conserva el costo estimado. Los precios de otros canales siguen editándose en la ficha.
- Costeo empieza con un resumen de precio al cliente, costo del producto y margen final estimado. Canal, medio de pago y mes se eligen juntos.
- Un desglose compacto muestra costo directo, IVA, IIBB, comisión y gastos asignados. Las explicaciones fiscales, el presupuesto por concepto, la comparación entre medios de pago y el detalle de ingredientes/variantes se despliegan a pedido.
- Los importes pendientes siguen siendo pendientes y los márgenes negativos se destacan. Se conservan los cálculos y el precio final confirmado por el usuario.
- Al alternar pestañas permanecen montados el editor y el resumen, para conservar los borradores y las selecciones. Los controles de visualización no invalidan la consulta financiera.

## Verificación

- 17 pruebas de cálculo y componentes correctas en 5 archivos (precios finales, IVA, rentabilidad, gastos y presentaciones de importes).
- 3 flujos de navegador correctos en una base temporal aislada: presupuesto y margen con IIBB, conservación del borrador de receta y cobro al precio final con historial intacto.
- El catálogo muestra un único precio de venta en escritorio y móvil. Los detalles IVA no aparecen en el listado.
- Se comprobó que el resumen se vea sin desplazamiento en escritorio, el ancho del modal en móvil y el acceso a los conceptos del presupuesto mediante el desplegable.
- Alternar pestañas conserva la cantidad 125 del borrador y el medio de pago elegido. Las interacciones de Costeo mantienen una sola consulta financiera. Sin advertencias por claves React duplicadas.
- Capturas revisadas: catálogo de escritorio/móvil, Costeo completo y con datos pendientes, y Costeo móvil. Se esperó la transición de tamaño del modal antes de medir/capturar su ancho.
- Tipos, lint y formato de los archivos afectados correctos, sin errores. `git diff --check` correcto. Evidencia de tipos en `.local/costing-ux-types-final.log`.
- No se modificó la base de desarrollo ni el `.env`; sin migraciones, commits ni push. Los archivos de configuración temporales de la prueba de navegador fueron restaurados por su runner.
