# Punto de equilibrio en Finanzas

La solicitud es revisar los gastos y el costeo reales de la sucursal y añadir un análisis que explique márgenes negativos y estime el volumen necesario para cubrir los gastos mensuales. Se preservan datos, precios, recetas, impuestos configurados y cambios locales. No se ejecutan migraciones ni commits/push.

Se amplía Finanzas con un panel de Punto de equilibrio separado del formulario de Gastos del mes. La consulta es sólo lectura, por sucursal y mes, exclusiva para encargados. Usa el presupuesto mensual guardado y los mismos precios finales, IVA extraído, IIBB, costos de composición predeterminada y comisiones que Costeo. No calcula el equilibrio a partir del margen que ya descuenta gastos fijos: primero obtiene el aporte por venta y después lo compara con el presupuesto. No suma IVA al precio, no duplica costos generales ni usa costos pendientes como cero.

Las unidades finales siguen la convención existente: un producto individual es una unidad y un combo suma sus componentes. En una mezcla, el aporte promedio se divide por unidades finales; el equilibrio individual se muestra como cantidad de ventas de ese producto/combos y sus unidades finales. Se usan operaciones exactas y redondeo hacia arriba para el umbral.

La mezcla observada contiene cantidades de productos individuales y padres de combos en ventas cerradas del mes (no sus componentes, para no duplicarlos). Sirve como proporción para simular precios y costos actuales; no es una liquidación contable de ventas históricas. Si no hay ventas, no se inventa una mezcla ni un punto de equilibrio global: se permite elegir cantidades relativas por producto. Canal y medio de pago son hipótesis visibles seleccionables. Se puede variar volumen y días de apertura localmente sin modificar el presupuesto. La composición predeterminada y el origen estimado del costo se identifican claramente.

El panel resume gastos, aporte promedio, unidades de equilibrio y resultado al volumen previsto; muestra bloqueos concretos cuando faltan costos, impuestos, mezcla o comisiones. El detalle por producto explica aporte antes de gastos, gastos asignados y resultado después del prorrateo. Cada equilibrio por producto se identifica como escenario de vender únicamente ese producto. Se conservan notificaciones flotantes de error, campos obligatorios y diseño existente de enlaces/tabs.

La consulta pesada se activa sólo al abrir el panel, se conserva en memoria durante la sesión de ese panel y se renueva al cambiar mes, sucursal o guardar gastos/Actualizar. Editar cantidades, canal, medio de pago o días sólo recalcula en memoria. No agrega cálculos a cada render de Gastos ni al catálogo.

Referencia del cálculo multiproducto: https://openstax.org/books/principles-managerial-accounting/pages/3-4-perform-break-even-sensitivity-analysis-for-a-multi-product-environment-under-changing-business-situations
