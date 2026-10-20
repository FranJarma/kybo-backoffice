# Precios finales e impuestos en Costeo

Goal: respetar el precio final cargado en catálogo y desglosar IVA/IIBB, costo directo y gastos generales dentro de Costeo; corregir claves duplicadas.
Spec: solicitud del usuario del 19/10/2026 y aclaración explícita: el importe del catálogo es el precio final; inscripción en Salta, régimen aún por confirmar. No se inventa alícuota de IIBB.
Architecture: mantener precios y recargos almacenados como importes finales; extraer IVA para netos e históricos nuevos; preservar snapshots de ventas anteriores. IIBB estimado configurable junto con presupuesto mensual de sucursal, con snapshot en cierres. Datos desconocidos siguen pendientes. Reusar servicios de gastos y cálculo exacto.
Tech Stack: Next 16, React 19, Drizzle/PostgreSQL, PGlite/Vitest, Playwright.

## Global constraints
- Sin commits/push nuevos; conservar cambios locales, `.env`, importes de catálogo y ventas históricas.
- No confundir IVA contenido en venta con saldo fiscal a pagar (requiere créditos de compras). IIBB sobre venta neta para estimación; alícuota efectiva confirmada por el usuario/contador, nunca asignada automáticamente.
- No duplicar impuestos dentro del presupuesto de gastos generales.
- Se ejecuta inline con el criterio de precio confirmado por el usuario, sin volver a pedir autorización.

## Review focus
Precios y recargos finales en caja individual/combos; redondeo y snapshots; desconocidos/cero; actualización parcial preserva IIBB existente; claves estables; sin consultas por cada interacción; permisos y cierres inmutables.

## Task 1: clave de paneles
- [x] Reproducir en navegador Receta/Costeo, capturando console warnings; esperado rojo con dos claves iguales.
- [x] Separar identidad de ambos paneles mediante claves con prefijo por componente; esperado verde en el mismo flujo.

## Task 2: precio final y cálculo fiscal
Files: pricing/amounts, product-profitability, catalog price UI, sales lookup/service, recipe configuration, configuradores individual/combo, labels de precio/recargo, tests de pricing e integración.
- [x] Pruebas primero de precio catálogo 6000 que sigue 6000; IVA21 =1041.32 y neto4958.68; IVA10.5; combos y recargos sumados sin IVA adicional; históricos y comisiones.
- [x] Implementar contrato explícito de base final y extracción de IVA una sola vez.
- [x] Ejecutar pruebas focalizadas y ajustar escenarios anteriores a la decisión nueva del negocio.

## Task 3: IIBB y organización de Costeo
Files: overhead schema/service/types, migration0023, helper y aplicador seguro; expenses-manager; profitability UI; pruebas de gastos/costeo.
- [x] Pruebas primero: IIBB pendiente/0/4.5 ilustrativo, presupuesto y cierre conservan tasa, guardado antiguo no borra tasa; margen final descuenta IVA contenido, IIBB, comisión, costo y gastos sin duplicación.
- [x] Migración aditiva para tasa estimada por sucursal/mes y snapshot, sin alícuotas asignadas.
- [x] Costeo con secciones Costo directo, Impuestos, Gastos fijos y generales, Rentabilidad. Desglose del presupuesto por concepto, acceso al mes elegido para editar.
- [x] Configuración de IIBB estimado en gastos mensuales y nota para evitar duplicarlo en gastos.

## Task 4: verificación
- [x] Suite relevante, tipos, lint; navegador caja y Costeo, individual/combos, no claves duplicadas; revisión visual.
- [x] Verificar/aplicar0023 en desarrollo, preservando datos previos y `.env`.
- [x] Una revisión final fresca; corregir problemas relevantes con pruebas.
- [x] Documentar evidencia y límites fiscales; informar sin nuevo commit/push.

Plan self-review: preservar importes numéricos de precio satisface la aclaración del usuario; la consulta de impuestos es financiera y nunca sale al empleado. El IVA de ventas anteriores permanece inmutable. La tasa ilustrativa de pruebas no se asigna a desarrollo.

Fuentes: [ARCA: transparencia fiscal](https://biblioteca.arca.gob.ar/search/query/norma.aspx?p=t%3ARAG%7Cn%3A5614%7Co%3A9%7Ca%3A2024%7Cf%3A12%2F12%2F2024), [Código Fiscal Salta actualizado](https://boletinoficialsalta.gob.ar/Texto_Actualizado.php?cXdlcnR5dGFibGE9TXw5Lzc1JmNhYmU9PGg2PiBQdWJsaWNhZG8gZW4gZWwgQm9sZXTDg8KtbiBPZmljaWFsIE7DgsKwIDAsIGVsIGTDg8KtYSAgZGUgIGRlIDwvaDY+PEJSPnF3ZXJ0eQ=%3D), [Rentas Salta, actividades](https://www.dgrsalta.gov.ar/Inicio/Actividades).
