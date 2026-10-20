# Gastos del negocio — verificación

## Estado

El checkpoint previo quedó publicado en `origin/codex/product-combos`: `5bb639cd74011808647cf6b626a66b0d188ca2c5`. Se verificó que el hash remoto coincidiera. Antes de publicarlo pasaron 82 pruebas y la revisión de tipos; lint sin errores y dos advertencias existentes en AppShell.

La entrega incluye la planificación mensual, su integración con Costeo y el punto de equilibrio. El usuario autorizó su commit y push el 20 de octubre. La migración aditiva `0022_business_overheads` ya está aplicada en desarrollo; se comprobaron hashes e historial y se conservaron las huellas completas de las 12 tablas existentes verificadas (catálogo, precios, cobros, ventas, recetas, combos y movimientos). `.env` se conserva.

## Funcionalidad

- Finanzas → Gastos del negocio, por sucursal y mes. Presupuesto y real separados; unidades finales previstas; conceptos propios, categorías y observaciones.
- Vacío significa pendiente; cero es un importe confirmado. El resumen usa los últimos datos guardados y avisa cuando hay cambios pendientes.
- Cierre con confirmación de reales completos, autor, fecha, gastos y unidades. Revisiones con motivo y snapshot adicional; un trigger impide sobrescribir o eliminar cierres anteriores.
- Solo ventas cerradas de la sucursal dentro del mes de operación. Los componentes históricos del combo cuentan por sus cantidades; su encabezado no vuelve a contarse. Las nuevas versiones del catálogo no alteran cierres.
- En Costeo: presupuesto mensual seleccionado, gastos asignados y margen después de gastos. La contribución antes de gastos se mantiene separada; los cocientes usan totales originales antes de redondear. No se alteran precios, inventario ni importes cobrados.
- Administradores y encargados de la sucursal; un permiso de catálogo para empleado no da acceso financiero. Reintentos idempotentes y revisión de permisos vigente incluso al repetir una operación.

## Evidencia

- La suite final pasó: **29 pruebas en 7 archivos**. Casos: $2.000.000 / 4.000 = $500; reales $2.100.000 / 3.500 = $600; importes pendientes/cero; sin ventas; márgenes negativos; combos múltiples; fechas límite; ventas abiertas, anuladas y de otra sucursal; versión histórica; conflictos; reintentos; revocación; encargado de sucursal; cierre inmutable; límite HTTP; carga inicial del selector.
- Revisión de tipos correcta y lint de archivos modificados sin errores.
- Revisión independiente: se detectó un límite de carga insuficiente para el documento mensual completo. Prueba observada fallando con HTTP 413 para 100 conceptos válidos con notas Unicode. Corrección: límite explícito de 512 KiB, manteniendo protección de tamaño y origen.
- La primera ejecución de navegador detectó un error en la preparación de la prueba: faltaba seleccionar la sucursal. Se agregó la selección que exige el flujo real de la aplicación.
- La prueba completa en navegador pasó: **1 flujo de extremo a extremo**, en base descartable. Se verificó que el presupuesto quedara guardado en septiembre, se registraron dos cierres y se comprobó la asignación de $500 en Costeo. Se capturaron y revisaron escritorio (1440 px) y móvil (390 px), con desplazamiento horizontal contenido en las tablas.
- Durante esa verificación se reprodujo una selección de mes anterior a la hidratación del formulario: podía perderse el cambio y conservarse el mes inicial. Se bloqueó el selector durante la carga inicial; prueba de componente observada fallando y luego pasando, más flujo completo en navegador correcto.

## Decisiones y límites

- Se continuó en la rama de funcionalidad actual para conservar la aplicación en el checkout que usa el usuario. El worktree antiguo de transición de datos no se reutilizó. Si fuera necesario aislar otra rama, los cambios pueden trasladarse sin pérdida.
- La instrucción explícita de empezar después del checkpoint se tomó como autorización para ejecutar el plan aprobado sin otra ronda de confirmación. Se mantuvo una bitácora en PowerShell por el entorno Windows. El plan puede revisarse antes de publicar esta etapa.
- La revisión no sustituye asesoramiento contable/fiscal: este es un reparto de gestión aprobado por el usuario, separado de la valoración del inventario y de ARCA. La prueba de concurrencia real con varias conexiones PostgreSQL queda fuera de la verificación automatizada; el código serializa por sucursal/mes y controla revisión dentro de la transacción.
- El trabajo anterior al checkpoint conserva sus verificaciones previas. La interfaz renderizada se comprueba en el navegador; la revisión independiente fue estática.
- No se repitió la suite histórica completa con sus fallos de fixtures ya conocidos; se ejecutó la suite correspondiente a los cambios y a su integración con Costeo.
- No se cargaron presupuestos o gastos inventados en la base de desarrollo. El encargado debe completar cada mes y el volumen previsto para habilitar el margen después del prorrateo.

## Verificación de la entrega de Finanzas del 20 de octubre

- Se preparó un índice selectivo de Finanzas, punto de equilibrio y sus dependencias de precios y Costeo. Los cambios independientes de imágenes, rendimiento del catálogo, orígenes y formularios de otras áreas se conservaron en el checkout, fuera del commit.
- Una copia del contenido exacto del índice pasó **105 pruebas en 14 archivos**, TypeScript y ESLint. Incluye integración de precios finales, impuestos, comisiones, costos por sucursal, cierre mensual y simulaciones de equilibrio.
- La copia aislada no logró iniciar el servidor de navegador dentro de los 120 segundos, con Turbopack ni con Webpack. Esto se registra como límite de esa verificación; no se modificó la configuración del proyecto principal para resolverlo.
- Las consultas de diagnóstico de desarrollo fueron de sólo lectura; los datos particulares permanecen en `.local/`, ignorado por Git. No se ejecutaron nuevas migraciones en desarrollo.
- En el checkout principal, **los cuatro flujos de Chrome pasaron**: equilibrio local y caché de consulta; presupuesto/cierre/revisión; receta y Costeo sin claves duplicadas; precios finales, impuestos, comisión e historial. Se usó una base descartable y se restauraron los archivos generados de Next.
- La ejecución conjunta detectó que la prueba de IVA asumía un mes sin presupuesto después de que otro flujo lo hubiera guardado. Se observó el fallo, se seleccionó explícitamente un mes vacío en esa prueba y se verificó que las cuatro pasaran juntas. El control de consultas permite la carga inicial y el cambio explícito de mes, sin solicitudes adicionales al alternar tabs o métodos.
