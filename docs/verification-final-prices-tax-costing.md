# Precio final e impuestos en Costeo — 19/10/2026

## Criterio confirmado

El usuario confirmó que el importe cargado en catálogo es el precio final: $6.000 sigue siendo $6.000. Los recargos y adicionales usan la misma convención. No se convirtieron importes almacenados ni se reescribieron ventas anteriores.

El IVA se extrae del precio final para el análisis: con 21%, $6.000 contienen $1.041,32 de IVA y $4.958,68 netos. No se suma otro 21% ni se descuenta dos veces al calcular el margen. Este IVA de venta no representa por sí solo el saldo fiscal: faltan créditos de compras y demás ajustes. La configuración fiscal del producto sigue siendo explícita, sin asignar alícuotas automáticamente.

IIBB se registra como una estimación efectiva por sucursal y mes, sobre la venta sin IVA, junto con el presupuesto de gastos. El usuario informó inscripción en Salta y no confirmó aún el régimen/alícuota: se mantienen pendientes. Un cero es explícito. No se implementó integración con ARCA ni una liquidación fiscal de IIBB.

## Cambios

- Catálogo, caja, configurador de opciones, combos y controles del servidor usan los importes finales; se extrae IVA al guardar snapshots de las ventas nuevas.
- Costeo muestra Impuestos (IVA contenido e IIBB estimado), Gastos fijos y generales (presupuesto por concepto y prorrateo) y Rentabilidad por medio de pago.
- El margen previo a IIBB/gastos se conserva; el margen final descuenta costo directo, IVA contenido, IIBB estimado, comisión y gastos asignados. Si falta un dato, permanece pendiente.
- El enlace a gastos conserva el mes seleccionado. El formulario mensual permite configurar IIBB y evita sobrescribir su tasa cuando escribe un cliente anterior que omite ese campo. Los cierres conservan su tasa original.
- No debe registrarse otra vez IVA/IIBB ya desagregado dentro de los gastos generales. La interfaz lo aclara.
- Receta y Rentabilidad tenían la misma clave React del producto dentro del mismo padre. Ahora usan identidades `recipe:<id>` y `profitability:<id>`.

## Verificaciones

- 57 pruebas pasaron en 12 archivos: precio final, IVA 10,5/21%, recargos, combos, precisión, margen, tasas pendientes/cero, comisiones, sucursales, permisos, reintentos, revisión fiscal, snapshots e IIBB en cierres.
- El defecto de claves se reprodujo primero en navegador: tres advertencias al alternar Receta/Costeo. La misma prueba pasó con las claves diferenciadas.
- La prueba nueva de precio final falló antes de cambiar el código y pasó después. La prueba de tasa IIBB primero falló por no existir el campo; luego verificó persistencia, cero, actualización parcial e historial.
- Migración `0023_costing_iibb` aplicada en desarrollo. Historial/hashes verificados; huellas de las 14 tablas comprobadas conservadas, excluyendo únicamente la columna nueva nullable. Sin tasas asignadas ni cambios de `.env`.
- Revisión independiente estática: sin regresiones importantes dentro del alcance. Cálculos fiscales concretos de Salta, presentación de declaraciones y trabajo anterior al checkpoint quedaron fuera de esa revisión.
- Navegador: **3/3 flujos correctos** (costeo mensual y revisión con IIBB, Receta/Costeo sin claves duplicadas y cobro al precio final con snapshots conservados). Se comprobó el IVA contenido y el margen final con presupuesto/IIBB configurados en una base descartable.
- Revisión final de tipos y lint de archivos afectados: **sin errores ni advertencias**. `git diff --check` correcto. Se revisaron capturas de las secciones de impuestos y gastos, y las pantallas de catálogo en escritorio/móvil.

## Decisiones y límites

- Se aplicó el criterio de importe final confirmado por el usuario también a los recargos y combos. Si el negocio quisiera otro criterio para un adicional, puede editar su importe futuro; los históricos se conservan.
- IIBB es una tasa efectiva manual de gestión mensual, sin presumir régimen local ni alícuota legal. Debe confirmarse con el contador. Para Convenio Multilateral puede requerirse otro reparto; esta pantalla no atribuye bases entre jurisdicciones.
- Se continuó inline en el checkout/feature branch actual, preservando el trabajo anterior y sin nuevos commits/push. La solicitud y la aclaración de precios constituyen la autorización para el cambio; la bitácora se mantiene en PowerShell. El plan puede revisarse antes de publicar.
- No se repitió la suite histórica completa con sus fallos de fixtures conocidos; se verificaron los módulos afectados y sus integraciones.

## Referencias consultadas

- [ARCA, régimen de transparencia fiscal: IVA contenido](https://biblioteca.arca.gob.ar/search/query/norma.aspx?p=t%3ARAG%7Cn%3A5614%7Co%3A9%7Ca%3A2024%7Cf%3A12%2F12%2F2024).
- [Rentas Salta, nomenclador de actividades](https://www.dgrsalta.gov.ar/Inicio/Actividades). La tasa depende de la actividad y de las condiciones del contribuyente; no se tomó una tasa de buscadores como dato de Kybo.
- [Código Fiscal de Salta, texto actualizado publicado](https://boletinoficialsalta.gob.ar/Texto_Actualizado.php?cXdlcnR5dGFibGE9TXw5Lzc1JmNhYmU9PGg2PiBQdWJsaWNhZG8gZW4gZWwgQm9sZXTDg8KtbiBPZmljaWFsIE7DgsKwIDAsIGVsIGTDg8KtYSAgZGUgIGRlIDwvaDY+PEJSPnF3ZXJ0eQ=%3D).

Los porcentajes de IIBB de las pruebas son ilustrativos y solo existen en bases descartables.
