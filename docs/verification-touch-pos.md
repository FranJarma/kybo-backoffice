# Punto de venta táctil y alertas de reposición

## Uso

Punto de venta usa toda la pantalla, con el menú principal accesible desde el encabezado. En caja y tablets desde 768 px, carta y pedido se desplazan por separado; el total y el cobro permanecen visibles. En teléfonos se apilan sin desbordamiento horizontal. Las categorías y la búsqueda filtran la carta cargada, sin una consulta por cada interacción.

Un producto sin opciones se agrega directamente. Las opciones obligatorias aparecen antes de las opcionales; los componentes simples de un combo se seleccionan sin una confirmación vacía. El pedido consolida únicamente renglones con las mismas versiones, selecciones, precios y observaciones. Se puede quitar una unidad o deshacer una eliminación; vaciar todo requiere confirmación.

El pedido usa renglones compactos: producto y opciones, cantidad e importe, con acciones de nota, precio y eliminación. Precio y observaciones se editan en una ventana con guardar/cancelar, en lugar de desplegar formularios dentro de la lista. La nota general también se carga en una ventana. La ayuda de stock solo se muestra al abrirla y puede cerrarse con «Entendido», sin quedar sobre el pedido.

Los controles de Mostrador/Mesa/Delivery quedan sobre la carta. El pedido comienza más arriba y gana ancho en pantallas grandes, con el total y el cobro fijos.

Los medios de pago se presentan como botones. El efectivo recibido sirve para calcular el vuelto y no se incorpora al importe cobrado. Referencias y cobros divididos son opcionales. El sistema registra pagos realizados: no verifica transferencias ni procesa tarjetas.

Tras confirmar una nueva venta de mostrador, la caja queda lista para el siguiente cliente y muestra una notificación y acceso a la última venta. El cobro de cuentas existentes conserva su detalle. Un envío sin respuesta mantiene el mecanismo de reintento con la misma identidad para evitar duplicados.

## Reposición y producción

Desde el botón **Reposición**, el encargado configura mínimos por artículo y ubicación: mínimo de aviso, cantidad objetivo y tiempo de preparación opcional. Las reglas se pueden editar o desactivar. Los empleados consultan avisos y acceden a sus tareas; no cambian estas reglas.

Los avisos distinguen traslado desde otra ubicación, producción con receta publicada y revisión de compra. La cantidad sugerida para trasladar nunca supera la disponible en los orígenes. Las órdenes planificadas, pendientes de comenzar y comenzadas aparecen separadas del stock utilizable. La consulta no crea órdenes ni movimientos; hay que revisar las órdenes existentes antes de planificar otra tanda.

Se excluyen reservas, vencidos y bloqueados. Los avisos se actualizan al guardar una venta, cada 60 segundos con la pestaña visible, al volver a la pestaña o manualmente. Una consulta de alertas no bloquea la carta. Los datos se aíslan por sucursal y no exponen costos a empleados.

Esta primera versión anticipa mediante mínimos configurados. El tiempo de preparación es una referencia operativa, no un pronóstico de agotamiento. No estima demanda por horario ni realiza compras automáticas.

## Activación de la base

Migración aditiva: `drizzle/0020_replenishment_policies.sql`. Crea reglas y sus restricciones, sin cambiar productos, recetas, ventas o stock existentes. No define mínimos arbitrarios para el negocio.

El script de aplicación verifica el historial y los hashes anteriores y consulta en modo de solo lectura por defecto:

```powershell
node --import tsx scripts/apply-replenishment.ts
# Solo al decidir aplicar la migración:
node --import tsx scripts/apply-replenishment.ts --apply
```

El 19/10/2026 se aplicó esta migración a desarrollo por solicitud explícita del usuario. Antes y después se verificaron los hashes del historial; la consulta final confirmó `pending: false`. La comparación de huellas de 12 tablas conservó exactamente productos, precios, artículos, recetas y versiones, ventas, lotes, saldos por ubicación, valuaciones, movimientos y reservas. Se mantuvieron los 20 productos y las 0 ventas existentes.

Se verificaron las 11 columnas nuevas, sus 10 campos obligatorios, las 8 restricciones de claves y validación y el índice único por sucursal, ubicación y artículo. El comprobador contempla que PostgreSQL también enumera las restricciones NOT NULL por separado. No se generaron movimientos ni reglas arbitrarias: hay 0 mínimos configurados. Para comenzar a recibir avisos, usar Reposición → Configurar mínimos.

## Verificación

- **45 pruebas enfocadas aprobadas en 8 archivos.** Cubre consolidación exacta de variantes, búsqueda local, límites de cantidades, opciones obligatorias, selección directa dentro de combos, caché de solicitudes, cálculo de vuelto, mínimos, reservas, vencimientos, bloqueos, producción pendiente/comenzada, permisos, idempotencia y auditoría. Las pruebas de integración usan PGlite descartable con la migración nueva.
- **Dos recorridos de Chrome aprobados.** El recorrido nuevo usa pantalla táctil y datos reales de una base descartable: agregado directo, consolidación, filtros sin nuevas solicitudes, vuelto, interrupción intencional de la respuesta de cobro y reintento sin duplicación, siguiente pedido vacío y alerta tras reservar stock. Verifica 1024×768, 1440×900, 768×1024 y ausencia de desbordamiento horizontal a 390×844. El recorrido de combos conserva modificadores al cambiar productos y editar, sin confirmar de nuevo una bebida sin opciones. Se inspeccionaron las capturas de escritorio y tablet; la notificación se coloca por encima del pie de cobro para no taparlo.
- Revisión independiente del backend y del flujo de caja. Se corrigió recuperación de versiones/precios en recetas sin opciones, actualización de la versión física al editar y reinicio de Deshacer al vaciar o comenzar otra venta.
- **Suite general: 339 pruebas aprobadas, 1 fallida y 85 omitidas; 73 archivos aprobados, 10 fallidos y 1 omitido.** Se mantienen los fallos documentados previamente en `verification-reusable-combo-groups.md`: ocho fixtures antiguos que no aportan el mapeo de transición, concurrencia que requiere una base PostgreSQL dedicada y una expectativa antigua de `stockTracked`. No se presenta la suite completa como verde.
- El runner genérico de navegador sigue deshabilitado por la transición de datos. Se utilizó un runner descartable adaptado del existente `scripts/e2e-combos.ts`. No se ejecutaron las pruebas sobre la base de desarrollo.
- El build predeterminado con Turbopack falló al conectar su proceso auxiliar de estilos (`node process exited before we could connect`). Se verifica también con el compilador Webpack soportado por Next.js; no se cambió el compilador predeterminado del proyecto.
- **Compilación de producción aprobada con `pnpm exec next build --webpack`**, incluido TypeScript, generación de 54 páginas y trazas. Se repitió de forma secuencial después de retirar las rutas temporales que las pruebas de navegador habían agregado a la configuración de tipos. `tsconfig.json` conserva su contenido anterior y se restituyeron únicamente los imports generados de `next-env.d.ts`.
- **Lint focalizado: 0 errores y 2 advertencias previas** en `app-shell.tsx` (`UserRound` y `dateLabel` sin uso). `git diff --check` sin errores.

Logs de verificación en `.local/touch-pos/`, excluidos de Git. `.env` no fue modificado. No se hicieron commits ni push.

### Ajuste del pedido compacto (19/10/2026)

19 pruebas enfocadas aprobadas (incluye ausencia inicial de los formularios y la ayuda de stock). Control de tipos y lint de los componentes modificados sin errores. El recorrido táctil de Chrome pasó: abrir/cerrar ayuda, cancelar un cambio de precio, guardar una nota de producto y del pedido y mostrar cuatro renglones completos sin desplazar a 1906×945. También conserva el cobro y la recuperación sin duplicados de una respuesta perdida. Se inspeccionó `docs/previews/touch-pos-order-compact.png`. Las verificaciones se registran en `.local/touch-pos/compact-*`. No se modificó la base de desarrollo para este ajuste.

### Apertura de opciones (19/10/2026)

La configuración pública de venta consulta solo los datos comerciales, las versiones vigentes y las opciones del producto. No carga la composición fija, el historial completo ni los datos del editor de recetas. Una prueba con PostgreSQL local descartable registró 17 lecturas antes y 2 después; esto mide consultas, no promete una duración fija de apertura. Ambas lecturas conservan la misma instantánea de solo lectura.

Se precarga toda la carta disponible con dos solicitudes simultáneas, en lugar de limitarse a ocho productos. Cambiar sucursal, canal o actualizar la carta cancela la cola anterior. Editar opciones desde el pedido utiliza la misma clave de caché que agregarlas, tomando el precio base y la versión del catálogo, incluso si las opciones tienen recargos. La caché sigue siendo temporal en memoria (60 segundos), separada por sucursal/canal; al actualizar la carta se descarta. La venta conserva su validación final de versiones, precios, disponibilidad y stock en el servidor.

32 pruebas aprobadas en cinco archivos: comparación del resultado público con la configuración completa, opciones heredadas/reemplazadas, instrucciones sin ingredientes, artículos archivados y con otra unidad, recargos por canal, grupos sin opciones habilitadas, productos sin receta/precio y disponibilidad de sucursal; además de las regresiones de combos, carrito y caché. Control de tipos y lint focalizado sin errores. Logs en `.local/touch-pos/options-*`. No se aplicaron migraciones ni se modificaron datos de desarrollo para esta optimización.

Tres recorridos finales de Chrome aprobados (57,2 segundos en total): precarga del producto número 12, agregado y edición sin otra solicitud, invalidación al actualizar la carta, conservación de elecciones en combos y flujo táctil de caja con recuperación de una respuesta perdida. Las pruebas aceptan la selección inicial de sucursal cuando corresponde y verifican los renglones compactos actuales del pedido.

### Experiencia de cobro (19/10/2026)

Modal más ancho, encabezado compacto con importe destacado, medios de pago táctiles con icono y selección visible. El contenido se desplaza por separado y el pie de confirmación permanece visible. Los botones e inputs tienen un mínimo comprobado de 48 px; la confirmación, 56 px. En un cobro completo se usa directamente el importe de la venta; los importes editables aparecen para pagos divididos o cobros parciales. Quitar el segundo pago restaura el total cuando se vuelve a un único cobro completo. El efectivo recibido sigue calculando vuelto sin aumentar el importe registrado.

Se distinguen carga real, error recuperable y ausencia de medios configurados. Un catálogo vacío ya no indica carga indefinida. Los encargados pueden abrir su configuración; el empleado recibe una indicación para contactar al encargado. Nombre y tipo conservan sus funciones y tienen ayudas explicativas en el formulario.

19 pruebas de componentes/caché aprobadas y dos recorridos finales de Chrome aprobados: catálogo vacío, error, reintento con espera controlada, selección, vuelto, división y eliminación de un pago, cancelación sin perder el pedido, controles táctiles y confirmación visible a 1024×768 y 390×844. El recorrido de caja conserva el cobro real en base descartable y el reintento idempotente tras perder una respuesta. Se inspeccionaron `docs/previews/payment-dialog-desktop.png` y `docs/previews/payment-dialog-mobile.png`. Lint focalizado sin errores. Logs: `.local/touch-pos/payment-*`.

Control de tipos final aprobado después de que el navegador restituyera sus archivos generados. `git diff --check` sin errores.

La facturación fiscal no se implementó en este ajuste de interfaz. El diseño propuesto está en `docs/superpowers/specs/2026-10-19-fiscal-invoicing-design.md`: responsable inscripto, uso actual de ARCA y precios sin IVA confirmados; alícuotas por producto y comisiones aún sin confirmar. No se modificaron precios, impuestos, datos de desarrollo ni `.env`; no se aplicaron migraciones ni se hicieron commits/push.
