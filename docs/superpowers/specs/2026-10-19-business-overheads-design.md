# Gastos del negocio y prorrateo mensual

Estado: diseño para revisión, 19/10/2026. Todavía no se implementó este módulo ni se aplicaron migraciones para gastos generales.

## Necesidad y decisiones confirmadas

Kybo necesita registrar alquiler, electricidad, internet, sueldos, impuestos, tasas y otros gastos del local para conocer cuánto debe recuperar cada producto, además de sus ingredientes, mermas, descartables y comisión de cobro.

El usuario confirmó que el reparto incluye **todos los productos vendidos**, también las bebidas compradas listas. También eligió **estimación mensual y cierre real**: planificar con gastos y volumen previstos, y comparar posteriormente con gastos y ventas reales. La operación admite varias sucursales con ubicaciones; los gastos y períodos deben pertenecer a una sucursal.

## Criterio de cálculo

La primera versión propone un reparto uniforme por unidad final vendida, con un período mensual por sucursal. Es simple de operar y cumple el criterio de dividir los gastos entre las unidades. Un reparto ponderado por tiempo de preparación o uso de equipamiento, o proporcional a facturación, requeriría otra base y se deja para una ampliación.

Para planificar:

`Gasto general estimado por unidad = gastos presupuestados del mes / unidades finales previstas del mes`

Para analizar el cierre:

`Gasto general real por unidad = gastos reales del mes / unidades finales efectivamente vendidas del mes`

La tasa presupuestada se mantiene estable durante el mes salvo que el encargado revise expresamente el presupuesto. Las ventas transcurridas hasta hoy no sustituyen automáticamente al volumen mensual previsto. Esto permite evaluar precios antes del cierre sin que un día con pocas ventas distorsione la estimación. Referencia conceptual: [ACCA, absorción de gastos generales y comparación con datos reales](https://www.accaglobal.com/caribbean/en/student/exam-support-resources/fundamentals-exams-study-resources/f2/technical-articles/overhead-absorption.html).

Ejemplo ilustrativo: $2.000.000 presupuestados y 4.000 unidades previstas asignan $500 a una unidad final. Un producto con costo directo de $1.800 tendría $2.300 de costo de gestión antes de comisión. Si al cerrar se registran $2.100.000 reales y 3.500 unidades vendidas, la referencia real del período será $600 por unidad. Los dos valores permanecen identificados.

## Qué cuenta como unidad

- Un producto individual vendido cuenta por su cantidad, tanto preparado como comprado listo.
- Un combo toma la suma de las cantidades de sus componentes finales. Un waffle más una gaseosa equivalen a dos unidades; dos waffles más una gaseosa equivalen a tres.
- El encabezado del combo no se cuenta otra vez. El modelo actual ya conserva líneas de componentes y cantidades, por lo que no hace falta deducirlo de la definición vigente del combo.
- Preparado de chai, tapioca cocida, mezcla o tapas de waffle son preparaciones intermedias: no se suman como ventas adicionales cuando se incorporan a un producto final.
- El cierre toma ventas cerradas y no anuladas de la sucursal, por su fecha de operación (`businessDate`). Pedidos abiertos y ventas anuladas se excluyen.
- El conteo de cierre usa las líneas guardadas en la venta; editar después una receta o un combo no modifica su cantidad histórica.

El volumen previsto se carga siguiendo esta misma definición, para comparar magnitudes equivalentes. La ayuda del formulario explicará el caso de los combos.

## Registro de gastos

Nueva sección de gestión **Finanzas → Gastos del negocio**, accesible para encargados y administradores de la sucursal seleccionada.

Cada mes permite cargar varias líneas con categoría, concepto, importe presupuestado, importe real y observaciones opcionales. Categorías iniciales: alquiler, electricidad, agua/gas, internet/telefonía, sueldos y cargas, impuestos y tasas, limpieza/mantenimiento y otros. Se admiten conceptos propios para el negocio. No se implementa liquidación de sueldos ni declaración de impuestos.

La categoría organiza el gasto; no presupone que su importe sea fijo. Por ejemplo, electricidad e impuestos pueden variar de un mes a otro. El presupuesto y el importe real se guardan por separado. Un real vacío significa pendiente de registrar; cero es una confirmación explícita. Lo mismo se aplica a un presupuesto faltante.

Los importes a incluir corresponden a los gastos que deban recuperarse mediante este análisis de gestión. El sistema no suma automáticamente el IVA de las ventas ni las comisiones, compras de ingredientes, envíos o descartables que ya formen parte de los otros costos. La pantalla explicará esta separación para evitar duplicaciones. No decide por sí misma qué impuestos o créditos fiscales son recuperables.

Copiar el presupuesto de otro mes puede ofrecerse como acción explícita; no copia importes reales ni crea gastos mediante una automatización silenciosa.

## Períodos, cierre e historial

Un período pertenece a una sucursal y a un mes calendario, con identidad única. Conserva las unidades previstas, líneas de gasto, estado y revisión. Fechas y permisos siguen el contexto operativo de esa sucursal.

Antes del cierre se muestran presupuesto, reales cargados, datos pendientes y ventas contadas hasta la consulta. El cierre exige confirmar que los gastos reales estén completos. Conserva una copia del presupuesto, gastos reales, unidades contadas, fecha de corte y usuario que cerró.

Si no hubo ventas, los gastos se conservan íntegros y el importe por unidad queda sin determinar; no se divide por cero ni se presenta un costo cero. La falta de unidades previstas deja pendiente la estimación para precios.

El cierre representa los datos disponibles a su fecha de corte. Una corrección o anulación posterior requiere una revisión explícita del cierre, con motivo e historial; no sobrescribe silenciosamente el cierre anterior. La corrección del cierre no altera importes cobrados ni condiciones guardadas en las ventas.

Las mutaciones tendrán control de revisión, reintentos idempotentes y auditoría, siguiendo los patrones existentes. Los totales y cantidades originales son la fuente del cociente; los importes de dos decimales mostrados no se usan para reconstruir el total mensual.

## Integración con Costeo

El costo directo de la receta sigue identificando ingredientes, preparaciones, merma y descartables de la sucursal. Se añade un bloque de **Gastos generales asignados**, con sucursal, mes, presupuesto y volumen utilizados.

La comparación por medio de pago mostrará:

1. Precio de venta sin IVA.
2. Costo directo del producto.
3. Comisión del medio de pago, calculada sobre el importe final con IVA.
4. Gastos generales asignados a esa unidad o a los componentes incluidos del combo.
5. Margen estimado antes de gastos generales, como actualmente.
6. Margen estimado después del prorrateo.

La fórmula adicional será:

`Margen después del prorrateo = precio sin IVA − costo directo − comisión − gastos generales asignados`

La estimación de precios usa el presupuesto mensual elegido. El cierre permite comparar tasa presupuestada y real del período. Aplicar la tasa real de un mes a una receta o precio actuales debe identificarse como simulación; no constituye un margen histórico real de ese producto.

Si el período, presupuesto o volumen no están configurados, la parte posterior al prorrateo queda pendiente y ofrece un acceso a Gastos del negocio. El margen antes de gastos generales continúa disponible. Costos y comisiones desconocidos también permanecen pendientes.

La asignación es para gestión y rentabilidad: no cambia ingredientes, consumos de stock, costos históricos del inventario ni precios de venta automáticamente. El cliente continúa viendo el precio final con IVA. Los datos financieros siguen protegidos en el servidor.

## Verificación prevista

- Presupuesto de $2.000.000 / 4.000 unidades = $500 por unidad; cierre real $2.100.000 / 3.500 = $600.
- Separación de presupuesto y real, dato pendiente y cero explícito; importes y unidades fuera de rango.
- Inclusión de gaseosas y productos preparados; exclusión de preparaciones intermedias; combos sin doble conteo y con cantidades múltiples.
- Ventas abiertas, anuladas y de otras sucursales excluidas; límites mensuales según fecha de operación.
- Ausencia de gastos o volumen y mes sin ventas, sin producir una rentabilidad ficticia.
- Redondeo, conservación de totales y márgenes negativos.
- Permisos, conflicto de revisión, doble envío y revisión auditada de un cierre.
- Cambios posteriores de catálogo, combo o comisión que no alteren cierres anteriores.
- Flujo completo en navegador: cargar presupuesto, registrar reales, consultar Costeo, cerrar el período y comparar resultados.

Fuera de esta primera versión: contabilidad general, conciliación bancaria, nómina, automatizaciones de pago, emisión ARCA y reparto ponderado por actividad.
