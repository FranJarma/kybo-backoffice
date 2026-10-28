# Apertura y cierre de caja — diseño aprobado para implementación

Fecha: 27/10/2026. Rama: `codex/cash-register`, base `cbf7cd3`. El usuario aprobó la implementación completa después de revisar la propuesta visual, con los cambios administrativos detallados a continuación. Sin commit ni push. Aplicar nuevas migraciones en Neon requiere autorización explícita después de preparar y verificar el cambio; permanece autorizada la base descartable de pruebas.

## Ajustes aprobados al iniciar la implementación

- Permisos y configuración de fondos objetivos salen de la pantalla operativa de Caja. Se gestionan exclusivamente por el administrador en Configuración de caja, dentro de Configuración. El encargado conserva sus facultades de operar/revisar, pero no puede conceder permisos ni cambiar parámetros. Esta instrucción reemplaza las propuestas previas que delegaban la configuración al encargado.
- Fondo objetivo inicialmente sin configurar; no se carga el ejemplo de $50.000 como valor real. Horario inicial 23:00. La configuración se fija en cada apertura para conservar el historial.
- Se implementa el recorrido aprobado de tres pasos, foto obligatoria para lotes registrados, excepción explícita de lote pendiente con motivo y revisión, y motivos para diferencias de efectivo o posnet. Primera configuración: un posnet genérico por sucursal, con varios lotes posibles; no se presupone un proveedor/modelo ni integración con el equipo.
- Activación por sucursal al realizar su primera apertura: no se reconstruyen cobros históricos. Desde esa activación se exige una caja abierta para cobros locales y salidas del cajón. Las transferencias externas a proveedores siguen disponibles fuera de caja.
- Los cierres confirmados son inmutables. Revisión agrega responsable/observación; los reembolsos posteriores se registran en la jornada abierta actual y no reescriben cierres anteriores. Cada nueva apertura toma la fecha calendario local actual y conserva su identidad hasta cerrar, aun después de medianoche. Se permite resolver una sesión olvidada cerrándola con los movimientos reales; no se cambian jornadas silenciosamente.
- La continuación de borradores entre dispositivos no forma parte del cierre inicial: se permite operar desde computadora, tablet o celular, con comprobantes guardados de forma privada. Las fotos se vinculan a sucursal y sesión y se consultan con acceso autorizado.

## Estado de la entrega

Implementación local completada y verificada el 27/10/2026. Resultado, alcance definitivo, pruebas y límites en `docs/superpowers/plans/2026-10-27-cash-register-result.md`. Las secciones de propuesta y pendientes que siguen conservan el historial del diseño; los ajustes aprobados anteriores y el resultado de implementación prevalecen sobre sus alternativas previas. Posteriormente el usuario autorizó aplicar 0028/0029 en Neon: ambas quedaron aplicadas, con historial y contenido previo verificados, sin operaciones de negocio de prueba. No se hizo commit/push. La primera apertura real queda a cargo del usuario.

## Decisiones confirmadas

- Un único cierre al terminar el día, con posibilidad de incorporar cierres por turno en el futuro.
- Horario de cierre configurable por sucursal; horario habitual inicial informado: 23:00 en la zona horaria de la sucursal.
- Si se continúa cobrando después de medianoche, los cobros permanecen en la jornada de la caja abierta hasta realizar su cierre.
- Incluir gastos cotidianos, que generalmente se pagan con efectivo de caja.
- Registrar una sola vez cada gasto y cada pago a proveedor; reflejar el mismo movimiento en los módulos correspondientes.
- Conservar Compras para pedidos, recepciones y pagos, y Finanzas para el presupuesto y análisis mensual.
- Personal autorizado también puede abrir, cerrar la caja y registrar gastos. Solo el administrador define quién tiene permiso para cada una de esas acciones, desde Configuración de caja.
- En primera instancia los pagos a proveedores quedan a cargo de quienes administran el negocio y no se delegan al personal.
- Se deja un fondo de cambio para el día siguiente; su importe objetivo debe ser configurable por sucursal. No se informó todavía un monto real para cargar.
- Se necesita registrar el retiro de efectivo, especialmente de billetes grandes, desde Caja. Los retiros quedan reservados al administrador y al encargado en la primera etapa, igual que los pagos a proveedores; no se delegan al personal.
- Personal autorizado puede confirmar un cierre con faltante o sobrante, con motivo obligatorio. Cualquier diferencia queda para revisión posterior del encargado, sin bloquear el cierre.
- Los pedidos a proveedores de Bolivia se pagan por adelantado, antes de que envíen la mercadería. A proveedores locales generalmente se les paga al recibir. El circuito debe admitir ambas modalidades dentro de Compras, sin separar pantallas por país.
- Los anticipos a Bolivia se pagan por transferencia, por fuera de la caja del local. Esos pagos deben conservarse en Compras y no disminuir el efectivo físico de la caja.
- Incorporar el registro de cierres de lote del posnet al cierre de caja, para conservar esa información y poder contrastarla con los cobros registrados. Proveedor, equipos, modo de carga y tratamiento de lotes pendientes todavía por confirmar.

## Revisión del repositorio

- No existen entidades, pantallas ni configuración de turnos laborales u operativos. «Turno de la mañana/tarde» son textos de motivos de traslado en `src/components/inventory/transfer-draft-form.tsx`.
- La producción tiene órdenes asignadas a personas con fecha/hora prevista; esto no define turnos de trabajo.
- Sucursales guardan zona horaria, pero todavía no horarios de apertura/cierre ni un corte de jornada. `src/modules/operations/business-date.ts` utiliza actualmente la fecha calendario local; la jornada de caja deberá conservar su identidad independientemente de ese cambio de fecha.
- Las ventas ya guardan cobros/devoluciones, medio de pago, tipo de medio, responsable y hora del servidor. Falta vincularlos a una sesión de caja.
- Los pagos a proveedores están vinculados a recepciones y admiten pagos parciales. Falta caja de origen y registro de anticipos antes de recibir mercadería.
- Los gastos actuales son conceptos agregados por sucursal/mes, con presupuesto e importe real. Falta el registro individual del gasto cotidiano y su vínculo con caja/resumen mensual.
- La administración general de usuarios está reservada al administrador (`src/modules/users/service.ts` y navegación). Los nuevos permisos de caja también quedan exclusivamente en Administración, según la última instrucción del usuario.

## Propuesta de estructura

- Una caja compartida por sucursal en la primera entrega, con sesión de apertura/cierre, fondo inicial y responsable. La identidad de sesión no se reduce a una fecha: conserva horas reales de apertura/cierre y fecha operativa, para permitir posteriores sesiones por turno.
- Registrar quién ejecuta cada movimiento y los relevos de responsabilidad durante el día; estos relevos no obligan a realizar un cierre intermedio.
- Preparar la evolución del modo de cierre por sucursal. La primera versión opera únicamente en modo diario; el modo de cada sesión queda fijado al abrirla. Un futuro cambio por turnos no reinterpreta cierres históricos y requiere incorporar su configuración y reglas antes de habilitarlo.
- Los turnos laborales y la asistencia se diseñan como un módulo separado. Una caja diaria puede ser utilizada por empleados de diferentes turnos; un cambio de turno laboral no genera por sí mismo un cierre financiero.
- Cada cobro, devolución, gasto o pago conserva su documento de origen y una única vinculación financiera. Registrar el pago y su movimiento de caja debe ser una operación conjunta, protegida contra reintentos duplicados.
- Distinguir efectivo físico de tarjetas/transferencias y cobros de plataformas. Mostrar estos últimos en el resumen correspondiente sin sumarlos al efectivo disponible del cajón.
- Los gastos cotidianos se vinculan al resumen mensual evitando duplicar conceptos. Los pagos por mercadería no se vuelven a sumar a gastos generales cuando su costo ya está en los productos; presupuesto, gasto y pago conservan sus significados separados.

Estas son propuestas de diseño, no funcionalidades implementadas ni decisiones adicionales atribuidas al usuario.

## Jornada y horario previsto de cierre

El horario configurado se interpreta como cierre previsto, no como una orden automática de cerrar o de cambiar la jornada. Propuesta: mostrar un aviso al superar ese horario y mantener disponible la operación hasta que se confirme el cierre. Cambiar la configuración afecta las aperturas siguientes; la sesión conserva una copia de su fecha operativa, zona horaria y horario previsto.

La fecha de jornada se fija al abrir la caja. Cada cobro y egreso vinculado conserva esa jornada mientras la sesión esté abierta, incluso si pasa la medianoche. Las fechas y horas reales del servidor se mantienen para auditoría; no se modifica el reloj ni se cambia la fecha original de documentos históricos. Una venta y el cobro de su saldo pueden pertenecer a momentos diferentes: los movimientos del cierre se atribuyen según la sesión en que se ejecutan.

Ejemplo de diseño: caja abierta el 27/10, cierre previsto a las 23:00. Si se cobra a las 00:15 del 28/10 y se cierra a las 00:30, ese cobro integra la jornada del 27/10; la hora real sigue siendo 28/10 00:15. La próxima apertura crea otra sesión y no arrastra los cobros ya cerrados.

Una caja olvidada abierta no cambia de jornada silenciosamente. Debe señalarse su antigüedad y resolverse expresamente, conservando los movimientos confirmados. Los cierres y cobros simultáneos deberán serializarse para que todo movimiento quede en una sesión abierta y ningún cobro aparezca después del corte de un cierre confirmado.

## Personal autorizado y permisos de caja

Acciones configurables de forma independiente por persona:

- Abrir caja.
- Cerrar caja.
- Registrar gastos del día.

Así, una persona puede tener permiso para registrar gastos sin tener permiso para cerrar la caja. Cada movimiento conserva la identidad real de quien lo confirma.

El administrador gestiona estos permisos por sucursal desde Configuración de caja. El encargado no concede ni revoca permisos ni cambia los fondos objetivos. El personal necesita autorización explícita; el rol Personal y el permiso de catálogo no conceden permisos de caja automáticamente. Encargados y administradores operan dentro de su ámbito habitual. La gestión de permisos de caja no permite cambiar roles, contraseñas ni accesos generales.

La selección de empleados reutilizará Autocomplete y mostrará personas activas con acceso vigente a la sucursal. La concesión y revocación registran quién realizó el cambio y cuándo. El servidor comprueba los permisos vigentes al confirmar cada operación, aun si la pantalla quedó abierta desde antes de una revocación; la interfaz muestra solamente las acciones disponibles.

Pagar proveedores conserva en la primera entrega el acceso actual de Compras para encargado/administrador. No se agrega un permiso delegable al personal para esta acción. Registrar un gasto no habilita pagos a proveedores; el pago de una recepción genera su movimiento de caja desde el mismo registro de Compras. La revisión de diferencias queda en encargado/administrador y no requiere autorización previa para confirmar el cierre.

Los retiros de efectivo también quedan reservados a administrador/encargado. El personal con permiso de cierre cuenta y confirma lo que efectivamente queda, con retiro nuevo de cierre igual a cero; un retiro previo realizado por administrador/encargado ya integra los movimientos de la jornada. Si el cierre incluye un nuevo retiro, quien lo confirma debe tener ambas facultades. El fondo objetivo no obliga a retirar dinero ni impide reflejar un remanente real superior al objetivo.

## Fondo de cambio y retiros de efectivo — propuesta de circuito

Cada sucursal configura un **fondo de cambio objetivo**. Es una referencia para sugerir cuánto dejar, no una afirmación de cuánto dinero existe. El cierre registra el importe efectivamente dejado y la próxima apertura propone ese importe, sujeto a confirmación del conteo real. El fondo inicial no se clasifica como venta ni ingreso comercial del día.

Acción **Retirar efectivo** disponible para administrador/encargado desde Caja durante una sesión abierta: importe, motivo, usuario que registra y referencia de quién recibe el dinero/destino. El retiro disminuye el efectivo esperado, conserva historial y se identifica por separado de los gastos cotidianos y pagos a proveedores. Su registro no crea un gasto general mensual. La autorización para retirar es independiente de abrir/cerrar o registrar gastos; no se delega al personal en la primera entrega.

Propuesta para el cierre con retiro simultáneo:

1. Contar todo el efectivo que hay en el cajón antes del nuevo retiro de cierre.
2. Comparar ese conteo con lo esperado según fondo inicial y movimientos ya confirmados.
3. Revisar cuánto retirar y cuánto quedará como fondo. Puede sugerirse el excedente sobre el objetivo, con confirmación explícita y sin forzar un retiro si el efectivo resulta insuficiente.
4. Registrar retiro y cierre conjuntamente; conservar en el comprobante contado antes del retiro, retiro de cierre, fondo efectivamente dejado y diferencia de arqueo. Una sola confirmación y una misma identidad de operación para los reintentos.

Definiciones: `E` es el efectivo esperado antes del nuevo retiro de cierre; `C`, el efectivo contado en ese momento; `R`, el retiro nuevo; `F = C − R`, el efectivo efectivamente dejado; y `D = C − E`, la diferencia de arqueo. Tras el retiro, el esperado final es `E − R`; la diferencia sigue siendo `D`. Exigir `0 ≤ R ≤ C`. Los retiros registrados previamente ya forman parte de `E` y no se restan otra vez.

Ejemplo ficticio, no valores para cargar: objetivo $50.000; esperado y contado $300.000; retiro $250.000; fondo dejado $50.000; diferencia $0. Si el esperado hubiera sido $305.000, el faltante de $5.000 seguiría visible aunque se dejara exactamente el fondo objetivo.

Si el retiro se realizó antes durante el día y ya está registrado, al cerrar se cuenta únicamente el efectivo que queda físicamente: ese retiro aparece en el resumen del día y no se vuelve a cargar como retiro de cierre. Cerrar una sesión no genera silenciosamente un retiro adicional. Los retiros posteriores a un cierre requieren otro circuito auditado y no deben modificar el cierre confirmado.

## Diferencias de arqueo y revisión posterior

El cierre financiero y su revisión son estados independientes. Una caja confirmada con diferencia queda **cerrada**, con revisión **pendiente**, y permite continuar con la siguiente apertura. No se conserva una sesión abierta artificialmente mientras se espera al encargado.

- Cualquier diferencia distinta de cero, faltante o sobrante, exige un motivo antes de confirmar. No se aplica un umbral silencioso que omita diferencias pequeñas.
- El cierre guarda esperado, contado, retiros, fondo dejado, diferencia, motivo, usuario y horas reales. Una diferencia cero queda cuadrada y no exige explicar un faltante inexistente.
- Encargado/administrador dispone de una lista de cierres pendientes de revisión de su ámbito, con acceso al detalle y a los movimientos de origen. Propuesta: marcar la revisión con observación, fecha y responsable, conservando historial.
- La revisión no vuelve a abrir la caja ni mueve dinero. El conteo original y el cierre confirmado permanecen inmutables; cualquier corrección deberá ser explícita, trazable y separada de la simple revisión.
- La próxima apertura propone el fondo realmente dejado, aun cuando exista una diferencia pendiente de revisión. Confirmar su conteo no se presenta como aprobación del cierre anterior ni oculta la diferencia.

## Pagos a proveedores y anticipos — propuesta de integración

Compras conserva dos recorridos dentro del mismo módulo:

- **Pago anticipado:** pedido confirmado → registrar anticipo/pago anticipado → recibir mercadería, incluso parcialmente → aplicar el importe ya pagado a la recepción.
- **Pago al recibir:** registrar recepción → registrar pago total o parcial del saldo, como en el circuito actual.

El anticipo queda vinculado a proveedor, sucursal y pedido, con importe efectivamente pagado, fecha real, medio, origen del dinero, responsable y referencia. Puede registrarse antes de tener el costo definitivo de la recepción; el importe pagado es un dato conocido, mientras que el total final puede seguir pendiente. El pedido debe indicar claramente el estado financiero y el importe adelantado; confirmar un pedido o pagar un anticipo no afirma por sí solo que la mercadería haya sido despachada.

Cada pago es un único hecho financiero. Si sale del efectivo de una caja abierta, genera su egreso conjuntamente y en esa jornada. Si se paga por fuera de la caja, conserva su registro en Compras y no disminuye el efectivo físico del cajón. Para los anticipos a Bolivia, la modalidad confirmada es transferencia por fuera de caja. El registro permite identificar medio y origen del pago; no se decide el efecto sobre el efectivo según el país del proveedor.

Propuesta de presentación: identificar estos anticipos como **Pagado fuera de caja · Transferencia**, con su referencia y fecha real. Se mantienen separados de los retiros de efectivo y de los cobros por transferencia de ventas. Su aplicación a una recepción no crea un egreso de caja ni una nueva transferencia. Registrar este pago no procesa una operación bancaria ni afirma haberla conciliado automáticamente; la integración bancaria no forma parte de esta entrega.

Al confirmar una recepción del mismo pedido/proveedor/sucursal y con importe conocido, se aplica automáticamente el anticipo disponible hasta cubrir su saldo. La revisión de recepción muestra cuánto se aplica y cuánto queda. La aplicación es un vínculo entre el pago existente y la recepción: no crea un pago nuevo, no genera otro egreso y no vuelve a pedir el importe al usuario. Si el costo está pendiente, se conserva el anticipo disponible sin aplicarlo a un total inventado.

Ejemplo ficticio: un pedido tiene $100.000 adelantados y llega una primera entrega de $60.000. Se aplican $60.000; la recepción queda cubierta y permanecen $40.000 de anticipo para el resto. La segunda entrega aplica ese remanente. Solo existe la salida de dinero original de $100.000.

El ingreso de mercadería y su valuación utilizan cantidades y costos reales de la recepción, aunque ya esté pagada. El anticipo no es un descuento del costo del insumo. Una diferencia de precio puede dejar un saldo adicional a pagar o un anticipo remanente, ambos explícitos.

Las aplicaciones deben impedir consumir dos veces el mismo saldo y respetar proveedor, sucursal y pedido. Recibir o pagar simultáneamente, así como reintentar después de perder una respuesta, no debe duplicar pagos, aplicaciones ni movimientos de caja. Los pagos históricos directos a recepciones conservarán sus identidades y fechas; no se copian como nuevos anticipos.

Cancelar un pedido no devuelve dinero automáticamente. Un anticipo remanente queda identificado como pendiente de resolver por la administración; la devolución de dinero efectivamente recibida requiere un registro explícito y su movimiento en la caja/cuenta de destino. No se asigna silenciosamente a otro proveedor o pedido.

## Posnet y cierre de lotes — propuesta pendiente de validar

El usuario solicita incorporar los cierres de lote al cierre de caja. Actualmente los cobros conservan medio de pago, tipo, responsable, fecha e importes/comisiones estimadas, pero no identifican terminal, procesador ni lote. La primera propuesta es registrar el comprobante del equipo y conciliarlo dentro del cierre; la automatización dependerá del proveedor/modelo y no se presupone disponible.

Recorrido propuesto: antes de confirmar el cierre, mostrar una sección **Tarjetas / Posnet** con cobros esperados y estado de conciliación de cada terminal utilizada. Registrar número de lote, terminal/procesador/comercio cuando corresponda, fecha y hora reales del cierre del lote, cantidad de operaciones, ventas, anulaciones/devoluciones y total comparable del comprobante. Adjuntar foto o archivo del cierre como respaldo, asociado al usuario que lo registra. Los campos exactos dependen del comprobante que emita el equipo.

Comparar los cobros administrativos de tarjeta con el importe del mismo conjunto de operaciones del comprobante, antes de comisiones. Las anulaciones y devoluciones deben conservar su signo y alcance; no comparar ventas brutas con un total que ya descuenta devoluciones. No usar `settlementNet` como dinero acreditado ni comparar este neto estimado con el total bruto del lote. Mantener diferencias de tarjetas separadas del faltante/sobrante de efectivo; registrar un lote no crea un cobro, no mueve efectivo y no verifica una acreditación bancaria.

Propuesta de control: no permitir terminar el recorrido omitiendo silenciosamente los equipos con movimientos. Cada terminal debe tener sus lotes registrados o una excepción explícita con motivo, pendiente para el encargado. Una diferencia exige explicación y conserva el cierre de efectivo y su revisión independientes. La posibilidad de cerrar con lote faltante y el requisito de adjuntar comprobante deben confirmarse; la autorización previa para cerrar con diferencias de efectivo no resuelve por sí sola estas decisiones.

Admitir varios lotes por equipo y jornada; no asumir que la fecha calendario o el lote coinciden exactamente con la sesión. Guardar período/operaciones cubiertas, incluido el trabajo después de medianoche, y evitar contabilizar un cobro en dos lotes. Si existen varios equipos, los cobros necesitan identificar su terminal para poder calcular el esperado correspondiente; con un único equipo configurado puede asignarse por defecto. Un cierre automático del proveedor no debe confundirse con el cierre de la jornada de caja.

El historial de caja debe conservar los lotes, totales comparados, diferencias, comprobantes y responsables. Una regularización posterior agrega evidencia e historial sin reescribir el arqueo confirmado. Pendiente conocer cantidad de equipos, proveedor/modelo y un comprobante real para ajustar el diseño y la maqueta.

## Propuesta visual para revisión

Se preparó una maqueta interactiva aislada de la app, con datos ficticios y sin APIs de negocio. Se sirve mediante el acompañante visual de Superpowers; actualización del cierre con posnet: `.superpowers/brainstorm/1135-1793117744/content/cash-v6.html`. Fuentes y comprobaciones locales en `.next-e2e/cash-prototype/`.

La propuesta presenta:

- Caja actual con efectivo esperado, composición del efectivo y movimientos. Cobros por otros medios y pagos externos quedan separados del cajón.
- Apertura que propone el último fondo real dejado; gasto del día con impacto único en el resumen mensual; retiros durante el día y al cerrar.
- Cierre con contado antes del nuevo retiro, fondo efectivamente dejado, motivo obligatorio ante diferencia y revisión posterior.
- Lista de cierres y revisión del encargado, conservando el conteo original y permitiendo la apertura siguiente.
- Configuración de horario/fondo por sucursal y permisos independientes de abrir/cerrar/gastos por persona, usando el Autocomplete existente.
- Compras con anticipo externo, aplicación automática a recepción parcial y pagos locales que generan una sola salida de efectivo.
- Selector de encargado/personal autorizado y escenarios de apertura, jornada abierta y cobros posteriores a medianoche. Son controles de la maqueta, no propuestas de controles para la app real.
- Cierre en tres pasos: **Efectivo → Posnet → Revisar**. Volver al paso anterior conserva los datos y las fotos dentro de la maqueta.
- Posnet genérico de ejemplo, sin atribuirle un proveedor real: número de lote, fecha/hora, operaciones y total; admite varios lotes y compara la suma contra los cobros de tarjeta de la jornada, manteniendo separado el efectivo.
- Foto al principio del paso de posnet, con **Tomar foto** (selector de cámara trasera en navegadores móviles compatibles), **Elegir foto**, vista previa, ampliación y eliminación. Admite JPG/PNG/WebP de hasta 10 MB. En esta maqueta la imagen se lee en memoria del navegador; no se sube a un servidor y se pierde al recargar. Tampoco se sincronizan borradores entre computadora y celular ni se conecta el equipo de cobro.
- Comprobante ficticio mediante **Completar con un ejemplo** para recorrer la propuesta sin usar una foto real. Las diferencias de importe u operaciones requieren motivo. La opción excepcional de lote pendiente exige motivo y deja el cierre para revisión; son reglas propuestas en la maqueta, pendientes de aprobación para la implementación.
- Resumen final y detalle de cierres con los lotes, fotos e importes registrados. La revisión del encargado conserva los importes y comprobantes originales; un posnet pendiente o con diferencia requiere revisión aunque el efectivo esté cuadrado.

Decisiones propias de esta maqueta, todavía para validar: ubicar Caja en Finanzas; presentar permisos y configuración como accesos de Caja; solicitar explicación si el conteo de apertura difiere del último fondo; exigir caja abierta para cobros locales (el POS no está implementado en la maqueta y muestra solo un aviso). Los importes de ejemplo, incluido el fondo de $50.000, no son configuración acordada ni datos para cargar.

Verificación de la maqueta actualizada: once grupos de comprobaciones originales y siete grupos del circuito de posnet aprobados, sin errores de JavaScript ni llamadas a APIs de negocio. Incluyen gasto sin duplicación mensual, retiro, anticipo externo y recepción parcial sin egreso adicional, pago local, cierre con faltante y fondo objetivo, revisión posterior y apertura con fondo real. Para posnet se comprobaron carga/reemplazo/eliminación/ampliación de imagen, rechazo de archivo no admitido conservando la foto previa, varios lotes, duplicación de número, diferencia de importe u operaciones con motivo, excepción de lote pendiente, comprobantes visibles en el cierre/revisión, jornada sin tarjetas y lote posterior a medianoche. Inspección y controles de ancho a 1440/1024/768/600/390 px, sin desborde horizontal y con acciones del cierre visibles. Evidencia local: `.next-e2e/cash-prototype/check-final.log`, `check-posnet.log`, `screens/report.json`, `screens/posnet/report.json` y capturas. La opción de cámara se verificó mediante su control de captura y carga de archivo en navegador automatizado; no se probó una cámara física. Esta verificación no prueba servicios reales de Caja ni constituye una implementación de negocio.

## Pendientes de definir

- Tratamiento de correcciones de documentos de origen, manteniendo inmutables los cierres confirmados.
- Fecha propuesta de la siguiente apertura, reaperturas/correcciones y resolución de una caja olvidada abierta, sin crear un segundo cierre diario por accidente.
- Registro de aportes del dueño y tratamiento de diferencias entre el último fondo dejado y el conteo de apertura.
- Reglas de venta con caja cerrada y reembolsos de ventas de días anteriores.
- Resolución operativa de un anticipo remanente o devuelto.
- Integración de los gastos diarios con conceptos mensuales existentes y períodos ya cerrados.
- Revisión de la propuesta visual de Caja y aprobación del diseño completo antes de planificar la implementación.
