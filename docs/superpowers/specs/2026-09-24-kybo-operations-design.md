# Kybo Operations — Especificación de producto y arquitectura

Fecha: 24 de septiembre de 2026 · Versión 0.10 · Estado: propuesta para revisión

Este documento reúne las decisiones de Francisco y propone cómo implementarlas. No es un plan de ejecución aprobado. La aprobación del fichaje confirma ese módulo; las decisiones técnicas y los límites de la primera entrega que se detallan aquí requieren revisión del documento completo. No se modificó el sitio en uso.

## 1. Objetivo y decisiones confirmadas

Mejorar la operativa de Kybo y aumentar sus ganancias mediante información confiable sobre ventas, costos, stock, pérdidas, caja y clientes. La aplicación será un sistema interno en español de Argentina, con importes en ARS, usando Next.js, TypeScript, Neon y Shadcn.

Dirección confirmada por Francisco:

- Construir ventas propias funcionales desde la primera versión, con el objetivo de dejar Fudo cuando el reemplazo esté validado.
- Poder seguir tomando pedidos y registrando ventas cuando se corta internet. La respuesta afirmativa de Francisco se incorpora con este alcance; falta definir si caja y preparación deben seguir sincronizadas entre equipos durante el corte.
- Postergar la emisión de comprobantes fiscales para una etapa posterior: Francisco confirmó que no es prioritaria para la primera versión. Se mantienen el registro de ventas y cobros y la referencia opcional a un comprobante externo. Esta decisión no posterga la carga de fotos de comprobantes de compra.
- Atender mostrador con cobro previo a la preparación y mesas con cuentas abiertas que se pagan al finalizar.
- Editar la distribución de mesas sobre una grilla y comparar actividad de mesas, mostrador y delivery.
- Registrar PedidosYa manualmente al principio si fuera necesario y contemplar Uber Eats. Actualmente cargan PedidosYa como medio de pago en Fudo y ajustan importes.
- Medir espera y preparación de pedidos, distinguiendo las demoras de retiro o entrega.
- Usar estaciones y asignaciones flexibles. No fijar cantidad de personas ni funcionamiento según mañana o tarde.
- Integrar la impresora de comandas existente, Hasar P-HAS-181, conectada por cable de red. Francisco confirmó computadora de escritorio para caja en la primera versión; la tablet es una posible evolución posterior, no un cambio de equipamiento inicial.
- Contemplar preparación desde los celulares del personal con una cola compartida. Francisco propone una PWA para reducir papel y usar datos móviles cuando falle la conexión del local; el flujo concreto siguiente es una propuesta de diseño.
- Incorporar un módulo simple de fichaje para controlar horarios y facilitar la revisión de horas adicionales.
- Restringir las marcas de asistencia a un punto autorizado del local, con PIN individual y hora del servidor.
- Gestionar proveedores, clientes y medios de pago; compras, recetas, producción, inventario, mermas y cierre.
- Asistir la carga de compras con fotos de comprobantes, usar WhatsApp para pedidos y fidelización, y mostrar reportes orientados a rentabilidad.
- Recomendar subidas y bajadas de precios por producto/canal, combos y campañas que mejoren ticket, consumo y margen; incorporar promociones para reducir riesgo de vencimiento y merma.
- Analizar cuánto deja efectivamente PedidosYa. Francisco informa aproximadamente ARS 2.000.000 mensuales de facturación y una meta de ARS 5.000.000; son referencia declarada y objetivo, respectivamente, no cifras auditadas ni un resultado prometido.

## 2. Punto de partida y migración

La auditoría del código actual de Kybo Operations identificó una tabla D1 `app_state` con un JSON que concentra los datos. Existe control optimista por revisión para rechazar escrituras desactualizadas, pero no relaciones ni validaciones de dominio suficientes. Fudo y varios indicadores siguen simulados; hay datos iniciales de ejemplo mezclables con cambios reales.

Las compras no conservan toda la metadata ingresada, los costos históricos no son reconstruibles de forma completa, el cierre es un único objeto y hay rutas que convierten costos desconocidos en cero. El frontend principal está en scripts JavaScript montados sobre la estructura del sitio. Se conservarán los flujos útiles y la identidad visual; la lógica operativa se reconstruirá en módulos tipados.

Migración propuesta:

1. Exportar una copia íntegra de los datos existentes y conservar el origen de cada registro. La auditoría inicial solo pudo leer parcialmente el JSON guardado.
2. Validar catálogo, recetas, presentaciones, precios, proveedores y referencias. Separar ejemplos de datos reales con Francisco.
3. Importar los datos verificables y realizar un conteo inicial de stock. No inventar movimientos históricos para justificar un saldo.
4. Mantener los registros antiguos incompletos como antecedentes identificados; no usarlos como históricos contables completos.
5. Probar operaciones en un entorno separado y comparar ventas, caja y stock antes del cambio operativo.
6. Acordar una fecha de corte. Cada venta debe tener un solo origen operativo y descontar stock una sola vez.

Fudo será un conector de transición e importación, no una dependencia para operar el POS propio. No se copiarán sus credenciales al navegador.

## 3. Arquitectura propuesta

Un único proyecto Next.js organizado por módulos: catálogo, compras, inventario, producción, ventas, preparación, caja, clientes y personal. Esto permite compartir autenticación y transacciones sin desplegar múltiples servicios independientes.

| Componente | Propuesta |
| --- | --- |
| Interfaz | Next.js App Router, TypeScript, Shadcn y Tailwind; superficies compactas y adaptadas a móvil |
| Lógica de negocio | Servicios en servidor; validación con Zod; Server Actions o Route Handlers delegan en los mismos servicios |
| Datos | PostgreSQL en Neon, esquema relacional y migraciones; Prisma propuesto como ORM |
| Archivos | Almacenamiento privado de comprobantes; base de datos con referencias y permisos de acceso |
| Procesos externos | Trabajos persistentes para sincronización, lectura de comprobantes y mensajes; reintentos sin duplicación |
| Continuidad del POS | Interfaz disponible sin conexión, datos locales y cola persistente de operaciones; conciliación con Neon al recuperar conexión |
| Preparación móvil | PWA con cola compartida y actualizaciones desde el servidor; acciones autorizadas y confirmadas transaccionalmente |
| Impresión operativa | Adaptador local propuesto en la PC de escritorio actual hacia la Hasar por Ethernet; trabajos persistentes e impresión opcional, independiente del estado de preparación |
| Autenticación | Sesiones propias y permisos comprobados en cada operación del servidor; proveedor a seleccionar en el plan técnico |
| Auditoría | Autor, fecha, origen y motivo de correcciones; operaciones confirmadas se corrigen mediante eventos compensatorios |

Tablas normalizadas para entidades operativas. JSON acotado puede conservar respuestas de proveedores y resultados de reconocimiento, sin sustituir ventas, compras o movimientos. Importes y cantidades usarán precisión decimal explícita; los totales se recalcularán en el servidor. Timestamps en UTC y visualización en la zona horaria de Salta; los cierres tendrán fecha comercial explícita.

Propuesta de permisos: administrador con configuración y reportes; encargada con capacidades delegadas; personal con funciones operativas asignadas. Las estaciones indican dónde se trabaja, no qué permisos tiene una persona. El acceso a fichajes propios no habilita ver los de otras empleadas.

### Operación sin internet

El POS debe admitir pedidos y ventas durante un corte. Se propone una PWA con recursos previamente descargados mediante service worker y catálogo versionado en IndexedDB. El circuito esencial se ejecuta en el dispositivo sin necesitar una Server Action para cada paso; al sincronizar, los servicios del servidor validan las operaciones. Neon continúa siendo la base central. Esta solución requiere habilitar y preparar el equipo con conexión antes de usarlo offline.

Alcance inicial propuesto: nueva venta, cuenta de mesa asignada al equipo, comandas y estados de preparación locales, y registro de cobros en efectivo o confirmados por un medio externo. Elegir cliente entre datos disponibles o consumidor ocasional. Stock y reportes se muestran con fecha de última sincronización y operaciones pendientes. Integraciones de delivery, reconocimiento de fotos y envíos por WhatsApp esperan conexión. Registrar un pago no procesa una tarjeta ni verifica por sí mismo una transferencia; un resultado incierto no autoriza repetir el cargo.

Cada acción guarda atómicamente su cambio local y una operación pendiente, con ID estable, dispositivo, responsable, secuencia, dependencias y versión de datos. Mostrar «guardado en este equipo, pendiente de sincronizar» solo después de completar la transacción local. Si falla, la interfaz no afirma que guardó. Las operaciones confirmadas localmente deben recuperarse al cerrar y reabrir la aplicación en el mismo perfil.

Al volver la conexión, procesar las dependencias en orden y validar importes contra los precios y reglas versionados utilizados al vender. Conservar el importe efectivamente registrado: no sustituirlo por el precio actual. El servidor aplica efectos y registra la clave de idempotencia en la misma transacción. Una respuesta perdida se resuelve consultando o reenviando el mismo ID; no creando otra venta. Eliminar pendientes únicamente después de una confirmación durable; conservar el historial. Reintentar con la app abierta, al reabrirla y mediante acción manual; no depender exclusivamente de sincronización en segundo plano.

Los conflictos quedan visibles para conciliación, sin sobreescritura automática por «última escritura». Un faltante detectado al sincronizar no borra una venta real: se conserva y señala el desajuste. Las reservas offline solo son locales; no garantizan disponibilidad global. Los costos definitivos requieren reconciliar movimientos y no se deducen del orden de llegada de las solicitudes. Reglas o permisos incompatibles dejan una operación para revisión, sin ocultarla ni ejecutarla automáticamente como si estuviera autorizada.

**Conexión de caja y celulares.** A partir de la propuesta de Francisco, recomendar sincronización mediante el servidor central mientras cada equipo tenga internet por Wi-Fi o datos móviles. No necesitan estar en la misma red. Si el teléfono tiene datos y caja sigue desconectada, el teléfono puede consultar pedidos ya sincronizados, pero no recibe los nuevos guardados solamente en caja. Compartir internet con caja permite recuperar ese circuito. El cambio de red debe reconectar, consultar el estado vigente y recuperar eventos faltantes, sin volver a ejecutar acciones ya confirmadas. La interfaz distingue conexión activa, reconectando y sin conexión; no muestra como actual una cola que dejó de actualizarse.

**Corte total y cuentas compartidas.** Se mantiene como propuesta un equipo de caja habilitado para continuar offline, con las cuentas bajo su control. La propiedad debe estar registrada antes del corte y respetarse también en el servidor: ningún otro equipo toma o modifica unilateralmente esa cuenta mientras el anterior pueda operar offline. Una transferencia requiere sincronización y entrega de control confirmadas. Este control de cuenta se refiere a renglones, precios y cobros; la asignación de tareas de preparación es independiente. Las tareas ya publicadas pueden seguir en celulares conectados, pero caja desconectada no puede volver a asignarlas o iniciarlas como si conociera su estado; muestra el último estado recibido. Las tareas nuevas creadas offline en caja siguen locales hasta publicar y conciliar.

Sin conexión de ningún tipo, no se puede garantizar una cola compartida entre celulares usando únicamente almacenamiento de navegador. Para la primera versión se propone no incorporar un servidor local de coordinación de pedidos, manteniendo la contingencia en caja y la alternativa de datos móviles. Un adaptador local de impresión no resuelve esa coordinación por sí solo. Si se requiere sincronía entre varios equipos durante un corte total, ese requisito exige ampliar la arquitectura. Esta delimitación continúa como propuesta para revisión.

Si caja intentó publicar una tarea y perdió la respuesta, debe considerarla posiblemente publicada y no iniciar otra preparación local hasta consultar su estado. La falta de respuesta no demuestra que ningún celular la recibió.

Habilitación offline limitada al dispositivo, usuario y capacidades previamente autorizados; sin altas de administradores ni cambios de permisos desconectados. No guardar PIN ni credenciales reutilizables en claro. La revocación remota no puede surtir efecto instantáneo durante un corte. Definir en el diseño de detalle vigencia, desbloqueo tras reinicio y tratamiento de sesión vencida antes de implementar; conservar pendientes aunque venza la autorización, y enviarlos con autenticación recuperada y revisión cuando corresponda.

Comprobar almacenamiento y recuperación en los equipos reales, solicitar persistencia cuando esté disponible y mostrar pendientes antes de cambiar de perfil o actualizar. Las actualizaciones de la aplicación y migraciones locales deben preservar la cola. El guardado local no reemplaza un respaldo: borrar datos del navegador o perder el equipo antes de sincronizar puede perder esas operaciones. La contingencia y recuperación de ese caso se validarán antes de retirar Fudo.

## 4. Catálogo, unidades, recetas y costos

Gestionar insumos, categorías, proveedores, presentaciones de compra, mínimos y objetivos de stock. Un insumo puede tener varias presentaciones y proveedores. Archivar registros usados en operaciones; preservar sus referencias históricas.

Guardar cantidades de stock en una unidad base compatible —masa, volumen o unidades— y convertir las presentaciones al registrar una compra. Dos paquetes de 800 g equivalen a 1.600 g; se conserva también la presentación y el precio pagado por paquete. Las conversiones entre masa y volumen requieren una densidad configurada. Cucharadas requieren una equivalencia explícita por ingrediente.

Productos, variantes, adicionales y combos referencian recetas versionadas. Las preparaciones almacenables incluyen tapioca cocida y tapas de waffles, con posibilidad de agregar otras. Producir una preparación consume insumos y genera su stock; venderla como parte de un producto consume el preparado, sin volver a descontar sus materias primas. Las fórmulas que solo sirven para calcular costos deben distinguirse de preparaciones con stock físico.

Las recetas admiten varios niveles y rechazan referencias circulares. Para planificar un consumo, expandir fórmulas hasta llegar a insumos o preparados con stock; detener la expansión en cada preparado almacenado. Su receta interna se usa al producirlo, no al venderlo. La evaluación de costos también debe detectar ciclos y señalar referencias faltantes.

Distinguir costo actual de reposición, costo de stock y costo histórico consumido. Propuesta inicial: costo promedio ponderado para valorar stock; cada consumo conserva el costo aplicado y cada venta la versión de receta. Las devoluciones y ajustes requieren su propia política de valuación consistente.

Un costo desconocido permanece pendiente. Los márgenes afectados se muestran incompletos y los reportes indican su cobertura. Cambiar un costo o una receta no modifica el precio de venta ni reescribe el costo histórico de operaciones confirmadas.

El catálogo base del código contiene 30 insumos comprados sin precio; esto no es una lista confirmada del último estado guardado. Priorizar validar azúcar mascabo y gramos por cucharada, harina, fécula, aceite, sal y huevos, luego bebidas y envases. Los costos de tapioca y tapas se derivan de sus consumos y rendimiento.

## 5. Compras, producción e inventario

### Compras y comprobantes

Separar pedido al proveedor, recepción de mercadería y pago. Una compra puede recibirse antes de pagarse. Guardar proveedor, fecha, número de comprobante, renglones, cantidades recibidas, unidades, precios, descuentos y ajustes informados, junto con sus pagos.

Flujo de reconocimiento: subir foto o archivo → extraer borrador estructurado → vincular insumos y presentaciones → señalar diferencias y campos dudosos → revisar → confirmar recepción. La extracción no escribe stock directamente. Recalcular totales, controlar duplicados y conservar el documento original. Un comprobante ilegible puede cargarse manualmente; valores desconocidos no se inventan.

Confirmar una recepción agrega existencias y registra su valoración en una transacción. Reenviar la misma confirmación no la duplica. La confirmación debe distinguir cantidades recibidas de cantidades pedidas, incluyendo recepciones parciales.

### Lotes, vencimientos y disponibilidad para promociones

Para perecederos comprados y preparaciones propias, registrar lote, ingreso/elaboración, vencimiento o límite de uso conocido, apertura cuando corresponda, cantidad remanente y estado utilizable/bloqueado. Una recepción puede contener varios lotes. Vincular consumos y mermas a sus lotes; sugerir primero el que vence antes entre los utilizables. Esta prioridad física no cambia por sí sola el método de valuación definido para el stock. No inventar vida útil ni extenderla al procesar, reenvasar o promocionar.

Calcular alertas con existencias utilizables, reservas, fecha límite y ritmo de consumo reciente; mostrar cobertura de datos y rango temporal. Los lotes sin fecha requieren revisión para campañas por vencimiento. Excluir vencidos, bloqueados y cantidades ya registradas como merma. Vencer no elimina automáticamente el movimiento físico: bloquear uso y registrar la baja cuando corresponda, sin duplicarla. Las reservas y el vencimiento deben validarse nuevamente al aplicar una promoción; una proyección desactualizada no garantiza disponibilidad.

### Producción

Seleccionar preparación, cantidad de recetas base, consumos reales y producción obtenida. Mostrar rendimiento esperado y real. Cada lote conserva ID, fecha, responsable, versión de receta, consumos con costos aplicados, costo total y salida real. Los lotes podrán registrar vencimiento cuando corresponda, sin inventar duraciones de conservación.

Validar el consumo agregado por insumo, incluso si aparece varias veces en una receta. Propuesta: bloquear la confirmación de producción con stock insuficiente hasta registrar el ingreso o ajuste correspondiente. Costo del lote y salida real determinan el costo unitario producido. Una diferencia de rendimiento se analiza por separado y no genera una segunda baja automática de insumos ya consumidos.

### Movimientos y conteos

Compras, producción, consumo por pedidos, mermas, devoluciones y conteos generan movimientos identificables. Cada movimiento referencia su operación y responsable. Las existencias se concilian con ese historial; no se reemplaza el saldo sin registrar el ajuste.

Las mermas conservan motivo, nota, cantidad y costo conocido o pendiente. Un conteo guarda esperado, contado y diferencia por insumo, sin sumar kilos con unidades. Las correcciones mantienen el movimiento original y su compensación.

## 6. Ventas, mesas y delivery

La interfaz de Nueva venta permitirá seleccionar cliente o consumidor ocasional, agregar productos y variantes, cambiar cantidades, aplicar descuentos autorizados, calcular totales, registrar cobros y referencias de comprobante. Pagos combinados y parciales son una propuesta funcional para revisar, no una decisión ya confirmada por Francisco.

La primera versión registra ventas y cobros sin emitir comprobantes fiscales. El número de comprobante externo es opcional; no se exige para cerrar una venta. La emisión fiscal integrada queda para una etapa posterior, sin bloquear el desarrollo del POS operativo.

Separar tres dimensiones: origen de la venta, modalidad de atención y mesa asociada. Una venta tomada y cobrada en mostrador puede consumirse en una mesa sin duplicarse. Los informes distinguirán ventas de origen mesa de consumo asociado a una mesa; no sumarán agrupaciones superpuestas.

- Mostrador: confirmar pedido y cobro antes de enviarlo a preparación según el circuito habitual.
- Mesa: abrir cuenta por visita, agregar comandas, registrar entregas parciales y cobrar al finalizar. Una cuenta representa una venta; varias comandas no inflan la cantidad de ventas.
- Delivery: registrar canal, número externo, productos, destinatario y entrega cuando corresponda, y quién cobra. PedidosYa/Uber Eats no quedan modelados únicamente como medios de pago.

Grilla de mesas editable en modo de configuración: alta, número, capacidad, posición y archivo. La vista operativa muestra ocupación, cuenta e importes pendientes. Mover una cuenta conserva su historial; una mesa con cuenta abierta no puede eliminarse.

Cada venta conserva los precios efectivos por renglón. El precio del canal es una referencia de carga; ajustes particulares no cambian la lista general ni ventas anteriores. Separar descuentos, financiador informado, cargos, comisiones y liquidación. El total pagado por el cliente y el ingreso recibido por Kybo son magnitudes diferentes. Marcar estimaciones hasta contar con la liquidación.

En la primera entrega se propone carga manual rápida de PedidosYa y Uber Eats, con control de duplicados por plataforma, tienda e identificador externo. La integración oficial se incorpora cuando exista acceso aprobado. Cualquier doble recepción —manual, API o importación de Fudo— debe vincularse o quedar para revisión, sin generar otra venta automáticamente.

## 7. Preparación, responsables y tiempos

Estaciones configurables, inicialmente caja, barra y cocina. Una persona puede cubrir varias; varias personas pueden trabajar en una. Las asignaciones pueden cambiar durante la jornada. La interfaz mantiene el mismo funcionamiento con filtros por estación y responsable, sin reglas fijas por mañana/tarde o cantidad de empleados.

Cada comanda genera tareas según sus productos. Guardar ingreso a cola, inicio, finalización y entrega, además del responsable asignado y del usuario que marca cada evento. Cambiar el responsable conserva la trazabilidad. Quien cobra no se presume responsable de preparación.

### Cola compartida en celulares

Propuesta principal: una PWA instalable con acceso individual y vista de pedidos activos para todas las personas con permiso de preparación. Los celulares muestran la misma cola y responsables; cada persona puede filtrar por estación, pendientes o tareas propias. Las tarjetas muestran número de comanda, canal/mesa, productos, variantes, observaciones, tiempo de espera y estado. Mostrar solo datos del cliente necesarios para preparar o entregar.

Tomar una tarea requiere confirmación atómica del servidor: si dos personas lo intentan a la vez, solo una queda como responsable y la otra recibe el estado actualizado. El reclamo es por tarea/estación; barra y cocina pueden trabajar en partes distintas del mismo pedido. No transfiere la cuenta de mesa ni cambia cobros. Una respuesta perdida se consulta con el mismo ID; mientras no esté confirmada, no aparentar que la tarea quedó reservada para esa persona.

Separar conceptualmente asignación e inicio efectivo para medir tiempos. Para reducir pasos, la acción principal puede ser «Empezar preparación»: asigna e inicia en una misma transacción cuando la persona realmente comienza. Si se ofrece «Tomar para después», registra asignación sin iniciar el cronómetro de preparación. Luego «Listo» y «Entregado» registran sus propios eventos. Una comanda completa queda lista cuando todas sus tareas necesarias están listas; conservar entregas parciales. Desconexiones o suspensión del celular no liberan automáticamente tareas que alguien ya está preparando; una reasignación autorizada conserva el historial.

Publicar actualizaciones solo después de confirmar el cambio en la base. El mecanismo de eventos en tiempo real se elegirá en el plan técnico según el alojamiento; incluir recuperación de estado al reconectar o volver a la app y consulta periódica de respaldo. Neon no se expone directamente a los teléfonos. Este «tomar pedido» interno no equivale a aceptar el pedido en PedidosYa/Uber Eats; la aceptación externa conserva el circuito de cada integración.

Priorizar funcionamiento con la pantalla de preparación abierta. Alertas visuales y sonido habilitado por la usuaria; notificaciones push como apoyo según dispositivo, instalación y permisos. No usar una notificación entregada como prueba de que alguien vio o aceptó el pedido. Validar Android/iPhone reales y retorno desde pantalla bloqueada antes del uso operativo. El acceso móvil a preparación no convierte el celular en un punto autorizado de fichaje.

### Comandas impresas

Francisco requiere compatibilidad con su Hasar P-HAS-181 y confirmó conexión por cable de red y una computadora de escritorio para caja. La ficha oficial declara Serial, USB, Ethernet y comandos compatibles con ESC/POS. Hay base técnica para la integración; falta validar en la instalación real el sistema operativo, dirección y puerto de red, driver cuando corresponda y comandos usados. No se presume Windows, un puerto TCP específico ni compatibilidad automática con cualquier biblioteca ESC/POS.

Recomendación: preparación digital como circuito habitual y botón «Imprimir comanda» como respaldo o necesidad puntual. Permitir configurar impresión automática por estación/canal si luego resulta útil; no imprimir cada pedido por defecto ni condicionar tomar/preparar a que haya papel. La impresión de comandas operativas es independiente de la emisión fiscal, que continúa postergada.

Para integración automática se propone un pequeño servicio en la computadora de escritorio actual: obtiene trabajos autorizados del backend por conexión saliente segura y envía a la Hasar por Ethernet, con dirección y puerto verificados. Mantener credenciales acotadas a su impresora/local y no exponer la impresora a internet. Una PWA común no dispone de TCP crudo para enviar ESC/POS por Ethernet; imprimir desde el navegador abre normalmente un diálogo. El adaptador de impresión permanece separado del POS, sin convertir la PC en servidor de toda la operación.

Preparar la interfaz del POS para interacción táctil y tamaños de tablet desde el diseño, manteniendo la PC como dispositivo inicial. En una futura migración, la tablet podría ejecutar el POS y solicitar impresión al mismo servicio mientras la PC permanezca encendida. Retirar por completo esa PC requeriría trasladar el servicio a otro equipo local o validar otra solución compatible; cambiar de pantalla no elimina esta dependencia. Antes del cambio, sincronizar pendientes, transferir el control de caja/cuentas y habilitar el nuevo dispositivo. No se asume compra de tablet ni de otro equipo ahora.

La computadora y el adaptador deben estar encendidos. Si un celular está en datos móviles, puede solicitar impresión al backend, pero la impresión espera si el adaptador del local no tiene internet o acceso a la impresora. Conservar una opción manual de impresión del documento desde caja mediante el sistema operativo, sujeta a prueba con el driver; la integración automática durante un corte total requiere además validar una ruta local entre caja y adaptador. No prometer esa ruta por la mera existencia de una PWA.

Cada trabajo conserva ID, comanda, revisión, destino y solicitante. Evitar trabajos lógicos duplicados, pero distinguir pendiente, enviado al adaptador, enviado a impresora, error y resultado físico incierto. No afirmar «impreso» solo por enviar bytes ni reintentar ciegamente después de un corte con resultado desconocido. Reimpresión explícita con marca «COPIA», número y motivo; una modificación o cancelación usa su propia revisión y aviso identificable. Antes de enviar trabajos demorados, comprobar si siguen vigentes; no imprimir al reconectar una tanda de pedidos ya terminados sin revisión. Un reintento o reimpresión nunca crea otra venta ni descuenta stock.

Validar una comanda real con cantidades, variantes, observaciones, mesa/canal, tildes y ñ; comprobar ancho, corte, falta de papel, desconexión y reimpresión sobre la PC y la conexión Ethernet existentes. Si se usa internet compartido durante un corte, comprobar que la PC conserva también acceso a la red de la impresora. Registrar la configuración validada para reinstalar el servicio sin depender de direcciones supuestas.

### Medición y efecto en stock

| Métrica | Definición |
| --- | --- |
| Espera previa | Ingreso a cola hasta inicio de preparación |
| Preparación transcurrida | Inicio hasta listo; no equivale automáticamente a tiempo exclusivo de trabajo |
| Espera de retiro | Listo hasta entrega |
| Total de atención | Ingreso hasta entrega de la comanda |

Si barra y cocina trabajan en paralelo, no sumar ambas duraciones como tiempo total del pedido. Conservar cada tarea y la línea temporal completa. Las entregas parciales y las comandas agregadas a una mesa mantienen sus propios tiempos. Eventos faltantes se muestran incompletos. No inventar un inicio para producir un tiempo de cero minutos.

Para carga manual, conservar recepción original cuando sea conocida y registro en Kybo como instantes diferentes, identificando qué dato fue declarado. Los reportes segmentan por turno, canal, productos, volumen y responsables; incluyen cantidad de observaciones. Medir rapidez no demuestra calidad ni productividad individual por sí sola.

Durante un corte, conservar hora declarada por el dispositivo, secuencia de eventos y hora de recepción posterior en el servidor. Usar duración monotónica dentro de una sesión cuando sea posible; cambios de reloj o reinicios pueden impedir reconstruir duraciones fiables. Señalar estos datos como provisionales o incompletos y distinguirlos en los reportes. La hora de sincronización no sustituye la hora del pedido ni convierte marcas locales en tiempos verificados.

Propuesta de efecto en stock, pendiente de revisión del diseño: enviar una comanda reserva los insumos o preparados de su receta; iniciar cada tarea confirma su consumo una única vez; entrega directa de un producto sin preparación confirma el consumo al entregar. Cancelar antes de consumir libera reservas. Cancelar una venta ya preparada no devuelve automáticamente ingredientes: se registra merma o una devolución física válida. Anular un cobro y corregir stock son acciones diferentes.

Cada consumo previsto tiene un identificador y una única asignación a una tarea o entrega directa. Si un producto requiere barra y cocina, repartir sus consumos explícitamente; no ejecutar la receta completa desde ambas tareas. La suma de consumos debe coincidir con lo requerido por el renglón confirmado. Reintentar una acción, cambiar responsable o reasignar una tarea no vuelve a descontar stock.

Una venta externa real se conserva aunque revele faltantes de stock, con alerta y saldo negativo trazable si corresponde. Para ventas propias con faltantes se propone confirmación por un permiso explícito; no ocultar el problema recortando el saldo a cero.

## 8. Caja y cierres

Gestionar medios de pago con nombre, estado y atributos para referencias y conciliación. Registrar pagos vinculados a ventas y egresos vinculados a compras o gastos. Una venta cobrada mediante terminal externa se registra como tal: el POS no procesa tarjetas por el solo hecho de guardar el pago.

Cada apertura y cierre tiene ID, fecha comercial, responsable y cifras esperadas y observadas por medio de pago. Conservar fondo inicial, movimientos y comprobantes. Diferenciar saldo pendiente de cobrar de venta anulada y de dinero devuelto. Las correcciones financieras mantienen sus referencias.

Propuesta: admitir cierre con diferencias explícitas y motivo, conservar una instantánea de lo conciliado y requerir autorización para corregirlo. Los conteos de stock dentro del cierre se confirman como operaciones de inventario independientes y no se vuelven a aplicar al reabrir la pantalla.

Sin conexión se pueden guardar arqueo y cierre provisional. El cierre definitivo requiere conciliar las operaciones pendientes de todos los equipos asociados a esa caja y resolver las diferencias relevantes; una cola vacía en un solo equipo no demuestra que toda la caja esté sincronizada.

## 9. Fichaje y personal

Pantalla separada: nombre → PIN → una acción principal de entrada o salida → confirmación. Solo un administrador puede habilitar y revocar puntos de fichaje. El servidor comprueba autorización del punto, PIN, permisos y estado de asistencia. La autorización es de una sesión del navegador, no una prueba infalsificable de hardware o ubicación.

El dispositivo permanece en el local, bajo control operativo y sin acceso remoto para las empleadas. PIN individual con intentos limitados; en el módulo de asistencia, el acceso desde celulares permite consultar registros propios y solicitar correcciones. Esos mismos celulares pueden tener permiso independiente de preparación, sin permiso de fichar. Compartir PIN o controlar remotamente el punto sigue siendo una limitación; GPS y red no reemplazan estos controles.

Hora oficial del servidor; múltiples tramos diarios; prevención de tramos superpuestos o doble entrada abierta. Una salida faltante queda marcada para revisión; no se cierra inventando un horario. Fichajes originales y correcciones se conservan con motivo y autorizante.

La continuidad offline del POS no habilita fichajes oficiales sin servidor. Ante un corte, guardar una solicitud de corrección con hora declarada y motivo, pendiente de revisión autorizada. Sincronizarla no la transforma automáticamente en asistencia validada ni asigna la hora de reconexión como entrada o salida.

Separar horas registradas, horario previsto por persona/fecha, diferencia y horas extras para liquidar según reglas confirmadas. No se supone un umbral universal de ocho horas ni se elimina tiempo registrado por falta de aprobación. Descansos, redondeos, trabajo nocturno y reglas de liquidación requieren definición antes de calcular importes a pagar. Hasta entonces se reporta duración registrada y diferencia respecto del horario, sin presentarlas como liquidación legal.

El fichaje no asigna automáticamente estaciones ni representa tiempo productivo de preparación. Exportación mensual de asistencia y correcciones a Excel/PDF propuesta.

## 10. Clientes, WhatsApp y fidelización

Clientes con identificación opcional en ventas, teléfono normalizado, historial y permisos de contacto. Compra y consentimiento promocional son registros distintos. No incorporar automáticamente contactos de plataformas a campañas. Conservar fecha, origen, alcance y baja del consentimiento.

Primera capacidad propuesta para proveedores: generar pedidos por proveedor y abrir WhatsApp con el texto preparado; el usuario envía. Abrir el enlace no prueba envío ni recepción. La orden de compra conserva estado independiente.

Envíos automáticos y campañas dependen de habilitar WhatsApp Business Platform, plantillas y reglas aplicables. Diseñar segmentos por frecuencia, última visita y preferencias; beneficios con límites de uso y costo conocido. Evaluar retorno y margen después del beneficio y costo de envío. La tarjeta de fidelización digital es una propuesta; aún no hay reglas de premios nuevas aprobadas.

## 11. Reportes y recomendaciones

- Caja: cobros y pagos por fecha, medio y canal, con liquidaciones pendientes.
- Resultado: ventas netas, costo histórico vendido, gastos y comisiones; señalar costos incompletos y supuestos.
- Productos: unidades, facturación, contribución y ranking dentro de períodos comparables; distinguir productos disponibles de productos sin exposición o sin stock.
- Inventario: consumos por venta/producción, mermas, diferencias de conteo y cobertura estimada.
- Operación: tiempos por comanda, estación, responsable, franja y carga de trabajo; separar retiro de preparación.
- Clientes: frecuencia, retorno, ticket y beneficio utilizado, solo para ventas identificadas.

Las compras de mercadería no se descuentan completas como costo vendido del período. Las alertas iniciales son reglas explicables y muestran datos de respaldo. El módulo comercial incorpora los siguientes requisitos y propuestas; no modifica precios ni publica campañas sin una acción autorizada.

### Meta de ventas y rentabilidad

Registrar la referencia declarada de ARS 2.000.000/mes y el objetivo de ARS 5.000.000/mes, con período, días de apertura y criterio de facturación visibles. Confirmar si la referencia incluye impuestos, descuentos, devoluciones y todos los canales antes de compararla con históricos importados. El objetivo no implica fecha de cumplimiento ni pronóstico de demanda.

Descomponer ventas mensuales en cantidad de ventas × ticket promedio; por día abierto, usar días × ventas diarias × ticket. No contar comandas adicionales de la misma mesa como ventas nuevas. Para ventas identificadas, analizar además frecuencia y retorno de clientes, informando qué porcentaje está identificado. Mostrar avance mensual, brecha y proyección separada del resultado observado. Comparar también unidades, contribución y mix de canales: una suba nominal de precios no demuestra mayor consumo.

Como escenario ilustrativo, con 26 días abiertos la meta requiere ARS 192.307,69 diarios. Tickets hipotéticos de ARS 6.000, 8.000 y 10.000 requieren un promedio aproximado de 32,05, 24,04 y 19,23 ventas diarias; redondeando hacia arriba, 33, 25 y 20. No son el ticket ni el calendario confirmados de Kybo. Pasar de 2 a 5 millones equivale a +150%; subir el ticket 25% requeriría además duplicar ventas para alcanzar esa combinación, sin garantizar que la demanda lo permita.

Acompañar el objetivo con contribución total y gastos fijos vigentes. Estimar punto de equilibrio solo con costos y mezcla de ventas suficientes, con supuestos visibles; recalcular si cambia esa mezcla o la capacidad requerida. Una contribución positiva por pedido ayuda a cubrir gastos fijos, pero no equivale a beneficio neto del negocio.

### Resultado por canal y conciliación de PedidosYa

Por venta, separar precio de lista, precio efectivo, descuentos financiados por Kybo o por terceros, reintegros, devoluciones, cargos y base de cada comisión. Guardar vigencia de reglas y montos reales. No usar una tasa universal de PedidosYa ni asumir que su comisión se aplica siempre sobre el mismo importe. No convertir el precio efectivo de un pedido externo en una edición de toda la carta.

Calcular contribución del pedido desde el ingreso atribuible a Kybo menos costo histórico consumido, envases no incluidos ya en la receta y costos variables del canal/cobro; descontar cada concepto una sola vez. El ingreso ya neto de descuentos propios no vuelve a restarlos. Las promociones de terceros solo se consideran recuperadas si el acuerdo/documento lo respalda. Mostrar impuestos, retenciones y percepciones separados: su efecto en caja y su tratamiento como costo o saldo recuperable requieren clasificación validada, no se deducen todos como pérdida automáticamente.

Importar o cargar liquidaciones, facturas de cargos, ajustes y pedidos del período, conservando documentos y referencias externas. Conciliar saldo anterior, operaciones del período, cobros directos al comercio, cargos/ajustes, transferencias recibidas y saldo pendiente. Una liquidación puede reunir varios pedidos y correcciones de otros períodos. Distinguir fecha de venta y liquidación; prevenir duplicación al reimportar. La transferencia bancaria no es por sí sola ingreso económico ni ganancia, y un saldo pendiente no es necesariamente una pérdida.

Vista propuesta por canal: facturación, descuentos a cargo de Kybo, comisiones/cargos, costo de mercadería y envases, contribución, importe liquidado y diferencia pendiente. Indicar conciliado, estimado o incompleto. Los cargos compartidos se asignan a productos con una regla explícita y sin alterar su total; los gastos no atribuibles permanecen a nivel canal/período. La suma por productos debe coincidir con el resultado del pedido. Mostrar costo efectivo del canal con denominador definido, separado de la tasa contractual de comisión.

La primera versión debe permitir carga/importación revisable aunque no exista API de liquidaciones habilitada. Si solo hay resúmenes, mostrar análisis agregado y limitar las conclusiones por producto; no inventar detalle ni afirmar cuánto pierde Kybo sin datos conciliados. Empezar con un período completo reciente y luego ampliar para detectar recurrencia.

#### Muestra de PedidosYa aportada por Francisco

Fuente inicial: tabla pegada en esta conversación, con 13 pedidos de Kybo del 07/09/2026 al 12/09/2026 inclusive. Posteriormente Francisco aportó dos facturas del período 07–13/09/2026, cuyo cruce se detalla debajo. El primer cálculo siguiente conserva el subtotal de comisión y Plus anterior al IVA y al cargo de la segunda factura; no constituye conciliación bancaria o beneficio neto.

| Concepto observado | Resultado |
| --- | ---: |
| Ventas brutas y columna «Monto de Venta Neta» | ARS 170.600,00 |
| Servicio Ventas PedidosYa, 23% en cada pedido | ARS 39.238,00 |
| Cargo por Pedidos con Plus, 5 pedidos | ARS 6.337,17 |
| Subtotal comisión + Plus, sin IVA ni segunda factura | ARS 45.575,17; 26,71% del bruto |
| Remanente parcial antes de IVA y segunda factura | ARS 125.024,83 |
| Ticket promedio, 13 pedidos | ARS 13.123,08 |

En las filas aportadas, todos los descuentos, cupones, envío a cargo del local y cobros realizados por el local son cero; todos los pagos figuran cobrados por PedidosYa. La columna «Monto de Venta Neta» sigue siendo anterior a la comisión y Plus, por lo que no debe mapearse como depósito neto ni ganancia. No se extrapola esta semana al canal completo ni al local.

Los 5 pedidos con Plus suman ARS 65.500,00 y ARS 21.402,17 en comisión más Plus: incidencia ponderada 32,68%. En los otros 8, la incidencia informada es 23%. Tres pedidos Plus de ARS 8.500,00 dejan ARS 5.342,36 cada uno, frente a ARS 6.545,00 sin Plus para ese mismo importe. El pedido 2280061098 de ARS 7.500,00 registra comisión ARS 1.725,00 y Plus ARS 1.526,61: quedan ARS 4.248,39, con incidencia 43,35%, antes de otros conceptos y costos.

Guardar el cargo Plus real por pedido: cuatro cargos son ARS 1.202,64 y uno ARS 1.526,61. La diferencia requiere explicación documental, no prueba por sí sola un error ni permite inferir tarifa fija o regla general. A partir de esta muestra, el importador debe conservar IDs como texto, fechas día/mes/año, decimales con coma y porcentajes; validar unicidad por origen/sucursal/ID y la conciliación de totales. Estos totales sirven como caso de referencia del importador, sin convertir la muestra en ventas nuevas del POS.

#### Cruce con las dos facturas recibidas

Documentos aportados: `20260907_20260913_factura_394237.pdf` y `20260907_20260913_factura_394237_1.pdf`. Ambos tienen fecha de emisión 14/09/2026 y período facturado 07–13/09/2026. Son dos facturas diferentes, emitidas por entidades distintas. Cada PDF contiene original y duplicado de su factura: no son cuatro cargos.

| Documento | Neto gravado | IVA 21% | Total facturado |
| --- | ---: | ---: | ---: |
| Delivery Hero E-Commerce S.A., 0026-02840641 | ARS 45.575,17 | ARS 9.570,79 | ARS 55.145,96 |
| Delivery Hero Financial Services S.A. (Pagos Ya), 0013-02757733 | ARS 5.420,15 | ARS 1.138,23 | ARS 6.558,38 |
| Total, contando cada factura una vez | ARS 50.995,32 | ARS 10.709,02 | ARS 61.704,34 |

El neto de la primera factura coincide exactamente con ARS 39.238,00 de comisión más ARS 6.337,17 de Plus. La factura respalda ese gasto y agrega su IVA; no crea otra comisión ni otro Plus a sumar. La segunda factura describe genéricamente «SERVICIOS PEDIDOSYA (Kybo)»: registrar emisor e importe y dejar pendiente su clasificación específica/base contractual. No inferir una tasa universal de procesamiento de pagos ni repartirla por pedido como dato real sin respaldo.

Frente a las ventas informadas de ARS 170.600,00, las facturas totalizan 36,1690% con IVA. Restarlas arroja ARS 108.895,66 antes de mercadería, envases y demás partidas, si corresponden íntegramente a esas ventas. Es un remanente aritmético sujeto al alcance del período y a la liquidación; no un depósito confirmado ni ganancia. Respecto del primer cruce faltaban ARS 16.129,17: IVA de la primera factura más la segunda factura completa. No extrapolar el porcentaje de esta muestra a todo mes ni usarlo como regla de precios.

Las dos facturas consignan al receptor como Responsable Monotributo. Para el escenario de costos del período, si esa condición se confirma y no hay una excepción aplicable, considerar el IVA soportado como costo: su discriminación no lo vuelve recuperable automáticamente. Conservar neto e IVA separados y la clasificación fiscal validada por período. El beneficio condicionado de transición al régimen general no equivale a crédito fiscal mensual ordinario dentro del Monotributo. No inferir la condición fiscal actual de Kybo solamente a partir de estos documentos.

Invariantes adicionales de importación: identificar comprobantes por emisor, tipo, punto de venta y número; reconocer páginas original/duplicado; vincular el detalle de pedidos con la factura y la liquidación sin duplicar gasto. «Otros tributos» figura en cero en ambos PDFs, lo cual no demuestra ausencia de otras deducciones o retenciones en el estado de cuenta.

Siguiente evidencia para cerrar margen y conciliación: costos y variantes de los productos identificados debajo, composición de los demás pedidos y estado de cuenta con acreditaciones/ajustes. Las facturas de servicios ya están recibidas; no volver a solicitarlas. Conservar diferenciados cargos facturados confirmados, distribución por pedido estimada y rentabilidad pendiente.

#### Productos y comparación con mostrador

Francisco identificó el pedido 2280061098, de ARS 7.500 y con Plus, como un Taro Iced Latte; informa precio de mostrador ARS 7.000. Identificó el pedido de ARS 17.500, número 2280048924 en la tabla y sin Plus, como un Kybo Shake de ARS 8.000 y un Dúo Waffle de ARS 9.500; informa precios de mostrador ARS 7.500 y ARS 8.500, respectivamente. Estos precios de mostrador son referencias aportadas ahora; no demuestran por sí solos vigencia histórica ni igualdad de variantes/porciones.

El cálculo siguiente aplica 23% de comisión y el IVA 21% de la factura a comisión más Plus. En Taro se usa el cargo Plus observado de ARS 1.526,61 antes de IVA. El IVA por renglón es una distribución calculada, redondeada a centavos; la factura lo documenta agregado. Todavía no se distribuye el cargo Financial Services de ARS 6.558,38 entre pedidos.

| Producto | Mostrador informado | Precio PedidosYa observado | Recargo sobre mostrador | Remanente tras comisión, Plus e IVA |
| --- | ---: | ---: | ---: | ---: |
| Taro Iced Latte, pedido con Plus | ARS 7.000,00 | ARS 7.500,00 | 7,14% | ARS 3.565,55 |
| Kybo Shake, pedido sin Plus | ARS 7.500,00 | ARS 8.000,00 | 6,67% | ARS 5.773,60 |
| Dúo Waffle, pedido sin Plus | ARS 8.500,00 | ARS 9.500,00 | 11,76% | ARS 6.856,15 |

El pedido de ARS 17.500 deja ARS 12.629,75 tras esos cargos, frente a ARS 16.000 brutos de mostrador para los dos productos: diferencia ARS 3.370,25 antes de comparar costos de ambos canales. Los remanentes no son ganancia: faltan insumos, envases, otros costos y la segunda factura. El mostrador también puede tener costos de cobro; no se presume que sus precios sean ingreso neto ni que una venta delivery sustituya una venta presencial.

Como referencia matemática parcial para igualar el precio bruto de mostrador después de estos cargos: P_delivery = (P_mostrador + Plus_neto × 1,21) / (1 − 0,23 × 1,21). Supone iguales bases de comisión y un cargo Plus constante en el escenario, algo que no se ha confirmado para nuevos precios. Resultados: Taro ARS 12.258,83 con ese Plus o ARS 9.699,32 sin Plus; Kybo Shake ARS 10.392,13 sin Plus; Dúo Waffle ARS 11.777,75 sin Plus. Son escenarios parciales, no precios óptimos ni listas aprobadas. No incluyen Financial Services, diferencias de envases ni costos de cobro de mostrador; no equivalen a igualar ganancias. La decisión final requiere costos vigentes, regla Plus/Financial Services, demanda y condiciones del canal.

El sistema debe mostrar por separado recargo de precio, incidencia de cargos e ingreso después de cargos. Para recomendar cambios, calcular contribución absoluta y cantidad necesaria para sostenerla; evitar tanto presentar toda diferencia con mostrador como pérdida como asumir que un pedido rentable después de costos variables cubre los gastos fijos. Una receta o costo inicial de ejemplo no se usa como costo real sin validación.

La revisión acotada del catálogo inicial del sitio no encontró una receta exacta llamada Taro Iced Latte; la fórmula aportada después por Francisco se registra debajo, sin sustituirla por Kybo Shake Taro ni por Coffee Iced Latte. En Shake y Dúo todavía se requieren sabor o combinación vendidos y costos confirmados; las recetas del seed siguen siendo referencias de ejemplo.

#### Receta confirmada de Taro Iced Latte y costo parcial

Francisco informó el 24/09/2026 la siguiente receta por vaso y un precio de ARS 54.208 por kilogramo de taro. El precio informado sirve como costo actual de referencia; no acredita el costo histórico exacto del pedido del 12/09 ni su tratamiento tributario o flete.

| Componente | Cantidad por vaso | Costo confirmado o dato pendiente |
| --- | ---: | --- |
| Leche | 300 ml | Precio vigente por litro pendiente |
| Taro en polvo | 30 g | ARS 1.626,24 = 54.208 × 30 / 1.000 |
| Explosivas o tapioca | 50 g de una alternativa | Costos separados según variante; no sumar ambas |
| Hielo | Cantidad no informada | Cantidad y costo pendientes |

También faltan costos de vaso/tapa y demás materiales realmente usados en cada canal. Para explosivas, pedir presentación, precio y cantidad utilizable si difiere del peso total del envase. Para tapioca, confirmar que los 50 g corresponden a preparación lista para servir y calcular desde su costo de producción y rendimiento; no aplicar directamente el precio del kilo seco a gramos cocidos. Aún no se identificó cuál de las dos alternativas llevó el pedido analizado.

Con el escenario de cargos ya calculado para ese pedido, ARS 3.565,55 menos ARS 1.626,24 de taro dejan ARS 1.939,31 para leche, perlas, hielo, materiales, Financial Services y otros costos. Es un remanente parcial usando el precio actual informado, no ganancia ni margen histórico cerrado. No usar precios iniciales de ejemplo para completar lo que falta. La leche aporta 0,3 × precio por litro; las perlas, 0,05 × costo por kilo utilizable de la variante, con la conversión específica del preparado cuando corresponda.

### Recomendaciones de precios

Comparar precio y contribución actuales por canal con escenarios de subida, mantenimiento, baja temporal o combo. Usar costo de reposición vigente para decisiones futuras y conservar costos históricos para analizar ventas pasadas. Incluir envases, reglas de comisiones, promociones, otros costos variables y restricciones comerciales conocidas. Si faltan costos o reglas relevantes, solicitar esos datos y marcar simulaciones incompletas; no ofrecer un precio mínimo «seguro» basado en ceros.

Cada recomendación muestra producto/canal, motivo, período analizado, precio actual y propuesto, margen por unidad, volumen necesario para sostener contribución, datos faltantes y una prueba sugerida. Si la contribución unitaria pasa de m_actual a m_propuesta, el volumen necesario para mantener la contribución es Q_actual × m_actual / m_propuesta, solo cuando ambos márgenes sean positivos y las demás condiciones permanezcan constantes. Esto es un umbral económico, no una predicción de ventas. Margen propuesto no positivo exige reformular o una excepción explícita, sin presentar mayor volumen como solución automática.

No inferir que un producto caro venderá más barato sin evidencia. Separar efecto de precio de disponibilidad, horarios, estacionalidad, publicidad, cambios de receta y canal. Comenzar con reglas y escenarios; cuando haya historial comparable suficiente, proponer pruebas acotadas con fecha, cupo y criterio de éxito. No inventar elasticidad ni una certeza estadística. El análisis numérico es determinista y auditable; una explicación asistida por IA no reemplaza sus cálculos.

Aprobar una propuesta genera un cambio versionado con autor, vigencia y canales seleccionados. Simular no cambia precios. Detener o revertir una prueba genera otra versión, sin reescribir ventas históricas. En plataformas externas, preparar la acción o exportación; actualizar su carta solo si la integración y permisos están habilitados. No asumir igualdad de precios entre local y delivery ni autorizar cambios contrarios a condiciones contractuales no verificadas.

### Promociones, ticket promedio y consumo recurrente

Proponer complementos y combos a partir de recetas, compras conjuntas y margen: por ejemplo, sumar una bebida a un waffle cuando haya stock y contribuya al resultado. Otras pruebas posibles son beneficios en franjas con baja demanda y retorno de clientes con consentimiento. Son hipótesis para medir, no campañas ya aprobadas. El precio final y el beneficio deben quedar claros antes de confirmar la venta.

Para excedentes próximos a vencer, vincular insumo/lote con productos que realmente lo consumen y limitar cantidades por todos los ingredientes necesarios, reservas y capacidad de preparación. Mostrar fecha límite, cantidad aprovechable, descuento propuesto, contribución después del descuento y unidades adicionales requeridas. La promoción termina al alcanzar cupo o fecha, o cuando deja de haber stock apto; no acumular descuentos incompatibles. Un precio promocional que no cubra la mercadería y los costos variables solo puede presentarse como recuperación excepcional explícita: mostrar contribución negativa y recuperación frente al descarte, distinguiendo costos ya incurridos de desembolsos adicionales. No presentarlo como margen saludable. Los productos vencidos o ya descartados nunca se recuperan mediante promociones.

También recomendar reducir compras o producción cuando el historial muestre exceso repetido; los descuentos no son la única respuesta a la merma. Presupuestar campañas con fecha, canal, público elegible, cupo, gasto máximo y margen mínimo configurados. Medir ventas, ticket, contribución después de descuentos/publicidad/mensajes, recurrencia y merma real. Distinguir resultados observados de incremento atribuible: usar comparación comparable o grupo de control cuando sea viable, y considerar ventas que igual se habrían realizado. No sumar «merma evitada» estimada como ganancia adicional si su beneficio ya está reflejado en ventas y costos.

Cada propuesta conserva evidencia, decisión (pendiente/aprobada/rechazada/expirada), responsable y resultado. Los beneficios canjeados se registran una sola vez por operación. El permiso de preparación de las empleadas no habilita cambiar listas ni lanzar campañas. Los límites de cupos y vigencia deben mantenerse también en el POS: offline solo aplicar promociones prehabilitadas con saldo de cupo asignado al dispositivo y condiciones comprobables; si no puede garantizarse vigencia o stock apto, no confirmar ese beneficio localmente.

## 12. Etapas propuestas y condiciones de salida

| Etapa | Entrega verificable |
| --- | --- |
| A. Base operativa | Autenticación, permisos, esquema, catálogos y migración ensayada; compras, producción, lotes/vencimientos y movimientos consistentes |
| B. Primera versión integral | POS propio, continuidad offline, mesas, delivery manual, PWA de preparación, impresión Hasar, tiempos, caja y fichaje; margen por canal, carga revisable de liquidaciones, meta comercial, alertas de vencimiento y simulación básica de precios/promociones |
| C. Reducción de carga manual | Lectura asistida de comprobantes, sincronización externa según acceso, pedidos por WhatsApp y automatización de conciliaciones |
| D. Fidelización y optimización | Ejecución de campañas habilitadas, pruebas comerciales, beneficios definidos y medición de retorno; recomendaciones refinadas con históricos suficientes |

Las etapas son orden de desarrollo; no autorización para omitir los módulos solicitados. La primera versión funcional de ventas incluye operación propia; no se entrega únicamente un simulador dependiente de Fudo. Cada bloque tendrá especificación de detalle y plan acotado antes de implementarse.

La emisión de comprobantes fiscales se incorpora como evolución posterior sin prioridad ni fecha comprometidas, según la decisión de Francisco. La lectura asistida de comprobantes de compra continúa en la etapa C.

Antes de retirar Fudo: validar importación y saldos iniciales, comparar cierres y stock, probar anulaciones y recuperación de errores, acordar fecha de corte, capacitación y procedimiento de contingencia. Revisar las necesidades de impresión operativa que hoy cubra Fudo. El alcance inicial del reemplazo es operativo; la emisión fiscal integrada queda expresamente diferida.

## 13. Decisiones que aún requieren revisión

Estas decisiones no están confirmadas y no se resolverán silenciosamente en implementación:

| Decisión | Base propuesta o siguiente definición |
| --- | --- |
| Continuidad entre equipos | Francisco propone datos móviles para los celulares. Base recomendada: cola central y compartir conexión con caja; contingencia local de caja ante corte total, sin servidor LAN de pedidos en la primera entrega. Revisar esta delimitación y la conectividad del adaptador de impresión |
| Autorización offline | Definir capacidades, vigencia y desbloqueo tras reinicio o vencimiento; conservar pendientes y considerar que la revocación remota requiere reconexión |
| Configuración de equipos | Confirmados PC de escritorio para caja y Hasar P-HAS-181 por Ethernet; tablet futura. Relevar sistema operativo, dirección/puerto de impresora, punto de fichaje y teléfonos Android/iPhone durante el diseño técnico y puesta en marcha; probar impresión y acceso a la LAN usando conexión de respaldo |
| Permisos y caja | Revisar matriz por capacidad, faltantes de stock, descuentos, pagos parciales/combinados, propinas, devoluciones y apertura/cierre |
| Horas adicionales | Definir horarios de referencia, pausas, cruces de medianoche y reglas de cálculo/revisión antes de liquidar |
| Base comercial y límites | Confirmar período y criterio de los ARS 2 millones declarados, días abiertos, costos vigentes, documentos PedidosYa y tratamiento de cargos; definir márgenes mínimos, presupuesto y aprobación de campañas. Meta declarada: ARS 5 millones/mes, sin plazo comprometido |

El diseño del dominio debe admitir estos escenarios sin afirmar que todas las variantes se incluyen en la primera entrega. La siguiente revisión requiere validar la base económica del canal PedidosYa y los límites comerciales. Los detalles de equipos se relevan durante el diseño técnico. La emisión fiscal ya no es una decisión pendiente: se implementará después.

## 14. Criterios de aceptación del sistema

1. Una compra recibida genera ingreso de stock y costo una sola vez, conserva fecha, proveedor, documento y presentación, y distingue sus pagos.
2. Un lote de tapioca o tapas descuenta materias primas y suma producción real en una misma transacción; vender el preparado no duplica el consumo de materias primas.
3. Ventas, recetas, costos y precios históricos no se alteran al editar el catálogo actual.
4. Mostrador, cuentas de mesa y delivery pueden operar con datos propios; registros externos y manuales duplicados se detectan.
5. Una comanda con barra y cocina conserva responsables y tiempos independientes; la cantidad de personas por horario es libre.
6. Preparación, entrega, cobro y liquidación son estados diferenciados; una cancelación no restaura ingredientes automáticamente.
7. El servidor rechaza fichajes desde sesiones no autorizadas como punto de fichaje, aunque el PIN sea correcto. Las correcciones conservan la marca original.
8. Cierres diarios y turnos permanecen consultables, con diferencias y correcciones trazables.
9. Reconocimiento de comprobantes crea borradores revisables; nunca publica stock por una extracción sin confirmar.
10. Los reportes separan caja de resultados y señalan datos pendientes. No se presentan indicadores de ejemplo como reales.
11. En un dispositivo habilitado, cortar internet permite registrar una venta y recuperarla después de reabrir la aplicación. Al reconectar, reintentos y respuestas perdidas no duplican venta, cobro ni consumo. Un error de escritura local no se presenta como guardado exitoso.
12. Una cuenta con control offline no puede ser modificada por otro equipo sin transferencia confirmada. Las diferencias de stock, precios o permisos quedan trazables y revisables; una venta efectuada no desaparece silenciosamente al sincronizar.
13. Caja y reportes indican operaciones pendientes. El cierre definitivo comprueba todos los dispositivos asociados; el fichaje desconectado permanece como solicitud revisable y los tiempos locales mantienen su calidad declarada.
14. Dos celulares ven la cola compartida; intentar tomar la misma tarea simultáneamente asigna un único responsable. Cambiar de Wi-Fi a datos y regresar a la app recupera el estado vigente sin duplicar eventos. Barra y cocina pueden tomar tareas distintas del mismo pedido.
15. Asignarse para después no inicia preparación; empezar explícitamente sí. El celular que prepara no puede fichar por ese solo permiso. Caja offline no reasigna tareas que publicó y pueden estar avanzando en celulares conectados.
16. Una comanda de prueba se imprime correctamente en la Hasar real. Fallas de impresión no bloquean preparación digital; resultado físico incierto, revisiones y reimpresiones quedan identificados sin duplicar ventas ni movimientos de stock.
17. La conciliación de PedidosYa explica ventas, cobros directos, cargos, transferencias y saldos; reimportar no duplica operaciones. Distingue descuento propio/tercero y retención/costo, con datos incompletos visibles y sin doble descuento.
18. Simular precios no cambia listas. Una propuesta muestra margen, supuestos y volumen de equilibrio, sin prometer demanda; aplicar requiere permiso y conserva versiones por canal. Los costos desconocidos impiden recomendaciones concluyentes de rentabilidad.
19. Las promociones por vencimiento solo usan lotes aptos y stock remanente; respetan cupo, vigencia y compatibilidad de descuentos bajo concurrencia. Vencidos, bloqueados y mermas registradas no cuentan como disponibles.
20. El tablero distingue referencia declarada de ARS 2 millones, objetivo de ARS 5 millones, resultados observados y escenarios. Mide contribución y recurrencia además del ticket; no presenta atribución de campaña o merma evitada estimada como beneficio demostrado.

Verificación propuesta: pruebas de dominio para conversiones, recetas, costos y transacciones; pruebas de concurrencia y reintentos; recorridos de venta/producción/cierre/fichaje y revisión visual en los dispositivos del local. Para offline: cortes antes y después de confirmar en servidor, reapertura con cola pendiente, actualizaciones con datos pendientes, falta de almacenamiento, reloj alterado, autorización vencida y conflicto entre equipos. Para móviles/impresión: toma simultánea, suspensión y cambio de red, caja desconectada con celulares online, pérdida de respuesta de impresión y revisión de trabajos obsoletos. Backups y restauración se comprobarán antes del cambio operativo.

## 15. Fuentes y límites de las integraciones

Revisadas durante el análisis del 24/09/2026. Describen capacidades generales; no confirman credenciales ni habilitación de la cuenta de Kybo.

- Fudo: [API pública y acceso](https://soporte.fu.do/es/articles/11939789-api-publica-de-proposito-general) y [especificación OpenAPI](https://api.fu.do/v1alpha1/openapi.yml). La API general incluye lectura y operaciones de creación; el uso concreto depende de permisos y pruebas. La activación general requiere Plan Pro según la ayuda revisada.
- PedidosYa: [integración oficial](https://integrar.pedidosya.com/es/documentation/). La modalidad indirecta transmite pedidos aceptados desde la app de la plataforma; el acceso requiere aprobación y pruebas. La [información oficial para socios de Argentina](https://socios.pedidosya.com.ar/es) remite a Finanzas del Partner Portal para estados de cuenta y pagos; las condiciones reales de Kybo deben obtenerse de su contrato y liquidaciones.
- Uber Eats: [requisitos Marketplace](https://developer.uber.com/docs/eats/guides/getting-started) y [detalle del pedido](https://developer.uber.com/docs/eats/references/api/v2/get-eats-order-orderid). Hay información de precios por pedido; acceso productivo sujeto a aprobación.
- WhatsApp: [política de mensajería](https://whatsappbusiness.com/policy/) y [precios de plataforma](https://whatsappbusiness.com/products/platform-pricing/). Considerar consentimiento, plantillas, bajas y costos antes de campañas.
- Lectura de comprobantes: [visión](https://developers.openai.com/api/docs/guides/images-vision) y [salidas estructuradas](https://developers.openai.com/api/docs/guides/structured-outputs). El formato estructurado no elimina errores de reconocimiento.
- Operación web offline: MDN sobre [service workers](https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API/Using_Service_Workers), [IndexedDB](https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API/Using_IndexedDB) y [persistencia y límites del almacenamiento](https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria). Sustentan las capacidades del navegador; la sincronización y conciliación propuestas son decisiones de diseño de Kybo.
- Impresora: [ficha oficial Hasar P-HAS-181](https://compania.grupohasar.com/producto/p-has-181/), con interfaces y compatibilidad ESC/POS. La ficha no sustituye la prueba sobre la unidad instalada.
- Comunicación e impresión web: Chrome sobre [Direct Sockets e IWAs](https://developer.chrome.com/docs/iwa/direct-sockets) y [Web Serial](https://developer.chrome.com/docs/capabilities/serial); MDN sobre [diálogo de impresión](https://developer.mozilla.org/en-US/docs/Web/API/Window/print). El servicio local propuesto es una decisión de arquitectura de Kybo.
- Notificaciones móviles: Apple sobre [Web Push en aplicaciones web](https://developer.apple.com/documentation/usernotifications/sending-web-push-notifications-in-web-apps-and-browsers). Requiere validar instalación, permisos y comportamiento en los dispositivos del personal.
- Rentabilidad: SBA sobre [punto de equilibrio y costos variables/fijos](https://www.sba.gov/counseling/plan-your-business/). Se utiliza como referencia conceptual; los escenarios y metas de Kybo requieren sus datos reales y no son garantías de ventas.
- Vencimientos: ANMAT sobre [uso de alimentos antes del vencimiento](https://www.argentina.gob.ar/anmat/comunidad/enfermedades-transmitidas-por-alimentos). Las promociones no habilitan usar alimentos vencidos ni extender su vida útil.
- Tratamiento del IVA: [Ley 24.977, artículo 24 del régimen, Biblioteca ARCA](https://biblioteca.afip.gob.ar/dcp/LEY_C_024977_1998_06_03) y [beneficios condicionados de pasaje al régimen general](https://www.arca.gob.ar/monotributo/ayuda/pasaje-al-regimen-general.asp). Aplicar según condición fiscal del período y validación correspondiente; no confundir IVA discriminado con crédito recuperable automático.

Siguiente paso de Superpowers: revisar esta especificación y resolver las decisiones que afectan la primera entrega. Después de aprobar el documento se elaborará el plan de implementación; todavía no se creó código de producto ni se desplegaron cambios.
