# Kybo Operations

Kybo Operations: administración, compras, inventario, recetas, producción, ventas y comandas con Next.js, TypeScript, Shadcn y PostgreSQL compatible con Neon.

## Modificadores 0.6.0-rc.1

Grupos reutilizables con ingredientes o instrucciones, recetas configurables, mínimos/máximos, recargos por canal y costeo por combinación. El POS permite vender distintas configuraciones de un mismo producto y conserva opciones e ingredientes históricos para comandas. La conversión de recetas anteriores requiere revisión y publica todo junto.

Esta entrega requiere validación en navegador y concurrencia en una base PostgreSQL de pruebas antes de uso productivo. Instrucciones de actualización: `docs/modifiers-migration.md`. Resultados y pendientes: `docs/verification-modifiers.md`.

## Interfaz 0.5.0

La interfaz sigue los prototipos de Kybo: sidebar blanco, header alineado, fondo claro, acciones naranjas, tablas y formularios adaptados a escritorio y celular. Inicio muestra información real del catálogo, inventario y compras; no incluye ventas o márgenes simulados. La fuente Manrope está incluida y se sirve desde la aplicación.

La descripción del rediseño y su verificación está en `docs/ui-redesign.md`. Las vistas en `docs/previews` usan datos ficticios de una base temporal; no se importan a tu instalación. Cada módulo tiene sus propias capturas de escritorio y celular.

## Funciona en este incremento

- Inicio y cierre de sesión. Registro público desactivado; altas de usuarios por CLI administrativa.
- Permisos en servidor: administración y encargada pueden gestionar los maestros; personal no accede al catálogo administrativo.
- Proveedores, clientes, medios de pago, insumos, productos y presentaciones: búsqueda, alta, edición, archivo y restauración.
- Costos desconocidos guardados como `null`, visibles como **Pendiente**. Un cero explícito se conserva como cero.
- Precios independientes de mostrador, PedidosYa y Uber Eats en una tabla relacionada con productos.
- Presentaciones de compra vinculadas a proveedor e insumo, en g/ml/unidad base. Por ejemplo, paquete de 800 g = cantidad base 800 para un insumo en gramos.
- Control de revisión para evitar sobreescritura de una edición desactualizada; auditoría y cambios confirmados en una misma transacción.
- Interfaz para escritorio y celular. Los datos pertenecen al servidor, no a un JSON `app_state`.
- Recepciones manuales con proveedor, comprobante externo opcional, cantidades, precios/descuentos, conversión de presentaciones y lotes.
- Pagos parciales a proveedores, separados de los ingresos de mercadería y protegidos contra sobrepagos.
- Stock físico/utilizable, vencimientos, lotes bloqueados y movimientos con responsable y motivo.
- Ingreso manual de stock, merma y conteo por lote; costo promedio ponderado separado del costo de reposición.
- Reintentos de compras, pagos, ajustes, recetas y producciones con una clave por operación para impedir duplicados.
- Recetas versionadas, alternativas y opcionales, costos de reposición y producción con consumos reales, FEFO e historial de lotes.
- Comandas compartidas por estación: inicio con responsable, listo, entrega, transferencias con motivo y actividad auditable.
- Tiempos de espera, preparación y entrega; resumen diario de comandas por origen, con promedios y tamaño de muestra.

Ya permite registrar ventas, cobros y preparación, pero todavía no es una caja integral para operar el local ni un reemplazo validado de Fudo. Las próximas entregas incorporan consumo de inventario por ventas, caja, fichaje, offline e impresión. OCR, emisión fiscal y automatizaciones externas mantienen el alcance del diseño general. No hay márgenes simulados en esta entrega.

## Compras e inventario

En **Compras**, cargá lo efectivamente recibido. Elegir una presentación convierte automáticamente a la unidad base: dos paquetes de 800 g ingresan 1.600 g. Sin presentación, cantidad y precio se expresan por g, ml o unidad. El precio admite seis decimales; cada importe de renglón se redondea a centavos antes de restar su descuento. Revisá y confirmá: recepción, lotes, movimientos y auditoría se guardan juntos. Un pago no se genera automáticamente.

El detalle de una recepción permite registrar pagos parciales por un medio existente, fecha y referencia. Esto registra el pago informado; no procesa tarjetas ni verifica transferencias. Recepción y pagos conservan las referencias y nombres usados al confirmarlos.

En **Inventario**, abrí un insumo para consultar lotes y movimientos. Podés cargar un ingreso manual con motivo/costo, registrar merma, contar la cantidad remanente de un lote y bloquearlo. Contar significa informar la cantidad absoluta que observaste, no cuánto querés sumar. El sistema registra la diferencia. Cambiar la unidad de un insumo queda bloqueado si tiene historial de inventario.

El valor del stock se calcula con promedio ponderado y no cambia los precios comerciales ni el costo de reposición del catálogo. Un costo desconocido mantiene la valuación pendiente hasta agotar ese saldo; se diferencia de un cero explícito.

Los lotes se consideran vencidos desde el inicio de la fecha indicada en Salta. Vencer/bloquear no elimina el stock físico: la merma se registra aparte. Un lote sin fecha muestra esa falta de información. No se inventan fechas de conservación ni se autoriza una promoción por estos indicadores.

Límites actuales: las recepciones confirmadas son inmutables; no hay todavía corrección financiera, devoluciones a proveedor, órdenes ni conciliación de recepciones parciales. Si una recepción tiene costos pendientes, no permite registrar pagos hasta contar con un total conocido mediante una futura corrección auditada. Cada confirmación admite hasta 30 renglones; lotes e historial tienen paginación de 100 filas. El consumo por ventas se incorporará al conectar preparación con el POS; registrar una venta en esta entrega no modifica inventario.

La integración externa sigue pendiente. Las migraciones agregan tablas sin reiniciar la base; para actualizar una instalación local existente, conservá su `.env` y sus datos, detené el servidor, ejecutá `npm ci` y `npm run db:migrate`, y reiniciá el servidor. No reemplaces credenciales existentes por las del ejemplo.

## Recetas y producción

En **Productos y recetas**, elegí Productos o Preparaciones base y creá una receta para una ficha existente. Los productos llevan cantidades por unidad de venta. Una preparación utiliza un insumo como destino (por ejemplo, tapioca cocida) y define el rendimiento de una receta base en g, ml o unidades. Si falta la ficha, creala primero en Insumos.

Cada ingrediente puede tener alternativas y ser opcional. La primera alternativa es la predeterminada; el detalle permite cambiarla u omitir un opcional para comparar costos, sin modificar la receta. El costo teórico de reposición usa precios actuales y recetas de preparaciones, con hasta seis decimales por unidad base. No representa ganancia neta: no descuenta comisiones, mano de obra ni gastos del local. Faltantes aparecen como **Pendiente**, nunca como cero.

Editar crea una versión nueva. El historial conserva ingredientes, cantidades, nombre y unidad de cada versión. Sus costos teóricos se recalculan a precios actuales; los costos históricos de las producciones, en cambio, quedan fijados. No se permiten ciclos a través de ninguna alternativa. Un insumo usado en una receta no puede cambiar de unidad base.

En **Registrar producción**, seleccioná una preparación, indicá cuántas recetas base realizaste, ajustá los consumos y el rendimiento real, y completá lote/vencimiento si los conocés. **Revisar lote** calcula disponibilidad y costo; **Guardar lote** descuenta los insumos y crea un lote del preparado en una sola transacción. Si falta stock o cambió desde la revisión, solicita revisar otra vez. Los reintentos conservan la misma clave y no duplican la producción.

Se consumen primero los lotes utilizables con vencimiento más próximo (FEFO); los lotes sin fecha van al final. Se excluyen lotes bloqueados y vencidos. La valuación sigue el costo promedio ponderado del insumo en inventario. El costo consumido se transfiere íntegramente al rendimiento real, sin registrar otra merma por la diferencia con el esperado. Consumir un preparado descuenta su stock, no vuelve a descontar sus materias primas.

Límites de este bloque: solo producción del día comercial de Salta, sin carga retroactiva ni reversión de lotes confirmados. El vencimiento ingresado debe ser posterior al día y no superar la fecha conocida de los lotes consumidos. Sin vencimiento se muestra la falta de fecha; no se asignan vidas útiles automáticamente. Un costo desconocido en el stock produce un lote con costo pendiente; actualizar el precio del catálogo no revaloriza el historial. Aún no hay corrección auditada de costos pendientes. Las recetas admiten 30 líneas y 5 alternativas por línea; productos/preparaciones se buscan y paginan de a 100, producciones de a 50.

Las capturas `recipes-desktop.png` y `production-*.png` en `docs/previews` usan datos ficticios de pruebas. El código entregado no carga esos datos en tu instalación. El módulo se verifica con PostgreSQL embebido; los intercalados de conexiones simultáneas deben validarse en la rama de desarrollo de Neon al integrar.

## Ventas y mesas (0.4.0)

Abrí **Ventas** en `/sales`. Elegí Mostrador, Mesa o Delivery; seleccioná cliente o consumidor ocasional y agregá productos. Los precios vienen del canal correspondiente. Si falta uno, aparece **Sin precio**: nunca usa automáticamente el del mostrador. La carta tiene búsqueda; los cambios de precio de una venta conservan su motivo y no editan el catálogo. El personal puede ajustar precios de delivery; los del local requieren encargado o administrador.

- **Mostrador:** el cobro debe cubrir el total para confirmar. Admite varios medios de pago y una referencia opcional por cobro. Si se consume en una mesa, podés asociarla sin abrir otra cuenta.
- **Mesa:** en `/tables`, elegí una mesa libre y cargá el primer pedido. Agregá nuevas comandas a la misma cuenta. Los pagos parciales reducen el saldo; el cobro completo libera la mesa. Cada cuenta es una venta, independientemente de cuántos pedidos contenga.
- **Delivery:** carga manual de PedidosYa o Uber Eats, modalidad envío/retiro y número externo obligatorio. Se rechazan duplicados por plataforma y número en el único local Kybo, incluso si el registro anterior fue anulado. Distinguí cobro directo por Kybo y cobro por plataforma. Lo cobrado por plataforma **no confirma una liquidación a Kybo ni representa ganancia**. No se calculan comisiones sin documentos.

**Historial** filtra por fecha comercial, origen, estado y cliente/número. Muestra 30 ventas por página. Los renglones conservan nombre, precio de lista observado, precio aplicado y versión de receta existente; no cambian al editar catálogo/recetas. Si cambió un precio desde que armaste el carrito, se pide actualizar y revisar antes de confirmar.

**Mesas** tiene una grilla editable de 6 × 6 para nombre, capacidad y posición. Administrador/encargado configuran; personal consulta y toma pedidos. No se superponen mesas ni se archivan con una cuenta abierta. Mover una mesa en la grilla cambia su posición física; no transfiere la cuenta a otra mesa.

Una **anulación total** requiere encargado/administrador y motivo. Con cobros previos, exige confirmar una devolución ya realizada por el medio original (o confirmada por la plataforma). Registra movimientos compensatorios vinculados a los cobros originales; no borra el historial, no transfiere dinero ni devuelve stock. No hay anulaciones parciales en este bloque.

**Límite operativo de esta entrega:** las ventas nuevas envían sus comandas a preparación, pero todavía no reservan ni descuentan inventario. Tampoco se emiten comprobantes fiscales, se procesan pagos, se importa Fudo, se integra una plataforma ni se ofrece operación offline. No uses estas ventas como margen real o consumo de insumos. El personal dispone de ventas, mesas y comandas sin acceso a costos ni catálogos administrativos.

Máximos: 50 renglones por pedido, 999 unidades por renglón, 100 pedidos por cuenta y 10 cobros por confirmación. Importes exactos a centavos, fecha comercial de Salta y hora del servidor. No se precargan precios o ventas de ejemplo. Las capturas `sales-*.png` y `tables-*.png` en `docs/previews` pertenecen a una base ficticia de pruebas.

Corregidos en 0.5.0 los dos hallazgos de `docs/sales-review.md`: el transporte de ventas admite 300.000 bytes para los campos acotados del formulario y las respuestas a reintentos bloquean la cuenta antes de leer su detalle. Las intercalaciones reales de conexiones Neon se validan al integrar.

## Comandas y tiempos (0.5.0)

Abrí **Comandas** en `/kitchen`. Antes de operar, un administrador/encargado puede entrar en **Estaciones**, crear Barra/Cocina u otras y elegir dónde se prepara cada producto. Un producto corresponde a una estación; varios productos de una comanda pueden salir por estaciones distintas. Los productos sin configuración llegan a **General**. No se descompone un único combo entre estaciones. Cambiar el ruteo o el nombre de estación no modifica las comandas ya confirmadas.

En Estaciones, **Mostrar productos archivados** permite quitarles la asignación sin reactivarlos. Así podés liberar una estación que ya no se usa; las tareas históricas conservan su estación original.

Mostrador publica al confirmar el cobro; mesa publica cada nuevo pedido, aunque siga impago; delivery publica al confirmar su carga manual. Una cuenta puede tener varias comandas. La migración **no publica ventas históricas**: solamente las nuevas comandas generan tareas.

En los celulares se ve la misma cola con sesión individual. **Empezar** asigna e inicia: ante dos intentos sobre una tarea, solo uno se confirma. Su responsable marca **Listo**; cualquier persona operativa puede registrar **Entregar**. Barra y cocina pueden avanzar en paralelo. El detalle permite ver eventos y, para administrador/encargado, transferir una tarea en preparación a otro usuario habilitado, con motivo. La transferencia conserva el primer inicio, no reinicia el reloj. Las estaciones y los horarios no restringen cuántas personas pueden trabajar.

Cada tarjeta muestra su parte del pedido y cuántas estaciones están listas. Se permiten entregas parciales. Anular una venta cancela las tareas no entregadas, conserva la actividad y las ya entregadas; no reintegra stock. **Finalizadas** consulta entregas/cancelaciones por fecha comercial. La cola muestra 30 tareas por página ordenadas por ingreso; los contadores corresponden a todos los resultados de los filtros.

**Resumen del día**, reservado a administrador/encargado, cuenta comandas por mostrador, mesas y delivery. Promedia espera, preparación y listo→entregado usando comandas completamente entregadas y muestra el tamaño de muestra. Las anuladas se excluyen. En tareas paralelas usa el primer inicio y el último listo/entregado, sin sumar duraciones de estaciones. No mide horas trabajadas ni califica productividad individual; las transferencias se revisan en el historial.

La pantalla consulta cada cinco segundos mientras está visible, y vuelve a consultar al recuperar conexión o volver a la app. Si falla la lectura o pasan 15 segundos sin datos frescos, bloquea acciones hasta actualizar. Hora del servidor para registrar eventos; el contador visible avanza desde la última hora recibida. No confirma cambios de forma anticipada. Los reintentos guardan su ID en la pestaña y se recuperan al recargar con el mismo usuario.

El detalle abierto se actualiza de forma independiente y conserva el borrador de transferencia durante las consultas. Si su lectura falla, la transferencia se bloquea aunque el tablero esté conectado. La revisión y dos detalles menores de configuración pendientes están en `docs/preparation-review.md`.

Esta pantalla móvil requiere internet: Wi-Fi o datos sirven si el servidor está accesible. La instalación PWA, operación offline, notificaciones, impresión y reserva/consumo de inventario se completan por separado. Abrirla en un celular no habilita fichaje. Las capturas `preparation-*.png` son de pruebas con datos ficticios, sin importar ventas a tu instalación.

Para actualizar una instalación anterior, conservá tu base y configuración, detené el servidor local, instalá las dependencias con `npm ci`, ejecutá `npm run db:migrate` y reiniciá. No borres la base para incorporar esta migración.

## Ejecutar localmente

Requiere Node.js 24 y npm. No contiene credenciales ni datos del local. El logo proviene del sitio original.

```bash
npm ci
cp .env.example .env
```

En `.env`, dejá `DATABASE_URL` vacío para el desarrollo local y mantené `KYBO_LOCAL_DB=.local/kybo-db`. Configurá `BETTER_AUTH_SECRET` con un secreto aleatorio de al menos 32 caracteres y `BETTER_AUTH_URL=http://localhost:3000`. Una forma de generar el secreto localmente:

```bash
node -e "console.log(require('node:crypto').randomBytes(48).toString('base64'))"
```

Después:

```bash
npm run db:migrate
```

Asigná temporalmente `KYBO_NEW_USER_PASSWORD` en tu entorno privado o `.env` con una contraseña de entre 8 y 128 caracteres. No la pases como argumento de línea de comandos, ni la pegues en el repositorio. Ejecutá el alta, sustituyendo el correo de ejemplo:

```bash
npm run user:create -- "Francisco" "francisco@example.com" admin
```

Eliminá `KYBO_NEW_USER_PASSWORD` tras crear el usuario y ejecutá:

```bash
npm run dev
```

Abrí http://localhost:3000 e ingresá con esa cuenta. También podés crear `manager` o `staff`; este último no tiene acceso administrativo. La gestión de permisos/fichajes de empleadas tendrá su propia interfaz en una entrega posterior.

PGlite usa PostgreSQL embebido únicamente para desarrollo y pruebas. Su directorio es local y no está incluido en el repositorio. No abras la misma base local simultáneamente desde varios procesos. Las migraciones y la creación de usuarios se ejecutan con el servidor local detenido. Producción rechaza este modo.

## Conectar Neon

Configurá `DATABASE_URL` con la URL PostgreSQL de tu rama de desarrollo de Neon, incluida la configuración TLS que indica Neon. Se usa `pg` en el runtime Node de Next.js; las credenciales permanecen en el servidor. Quitá `KYBO_LOCAL_DB`, configurá `BETTER_AUTH_URL` con el origen real y un secreto propio del despliegue.

Aplicá `npm run db:migrate` a la rama de desarrollo y creá la cuenta administradora. Para producción, revisá el SQL y los respaldos antes de aplicar migraciones sobre datos existentes. No se usa `push` ni se reinicia una base de forma automática.

Este proyecto no crea un proyecto Neon, no importa `app_state` ni conecta Fudo automáticamente. La persistencia y migraciones se verifican localmente; faltan la configuración y validación de tu Neon y del alojamiento real. No se publicó esta aplicación ni se modificó el sitio vigente.

## Uso de importes

Los formularios usan coma decimal y punto de miles: `7.500` significa siete mil quinientos; `54,208` significa cincuenta y cuatro con 208 milésimas. No se aceptan decimales con punto ambiguos. Los costos de insumos se ingresan **por unidad base**, no por kilo o paquete: ARS 54.208 por kg equivale a ARS 54,208 por g. Guardar una presentación no registra una compra ni agrega stock.

Archivar oculta un registro de las nuevas selecciones pero conserva su identidad. Los clientes nuevos no quedan autorizados para promociones. Crear un medio de pago no configura una plataforma de delivery.

Este incremento necesita conexión para leer y guardar. Antes de enviar una compra, pago, ajuste, receta, producción, venta o modificación de mesa, conserva la operación en el almacenamiento de la pestaña, separada por usuario. Si se pierde la respuesta, al recargar o volver al módulo aparece la opción de reenviar el mismo contenido con su clave original; no se envía automáticamente. Si el navegador no permite guardarla, no inicia la escritura. Esta recuperación no cubre cerrar la pestaña o borrar los datos del navegador: ante ese caso, comprobá el historial antes de registrar otra operación. El catálogo conserva su semántica anterior: revisá la lista antes de repetir una alta no confirmada. El POS offline tendrá su propia cola persistente y protocolo de conciliación.

## Pruebas

```bash
npm test
npm run typecheck
npm run lint
npm run build
npx playwright install chromium
npm run test:e2e
```

Las pruebas de dominio usan una base PostgreSQL embebida nueva, con el SQL de migración real. El comando E2E crea una base temporal y un administrador y un usuario de personal de prueba con contraseña aleatoria, inicia Next en el puerto 3017 y destruye solo sus datos temporales al finalizar. No apunta a la URL de base de tu entorno. Se debe poder descargar el navegador de Playwright; en un entorno con Chromium ya instalado se admite `E2E_BROWSER_PATH`.

## Estructura

- `src/db`: esquema relacional y conexiones.
- `src/lib/auth.ts`: sesiones; `access.ts`: capacidades; `errors.ts`: errores seguros.
- `src/modules/catalog`: definiciones, validación, servicios y adaptación HTTP.
- `src/modules/inventory`: recepciones/pagos, cálculo decimal, saldos, lotes y movimientos.
- `src/modules/recipes`: versiones, dependencias y costos de reposición.
- `src/modules/production`: revisión y registro transaccional de producción.
- `src/modules/sales`: ventas, cuentas, renglones históricos, cobros/devoluciones y mesas.
- `src/modules/preparation`: estaciones, ruteo, publicación de tareas, eventos y tiempos de comandas.
- `src/app`: páginas y endpoints privados.
- `src/components/ui`: componentes del registro oficial de Shadcn.
- `drizzle`: migraciones SQL y sus metadatos.
- `tests`: dominio, autenticación y flujos de navegador.
- `docs/superpowers`: diseño completo y plan de este incremento.

Decisión técnica: se usa Drizzle en lugar del Prisma propuesto inicialmente, para compartir esquema PostgreSQL entre Neon y las pruebas locales. El stack solicitado se mantiene. El repositorio del sitio original se conserva intacto.
