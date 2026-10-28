# Caja — resultado de implementación

Fecha: 27/10/2026. Rama `codex/cash-register`, base `cbf7cd3d135947367d63a41069529d567a4ef9b3`. La autorización posterior de commit y push y su verificación se detallan al final. Migraciones 0028/0029 aplicadas en Neon con autorización explícita posterior; contenido histórico y `.env` intactos.

## Circuito entregado

- **Negocio → Caja:** apertura por sucursal, fondo real, efectivo esperado, movimientos y cobros por otros medios. La jornada permanece abierta después de medianoche hasta confirmar el cierre. El horario de referencia inicial es 23:00, sin cierre automático.
- Gastos cotidianos y retiros con responsable y motivo. Un gasto aparece una sola vez en el análisis mensual; una compra de mercadería no se convierte en gasto general. Los cierres mensuales conservan su snapshot.
- **Efectivo → Posnet → Revisar:** conteo antes del nuevo retiro, fondo dejado y diferencias. Toda diferencia requiere explicación y permite cerrar, quedando para revisión del encargado. Los retiros anteriores no se descuentan dos veces.
- Un posnet genérico por sucursal, con varios lotes: número, fecha/hora real, operaciones, importe firmado antes de comisiones y foto privada. Puede registrarse un lote inesperado aunque la app no haya registrado tarjetas. Lote pendiente o diferencia exige motivo.
- Cámara/galería, vista previa y ampliación de JPG/PNG/WebP; reducción de fotos grandes conservando proporción. Los adjuntos se autorizan por sucursal y sesión. Un encargado puede agregar el comprobante pendiente durante la revisión sin reescribir el arqueo ni el estado original del cierre.
- Historial, revisiones pendientes y responsables. Los cierres pendientes siguen accesibles aunque sean anteriores a los últimos 60. El próximo fondo propuesto es el efectivamente dejado.
- **Compras:** pagos al recibir con origen del dinero y anticipos por pedido. La recepción parcial aplica crédito disponible una sola vez; si falta el costo conserva el crédito. Transferencias externas, incluidos anticipos a Bolivia, no disminuyen el cajón. Cancelar un pedido no registra una devolución ficticia.
- **Configuración → Caja**, exclusivamente para administrador: horario, fondo objetivo y permisos individuales para abrir, cerrar y cargar gastos, usando el Autocomplete existente. Esas opciones no aparecen en la pantalla operativa. El fondo objetivo queda sin configurar hasta que el dueño lo defina; no se carga un monto de ejemplo.

## Integridad y revisión

Los movimientos financieros se registran en la transacción de su documento, con identidad de origen única. Los comandos se serializan por sucursal y vuelven a comprobar los permisos vigentes después del bloqueo. Un cobro entra antes del cierre o se rechaza; no queda fuera del corte.

Las solicitudes de resultado incierto conservan su identidad, datos y sucursal incluso al recargar. El usuario puede reintentar la misma operación y queda bloqueado un segundo envío financiero hasta resolverla. Los borradores de cierre conservan datos ante conflictos, pero no se trasladan a otra sesión.

Se completó una revisión independiente del conjunto. Se corrigieron sus hallazgos sobre reintentos inciertos, orden de bloqueos, permisos desactualizados, motivo de reapertura, lotes inesperados e historial pendiente. La evidencia posterior se guarda separada de los valores originales del cierre.

## Verificación final

| Comprobación | Resultado |
| --- | --- |
| Vitest: 21 suites nuevas y afectadas | **127 pruebas aprobadas**, base PGlite descartable |
| Playwright: Caja y Compras | **21 pruebas aprobadas**, APIs simuladas |
| TypeScript | Aprobado; también validado durante la compilación final |
| ESLint completo | Aprobado; revisión final de los 67 archivos de código afectados sin errores |
| Compilación de producción | **`next build --webpack` aprobada**, sin cambiar el empaquetador configurado |
| Anchos 390, 768, 1024 y 1440 px | Controles de cierre utilizables, sin desborde horizontal |
| Neon, migraciones y verificación posterior | 0028/0029 aplicadas; historial completo válido, sin pendientes; contenido histórico preservado |
| Consultas reales en Neon | Caja, configuración y Compras disponibles en la sucursal activa; sin comandos de negocio |
| Git | Sin cambios staged, sin commit ni push; misma rama y base |

Evidencia local: `.superpowers/cash-implementation/complete-final.log`, `browser-final.log`, `typecheck-evidence.log`, `lint-final.log`, `lint-changed-final.log`, `build-webpack.log`, `neon-preflight.log`, `neon-apply.log`, `neon-postflight.log` y `neon-module-verification.log`. Capturas en `.next-e2e/cash-ui-390.png` y `.next-e2e/cash-review-proof-390.png`.

### Límites de la verificación

No se declara aprobada toda la suite del repositorio. `tests/sales.test.ts` conserva un fallo previo de su fixture genérico en la migración 0008: «Explicit transition mapping must be applied before finalization»; sus 12 casos no llegan a ejecutarse. Las pruebas específicas de la integración Ventas–Caja y HTTP afectado sí están incluidas en las 127 aprobadas.

El build predeterminado con Turbopack falló al iniciar un subproceso de CSS de Manrope antes de establecer comunicación; se reprodujo fuera de la restricción de procesos. La compilación final con la alternativa oficial Webpack terminó correctamente. No se cambió la configuración del proyecto para ocultar ese fallo.

Las pruebas usan servicios reales contra base descartable y pruebas de navegador con respuestas simuladas, por separado. No se realizaron movimientos de prueba en Neon, subidas reales al proveedor de almacenamiento, pruebas de cámara física ni contención con conexiones reales de PostgreSQL. La foto de comprobante se registra manualmente: no existe conexión automática con el posnet ni conciliación bancaria.

## Habilitación en Neon y primera apertura

1. El usuario autorizó explícitamente aplicar **únicamente 0028 y 0029** a Neon, manteniendo la orden de no hacer commit ni push.
2. Se ejecutó el aplicador acotado `scripts/apply-cash-register.ts` con `--apply` y `KYBO_ALLOW_CASH_MIGRATIONS=0028-and-0029`. Ambas migraciones quedaron confirmadas en una transacción; hashes previos e integridad del contenido histórico verificados. No se crearon aperturas, gastos, pedidos ni movimientos de stock.
3. Una segunda ejecución sin `--apply` confirmó el historial completo, cero migraciones pendientes y cero reaplicaciones. Las consultas reales de Caja, configuración y Compras funcionaron en la única sucursal activa. También se verificaron `posnet_review`, el origen de pagos y las aplicaciones de anticipos parciales.
4. El dueño define fondo y permisos en Configuración → Caja. La primera apertura activa el requisito de caja abierta para los cobros posteriores de esa sucursal, sin reconstruir cobros históricos. En la verificación quedó sin abrir ni activar, con horario de referencia 23:00 y fondo objetivo sin configurar.

El almacenamiento privado existente ya está configurado. No se cambiaron credenciales ni variables del proyecto. Caja y anticipos están habilitados en el esquema; el circuito financiero de la sucursal comenzará con su primera apertura real.

## Ajuste posterior: acceso y estado en el encabezado

El usuario pidió acceso a la apertura desde el encabezado general, mostrando después quién abrió la caja, la hora y el importe. Caja se ubica ahora en **Negocio**, después de Inicio y Operación del día, conservando su dirección `/finance/cash`.

El botón **Abrir caja** utiliza el mismo formulario y comando existentes en un modal, conservando el pedido y la pantalla actual. Dentro de la página Caja activa su formulario ya montado para evitar dos controladores financieros simultáneos. El detalle abierto muestra **monto inicial**, separado del efectivo esperado actual, y enlaza a la jornada completa. El importe, nombre y hora solo se entregan a personas con acceso vigente de lectura de Caja; el personal sin permiso solo ve el estado abierto/cerrado.

El encabezado consulta el estado de la sucursal explícita, se actualiza al abrir/cerrar, al cambiar de pantalla, al volver a la pestaña y cada 30 segundos mientras está visible. Las consultas anteriores se cancelan para impedir que una respuesta vieja reemplace el estado actual. El formulario de apertura se descarga al solicitarlo. En celular conserva legibles la sucursal y el resumen, y en tablet/escritorio se integra en la misma fila.

Verificación del ajuste: 37 pruebas unitarias/de integración y 37 de navegador aprobadas, incluyendo apertura sin perder el pedido, reintento con la misma identidad, permisos, reutilización del formulario en Caja y anchos 390/768/1024/1440. ESLint y compilación de producción `next build --webpack` aprobados; la compilación también validó los tipos. La consulta actualizada se verificó contra Neon sin ejecutar comandos de negocio. Evidencia: `header-green.log`, `header-browser-final.log`, `header-lint-final.log`, `header-build.log`, `header-neon-read.log` en `.superpowers/cash-implementation/`; capturas `.next-e2e/cash-header-{ancho}.png`. No requiere nuevas migraciones; sin commit ni push.

### Corrección visual del encabezado de Inicio

La captura posterior del usuario expuso una cobertura faltante: las capturas previas se centraban en el punto de venta, que oculta el menú lateral. En Inicio se reprodujo un desnivel de 5 px con caja cerrada y 11 px con caja abierta entre la base del logo y la del encabezado. Ahora ambos usan 72 px en escritorio; selector de sucursal y controles de Caja usan 48 px, con el icono centrado. El espacio se mantiene estable al cargar el estado.

También se reprodujo la ausencia del acceso a Caja cuando un layout conservado no incluía la propiedad de identidad añadida recientemente. El encabezado ya no se omite en ese caso: la consulta autenticada de estado devuelve la identidad vigente para el formulario y su almacenamiento de reintentos. Los permisos siguen comprobándose en el servidor; no se usa una identidad ficticia ni se permite una nueva acción financiera.

Pruebas: 22 verificaciones unitarias/de integración y 21 de navegador aprobadas, más seis comprobaciones visuales finales tras centrar el icono del selector. Typecheck y ESLint aprobados. Se inspeccionaron las capturas de Inicio a 1906 px con caja abierta/cerrada y los anchos 390/768/1024/1440. Evidencia en `.superpowers/cash-implementation/header-alignment-{red,green,visual,types,lint}.log`, `header-identity-{red,green}.log`; capturas finales `.next-e2e/header-home-{open,closed}-strip.png`. Sin nuevas migraciones, movimientos reales, commit ni push.

### Rediseño general posterior del encabezado

El usuario pidió revisar la composición completa después de probar distintos colores del botón. Se adoptó una presentación más sobria: contexto de navegación a la izquierda; estado/acción de Caja y sucursal agrupados a la derecha con una separación discreta. El logo real y la altura común se conservan; el descriptor Operations, la tipografía y los controles de navegación tienen menor peso visual.

La sucursal aparece como un control compacto con ícono, nombre y ubicación en dos líneas. Conserva el selector nativo y su lógica de cambio, con foco visible y etiqueta accesible; el personal asignado recibe la misma presentación sin un selector interactivo. El estado de Caja abierta pasa a una presentación plana, manteniendo nombre, hora y monto inicial. La apertura conserva el outlined primary solicitado, con texto, borde e ícono naranjas. En tablet se prioriza la pantalla actual y en celular la información se distribuye en dos filas.

No cambia el circuito financiero, la autorización, la identidad de reintentos ni los datos de negocio. Se verificaron 21 pruebas de navegador existentes y seis capturas finales de escritorio/tablet/celular, más 15 pruebas de navegación/presentación y ESLint. Las capturas de pruebas se corrigieron para declarar UTF-8 igual que la app: faltaba esa declaración en el HTML simulado, lo que alteraba la lectura del separador entre nombre y ubicación. Las pruebas ahora comprueban que ambos textos sean visibles y que la vista asignada al personal no incluya un selector.

Evidencia en `.superpowers/cash-implementation/header-redesign-{browser,visual-final,unit-final,lint-final,types-final}.log`. Capturas actualizadas `.next-e2e/header-home-{closed,open}-strip.png` y `.next-e2e/cash-header-{ancho}.png`. Sin migraciones, operaciones reales, commit ni push.

### Apertura: foco inicial y referencia del cierre anterior

El campo Fondo inicial contado recibe foco y selecciona su contenido al abrir el modal, tanto desde el encabezado como desde Caja. Si la consulta está pendiente se conserva el foco dentro del modal y se enfoca el importe una sola vez cuando queda habilitado, sin interrumpir la escritura posterior. MoneyField admite la referencia del input y su descripción accesible.

Debajo aparece explícitamente el fondo dejado en el último cierre, asociado al campo para lectores de pantalla. Es el remanente disponible para abrir, después del retiro del cierre, y no el total contado antes de retirar. Si no hay cierres se informa; una consulta fallida no se presenta como ausencia de historial. Se conserva la propuesta del fondo y la exigencia de motivo cuando corresponde.

Las tres pruebas iniciales reprodujeron la falta de foco. Las cinco verificaciones finales de navegador aprobaron foco, reemplazo por escritura directa, referencia correcta del fondo, carga demorada, primera apertura y reintento con la misma identidad. ESLint aprobado; evidencia en `opening-focus-{red,green,final,types,lint-final}.log` dentro de `.superpowers/cash-implementation/`. No se ejecutó ninguna apertura real ni se hizo commit/push.

## Publicación autorizada de Caja y comprobantes

El usuario autorizó hacer commit y push de este conjunto en `codex/cash-register`. El alcance incluye apertura/cierre, gastos y retiros, integración de pagos y anticipos a proveedores, evidencia privada de lotes, permisos y acceso desde el encabezado, además del comprobante obligatorio por cobro local con tarjeta y su listado para conciliación durante el cierre.

La revisión final detectó una opción de gasto externo que el personal podía seleccionar aunque el servidor la rechazaba. Se agregó la capacidad calculada `externalExpense`, reservada a encargado/administrador, y el personal ahora ve únicamente la deducción de efectivo de su caja. El rechazo del servidor se conserva; las pruebas confirman que no agrega registros y que guardar un gasto permitido permite continuar trabajando. La revisión posterior aprobó la corrección, sin otros bloqueos.

Verificación del conjunto final:

- **76 pruebas aprobadas en 12 suites** de Caja, ventas, gastos, compras, fotos, HTTP, navegación e IVA.
- **58 pruebas de navegador aprobadas**, con respuestas simuladas, para Caja, anticipos, comprobantes y encabezado.
- **ESLint completo y compilación de producción con Webpack aprobados**, incluyendo TypeScript. La configuración y los archivos de tipos generados se restauraron al terminar.
- `git diff --check` correcto. Sin operaciones financieras de prueba, nuevas migraciones ni cambios de credenciales.

No se declara aprobada la suite global. Su ejecución se interrumpió al confirmar fallos previos ajenos a esta entrega: fixtures antiguos que no realizan la transición explícita de inventario, expectativa antigua de validación que omite `stockTracked`, y pruebas de concurrencia que requieren una conexión PostgreSQL dedicada. Los tres tipos de fallo se reprodujeron en una copia limpia de la base `cbf7cd3`, sin cargar el entorno del proyecto; esa copia temporal se retiró después. La prueba nueva de permisos se verificó por separado en rojo y luego en verde antes de la pasada final.

Evidencia local: `commit-affected-tests-final.log`, `commit-browser-final.log`, `commit-full-lint-final.log`, `commit-build-final.log`, `commit-baseline-proof.log` y `commit-staff-{expense,capabilities}-{red,green}.log` en `.superpowers/cash-implementation/`.
