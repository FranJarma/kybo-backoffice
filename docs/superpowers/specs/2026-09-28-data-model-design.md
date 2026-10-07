# Modelo de artículos, inventario y operación de Kybo

Fecha: 2026-09-28
Estado: diseño aprobado por el usuario; plan de implementación preparado en
`../plans/2026-09-28-data-model.md`, pendiente de revisión y método de ejecución.
No implementado ni aplicado a una base. Aprobar el diseño no autoriza migraciones.

## 1. Objetivo y acuerdos

Construir un modelo coherente antes de reorganizar navegación. El negocio necesita
ingredientes, preparaciones, envases, materiales de uso interno y mercancía comprada
para revender, con varias sucursales y varias ubicaciones por sucursal.

Flujo acordado: reservar al confirmar el pedido; consumir al terminar la preparación;
entregar no vuelve a consumir. Cancelar exige distinguir material sin usar, consumido
y perdido. Los artículos de reventa salen al entregarse. Producir para almacenar
registra consumo y entrada del preparado al finalizar el lote.

Se propone un negocio con catálogo compartido y precios actuales por canal. Empresas
independientes, contabilidad fiscal, ventas offline y precios propios por sucursal
quedan fuera de esta primera evolución. Son límites propuestos, no necesidades
descartadas del negocio. El diseño no impone que todas las sucursales habiliten los
mismos productos.

No ejecutar migraciones, commits ni push. Conservar `.env`, cambios locales y todos
los identificadores e históricos existentes. La navegación/Breadcrumb queda pausada.

## 2. Decisión de arquitectura

Adoptar **un catálogo de artículos físicos** separado de **productos comerciales**.
No crear inventarios independientes para ingredientes, envases y limpieza. Tampoco
resolver el problema con el mero renombrado de `ingredients` a `supplies`.

| Concepto | Representa | Ejemplo |
| --- | --- | --- |
| Artículo (`items`) | Algo físico que se almacena o consume | Leche, tapioca cocida, vaso, detergente, botella |
| Producto (`products`) | Una oferta comercial | Té con leche grande, agua individual, pack de seis aguas |
| Receta | Composición versionada para venta o elaboración | Té por unidad; lote de tapioca |
| Presentación de compra | Proveedor, artículo y conversión | Caja de 24 botellas |
| Lote | Origen y trazabilidad de un artículo | Partida recibida o elaborada |
| Ubicación | Lugar al que pertenece una cantidad | Depósito o barra de una sucursal |

Una botella comprada y vendida comparte artículo; un pack consume seis unidades de
ese artículo. La leche se crea una sola vez aunque haya existencias en cinco locales.
Un preparado puede comprarse y producirse: naturaleza, abastecimiento y venta son
dimensiones diferentes. No usar un enum exclusivo `comprado/producido/vendido`.

## 3. Catálogos y unidades

### Artículos

`items`: UUID estable, código interno único, nombre, clase, unidad base, costo de
referencia opcional, habilitación para compra y composición, revisión y archivo.

- Clases iniciales: `food`, `beverage`, `packaging`, `cleaning`, `other` y
  `unclassified` exclusivamente para transición de registros existentes.
- Elaboración se expresa mediante la receta de salida; venta mediante un producto
  relacionado. Evitar banderas duplicadas que contradigan estas relaciones.
- Envases pueden integrar composiciones; limpieza no puede integrar recetas
  gastronómicas. `other` requiere habilitación explícita y auditada para composición.
- No decidir la clase de un registro histórico a partir del nombre.
- El archivo impide nuevas asignaciones; mantiene referencias y operaciones
  comprometidas. La resolución de reservas existentes no puede quedar bloqueada
  simplemente porque alguien archivó la ficha.
- No eliminar una identidad que tenga historial. Código único como identificación;
  nombre normalizado con advertencia de posible duplicado, sin confundir marcas o
  calidades distintas por compartir nombre.

Conservar `g`, `ml` y `unit` como unidades base iniciales. Las cantidades de compra
se convierten mediante factores explícitos y positivos; kg/l pueden presentarse
como unidades de entrada compatibles. No convertir masa en volumen automáticamente.
La unidad base no se cambia una vez usada en recetas, lotes o movimientos.

Usar decimales exactos y las utilidades actuales de enteros escalados; nunca float
para saldos o importes. Cantidades con seis decimales, precisión monetaria compatible
con el esquema actual y redondeo documentado en los límites de cada operación.

### Productos y suministro de la venta

Conservar `products` y precios por canal. Agregar versiones de suministro comercial
(`product_fulfillment_versions`) con producto, número de versión y modo:

- `direct`: artículo y cantidad positiva por unidad vendida.
- `recipe`: versión de receta que corresponde a ese producto.

Una restricción exige exactamente los campos del modo elegido. La selección de
versión vigente se publica atómicamente y su pertenencia al producto se garantiza
por clave compuesta. Una venta conserva la versión y composición efectivamente
confirmadas, no resuelve nuevamente el catálogo cuando cocina termina.

Las recetas de producto existentes continúan siendo su composición; las recetas
de preparación apuntan al artículo producido. La publicación de una nueva receta
de venta publica en la misma transacción la versión de suministro correspondiente.
Los productos sin definición suficiente permanecen pendientes de configuración y
no pueden confirmar nuevas ventas con inventario activo hasta completarla.

`branch_products` define producto habilitado por sucursal. Los precios por canal
siguen compartidos en esta etapa; un precio ausente no equivale a cero ni hereda
silenciosamente otro canal. La versión histórica conserva el precio usado.

### Presentaciones

`purchase_presentations` referencia `item_id`, proveedor y cantidad base por
presentación. Conservar instantáneas de nombre, unidad y factor en cada recepción.
Modificar una presentación no altera compras anteriores. La pertenencia al artículo
y proveedor de la compra se valida bajo bloqueo y, cuando se almacenan las claves
redundantes, con referencias compuestas.

## 4. Sucursales, ubicaciones y permisos

`branches`: UUID, código único, nombre, zona horaria, revisión y estado.
`locations`: UUID, sucursal, código único dentro de la sucursal, nombre y estado.
La fecha comercial y vencimientos se evalúan según la sucursal; abandonar el supuesto
global de Salta conservando las fechas comerciales ya registradas.

`branch_memberships`: usuario, sucursal y rol operativo. Mantener administrador
global explícito y deshabilitación global; manager/staff se autorizan por sucursal.
Una persona puede pertenecer a varias. Catálogos compartidos se administran mediante
un permiso global independiente, sin otorgarlo a todos los encargados por inferencia.

Todas las consultas, mutaciones, reintentos y reportes comprueban el alcance del
actor en servidor. La sucursal seleccionada en pantalla es contexto, no autorización.
Aplicar claves compuestas para impedir que una venta de A use mesa/estación de B.
Mesas y estaciones tienen unicidad local, no global.

Las rutas de preparación pasan a producto-sucursal-estación. Cada estación define
la ubicación de consumo; cada sucursal define la de despacho de reventa. Si falta
stock ahí, informar faltante y requerir traslado: no tomarlo ocultamente de otra
ubicación o sucursal. Producción elige ubicaciones autorizadas de consumo y salida.

### Extensibilidad obligatoria desde la primera sucursal

Requisito confirmado: abrir otra sucursal debe ser una operación de configuración,
sin duplicar artículos/productos ni rediseñar las tablas de inventario. Poder operar
inicialmente con una sola no habilita supuestos de sucursal única en los servicios.

- Alcance explícito: los documentos operativos pertenecen a una sucursal y sus
  líneas heredan ese alcance por relaciones verificables. No usar `branch_id = null`
  como comodín que unas veces significa global y otras significa sucursal inicial.
  Datos compartidos y datos operativos tienen responsabilidades distintas.
- El contexto de una petición identifica la sucursal y se valida contra membresías.
  No depender de una variable global mutable de «sucursal activa» que mezcle sesiones.
  Una operación ya creada conserva su sucursal aunque el usuario cambie de contexto.
- Claves de caché, paginación, trabajos diferidos e idempotencia incluyen el ámbito
  pertinente. Si llegan a incorporarse procesos en segundo plano, reciben sucursal
  y origen explícitos; no deducen el contexto del usuario que esté conectado.
- Índices operativos contemplan sucursal/ubicación junto con fecha, estado o artículo
  según la consulta. Los informes consolidados agregan sólo sucursales autorizadas
  y cuentan tránsito una única vez, separado del disponible local.
- Alta de sucursal: crear ubicaciones, asignar usuarios y habilitar productos/rutas
  de preparación. Empieza sin existencias; se abastece mediante recepciones, saldos
  iniciales auditados o transferencias. No copia el stock de la sucursal anterior.
- Baja/archivo: preservar historial y resolver saldos, reservas, trabajo en proceso
  y transferencias pendientes antes de cerrar operativamente una ubicación/sucursal.
- La ampliación futura de precios por sucursal debe poder agregarse con relaciones
  comerciales propias, sin duplicar productos ni cambiar claves de stock. No se
  implementa una tabla genérica de configuraciones ni herencia implícita de precios.

Esta extensibilidad cubre locales del mismo negocio. Aislamiento entre empresas
independientes requiere otro diseño de propiedad y seguridad y no se presupone.

## 5. Lotes, movimientos y saldos

Separar identidad del lote de su ubicación. `inventory_lots` contiene artículo,
origen, fecha de ingreso/elaboración, código externo opcional y vencimiento. El UUID
es la identidad; un código de proveedor puede repetirse. Trasladar no crea otro lote.

`lot_location_balances`: lote, artículo, ubicación, cantidad registrada, reservada y
estado de bloqueo local. Clave única lote-ubicación; FK compuesta lote-artículo y
ubicación-sucursal. Posibilidad de bloqueo global por retiro de una partida, además
del local. El historial de bloqueos tiene actor, motivo y fecha.

`inventory_movements`: registro inmutable de entradas/salidas por artículo, lote y
ubicación, cantidad firmada, valor conocido o pendiente, fecha, actor y operación
origen. Conservar movimientos existentes y extender sus tipos con consumo de venta,
despacho de reventa, uso interno, traslados y correcciones identificadas.

`stock_balances`: resumen artículo-ubicación. `inventory_valuations`: resumen de
cantidad y valor artículo-sucursal. Son proyecciones actualizadas transaccionalmente
y reconciliables; no campos editables ni fuentes independientes de stock.

Cada operación tiene encabezado identificable y líneas. Los vínculos a compra,
producción, entrega, cancelación, ajuste o traslado son tipados con FK; no depender
solamente de un UUID polimórfico que puede apuntar a cualquier cosa. Una restricción
exige un solo origen válido para el tipo de operación.

Disponibilidad por lote-ubicación:

`disponible = max(0, cantidad registrada - reserva pendiente)` si el lote está
habilitado y no vencido; de otro modo, cero. Sumar estas disponibilidades evita
restar dos veces cantidades simultáneamente reservadas y bloqueadas.

La UI distingue registrado, reservado, disponible y en proceso. Durante la
elaboración, registrado no equivale a un recuento físico instantáneo: el consumo se
asienta al terminar. Conteos con trabajo en proceso exigen detener o resolver esas
operaciones antes de conciliar; no inventar un ajuste negativo sobre material reservado.

No permitir saldos negativos ni reservas nuevas por encima de lo utilizable. FEFO
elige lotes por vencimiento, con los sin fecha al final y desempate determinista.
Bloquear/vencer un lote reservado no libera su demanda para nuevas ventas: marca
la asignación como afectada, excluye ese lote del consumo normal y exige reasignar
o resolver explícitamente. La fecha puede afectar reservas sin editar una fila,
por lo que se comprueba al consultar disponibilidad y al ejecutar la operación.

## 6. Reservas, preparación y despacho

`stock_reservations`: origen comercial o de producción, sucursal, versión de
composición, estado y revisión. `reservation_allocations`: artículo, lote,
ubicación, cantidad asignada, consumida y liberada. Cantidades no negativas y
`consumida + liberada <= asignada`; el remanente es reserva pendiente.

Identificar la cantidad atendida por línea de pedido. Varias unidades y varias
estaciones no pueden consumir la reserva completa de toda la venta. Un evento de
finalización declara las cantidades concretas que termina y tiene unicidad propia;
la suma terminada/cancelada no supera lo pedido. El botón actual «Lista» puede
finalizar lo pendiente de esa comanda sin exigir cambios innecesarios de interacción.

1. Confirmar pedido: resolver receta/opciones, fijar suministro histórico, reservar
   lotes y publicar tareas de cocina en una transacción. Si falta stock, no confirmar
   un pedido que aparenta reserva exitosa. Mantener la misma clave al reintentar.
2. Iniciar: pasar a preparación conservando reservas. No descontar todavía.
3. Lista: validar cantidades, lotes, sucursal y revisión; asentar consumos, liquidar
   reservas y registrar avance en la misma transacción. Fallar todo o completar todo.
4. Entregar preparado: registrar entrega sin nuevo movimiento de ingredientes.
5. Entregar reventa: consumir el artículo reservado, sin tarea ficticia de cocina.

Estado financiero, estado de preparación y estado de inventario son independientes.
Cobrar antes o después no altera estas reglas. Una venta mixta puede tener líneas
directas y de cocina, con cumplimiento y entrega por línea y cantidades pendientes.

La cantidad prevista viene de la composición histórica. Desvíos reales se registran
con motivo; aumentos requieren stock y autorización, reducciones liberan remanente.
Un reintento con igual clave y distinto contenido genera conflicto, no otro consumo.

## 7. Cancelación, merma y recuperaciones

- Antes de comenzar: liberar reservas sin movimiento de consumo.
- En preparación: registrar cantidades realmente utilizadas/perdidas y liberar
  sólo material sin usar. Un caso no resuelto queda explícitamente pendiente,
  conserva su reserva y aparece como tarea del encargado; nunca se libera todo
  automáticamente al cancelar financieramente la venta.
- Después de lista: los componentes ya están consumidos. Marcar el preparado como
  desperdiciado puede clasificar ese consumo, pero no genera otra salida de los
  mismos componentes ni crea una entrada ficticia de leche o harina.
- Recuperación real: evento autorizado con referencia al origen, artículo, lote,
  cantidad, ubicación y condición. No desarmar automáticamente un producto en sus
  ingredientes. Reventa retornada utilizable puede reingresar mediante devolución.

Cancelación financiera y resolución física tienen registros enlazados y estados
separados. La interfaz debe mostrar ambos y no declarar resuelto el stock mientras
quedan cantidades pendientes. Las correcciones agregan eventos y movimientos
compensatorios, nunca reescriben los hechos originales.

## 8. Producción, consumo interno y traslados

Producción reserva componentes al confirmar la orden/lote a elaborar y descuenta
al finalizar. Mantener la versión elegida, rendimiento esperado, real y asignaciones
de lotes. Consumos y alta del lote producido son atómicos. Un preparado usado más
tarde consume su propio saldo; no expande y consume nuevamente sus materias primas.
Recetas de elaboración se validan contra ciclos, incluidas opciones de modificadores.

Uso interno registra artículo, ubicación, lotes, cantidad, actor y motivo sin venta
ni receta ficticia. Respeta reservas, vencimientos y permisos de ajustes/consumo.

Traslado interno inmediato: operación única con salida y entrada iguales del mismo
artículo/lote; conserva el valor total de la sucursal.

Entre sucursales: `stock_transfers`, líneas y asignaciones de despacho/recepción.
Estados: borrador, confirmado, en tránsito, parcialmente recibido, recibido,
cancelado antes de despachar o cerrado con diferencias documentadas.

- Confirmar reserva en origen. Despachar descuenta origen y crea saldo en tránsito
  identificado por transferencia-lote; ese saldo no es vendible.
- Recibir reduce tránsito y aumenta destino por la cantidad efectivamente recibida.
  Soportar recepciones parciales sin sobrepasar el pendiente.
- Extravío, daño o devolución resuelven el saldo en tránsito con documentos propios.
  Cancelar después del despacho no deshace lo físico automáticamente.
- Permiso en origen para despacho y en destino para recepción. Nadie obtiene acceso
  a otra sucursal por poseer sólo el UUID de un traslado.
- Conservar lote, vencimiento y trazabilidad. El valor pendiente viaja con la cantidad
  y se muestra separado en el consolidado para no duplicarlo en ambos locales.

## 9. Costos y valoración

Mantener tres conceptos: costo de referencia del artículo, costo registrado del
inventario y precio comercial. `null` significa desconocido; cero es un dato explícito.

Propuesta: promedio ponderado por artículo-sucursal; cantidades por ubicación y
lote. Traslado interno no modifica el promedio. Despacho entre sucursales fija el
costo transferido con el promedio de origen; recepción incorpora ese valor al
promedio del destino. El tránsito conserva el valor despachado, sin recalcularlo si
cambia después el costo de origen. Diferencias de redondeo se asignan al último
remanente para conservar exactamente el valor total.

Producción transfiere los costos consumidos al rendimiento real. La diferencia de
rendimiento no vuelve a generar consumo ya incluido. Costos desconocidos continúan
pendientes y visibles; no cambiar el pasado cuando se modifica el costo de referencia.
Una futura corrección de valoración será un documento auditado específico, nunca
una edición del costo maestro que revaloriza todo silenciosamente.

## 10. Integridad, concurrencia e historial

- FK compuestas: lote-artículo; ubicación-sucursal; mesa/estación-sucursal;
  reserva-operación/sucursal; versión-producto/receta; origen-líneas.
- CHECK para estados permitidos, exclusividad de origen/modo, cantidades y rangos;
  UNIQUE para códigos, números de versión y claves de reintento.
- Invariantes que suman varias filas se verifican bajo bloqueos dentro de una misma
  transacción. No pretender resolver sumas o pertenencia a otra fila con un CHECK.
- Orden de bloqueo único para todas las operaciones: clave idempotente, documentos
  origen ordenados, tareas/líneas, artículos, valoración por sucursal-artículo y
  saldos/reservas por ubicación-lote ordenados. El plan detallará el mismo orden
  para confirmación, lista, cancelación, ajustes, producción y transferencias.
- Reintento autorizado vuelve a verificar identidad y ámbito antes de devolver un
  resultado. La huella incluye sucursal, origen, cantidades y opciones normalizadas.
- Snapshots de nombres, unidades, precios y composición conviven con FK a identidades
  estables. Renombrar un artículo no renombra documentos históricos.
- Conciliación verifica saldo por lote-ubicación, resumen por artículo-ubicación,
  reservas pendientes y valoración por sucursal. Una divergencia bloquea activación
  o ajuste automático y genera diagnóstico; nunca se oculta con un saldo calculado
  desde otra fuente elegida arbitrariamente.

## 11. Transición desde 0.6.0-rc.1

El usuario confirmó que aplicó la migración 0006. No editar migraciones 0000–0006
ni sus snapshots para simular que este modelo siempre existió.

1. Relevar dependencias y preparar validaciones de sólo lectura. Elegir con el
   usuario sucursal/ubicación que representarán los registros actuales.
2. Ensayar en copia autorizada: nuevos campos/relaciones y traslado de datos
   conservando UUID. Renombrar `ingredients`/`ingredient_id` hacia `items`/`item_id`
   coordinadamente con código, contratos y pruebas; no mantener una traducción
   permanente que mezcle ambos conceptos. Adaptadores de transición, si hacen falta,
   deben estar documentados y tener retiro previsto.
3. Conservar valores iniciales, movimientos y lotes existentes; transformar el saldo
   global en saldo de la ubicación acordada, sin inventar movimientos de negocio.
   Conservar los snapshots históricos y su significado.
4. Clasificaciones y productos directos sin vínculo quedan por revisar. Recetas
   existentes conservan su modelo legacy/configurable; no convertirlas por inferencia.
   Una receta legacy necesita una política determinista de elección validada antes
   de reservar, o conversión explícita. No inventar ingredientes históricos faltantes.
5. Asignar membresías actuales explícitamente. No convertir todos los encargados en
   administradores de todas las sucursales. Mapear estaciones, mesas y rutas.
6. Corte operativo: cerrar/resolver pedidos y producciones en curso antes de activar
   el nuevo consumo. Pedidos históricos conservan marca de inventario no gestionado;
   no descontarlos retroactivamente. Registrar fecha y alcance del corte.
7. Activar sólo con clasificaciones, ubicaciones de consumo, vínculos comerciales,
   permisos y conciliación completos. No vender con configuración incompleta ni
   declarar disponible la función mientras una sucursal carece de esos datos.

La migración requiere ventana de mantenimiento coordinada en esta primera versión;
no se promete coexistencia de código viejo escribiendo junto al nuevo. Respaldo
previo y reversión ensayada antes de activar. Después de nuevas escrituras, recuperar
requiere preservar/conciliar esas operaciones; no restaurar un respaldo descartándolas.

Los SQL y la herramienta de transición se prepararán para revisión. Ejecutarlos,
incluido un ensayo que aplique migraciones a una copia, necesita autorización que
actualmente no existe. Este documento no cambia esa restricción.

## 12. Entregas y criterios de aceptación

Diseñar todo el recorrido ahora; implementar por entregas verificables, sin habilitar
comportamientos incompletos en la instalación activa:

1. Artículos, unidades, sucursales, ubicaciones y acceso.
2. Inventario por ubicación, trazabilidad, valoración y transferencias.
3. Productos directos, recetas y reservas.
4. Consumo al finalizar, despacho, cancelación y producción.
5. Transición, conciliación y recorrido completo; luego navegación y Breadcrumb.

Escenarios mínimos del plan de pruebas:

- Botella individual y pack comparten stock; sucursales no comparten disponibilidad.
- Reserva simultánea del último saldo: sólo una operación puede comprometerlo.
- Finalizar/reintentar/despachar: un solo consumo por cantidad preparada.
- Venta mixta y finalización parcial: se consume únicamente lo terminado.
- Cancelación antes/durante/después, con resolución parcial y sin doble merma.
- Lote reservado que vence o se bloquea; reasignación y cancelación controladas.
- Transferencia interna y entre sucursales, recepción parcial, pérdida y reintento.
- Producción de preparado consumido luego por receta: no duplicar materias primas.
- Conteos con reservas/trabajo en proceso y cierre de ubicación con saldo.
- Costos cero/desconocidos, redondeo y conservación de cantidad/valor en traslados.
- Ataques de acceso por IDs de otra sucursal, incluso en listados y replays.
- Abrir una segunda sucursal con el sistema poblado: conservar las identidades del
  catálogo e historial, iniciar stock en cero y abastecerla con operaciones trazables.
- Cambiar de sucursal durante una sesión no cambia el origen de pedidos existentes
  ni filtra resultados de caché, paginación o tareas de otra sucursal.
- Migración: conteos, UUID, relaciones, stock, valor, históricos y permisos conservados.

Las pruebas de concurrencia deben usar PostgreSQL con conexiones independientes;
PGlite o mocks por sí solos no demuestran esas garantías. Hasta autorización para
migraciones, sólo ejecutar verificaciones que no preparen esquemas mediante ellas.

## 13. Revisión y decisiones propuestas

Confirmado por el usuario: alcance de artículos, varias sucursales con ubicaciones,
extensibilidad desde la primera sucursal, reservar al confirmar y consumir al
finalizar, manejo físico explícito de cancelación.

Propuesto para aprobar en conjunto: catálogo compartido de un negocio; clases de
artículo; suministro directo/receta; valoración por sucursal; precios compartidos por
canal; ubicaciones explícitas por estación; prohibición de stock negativo y alcance
por entregas. No son comportamientos ya implementados.

Datos necesarios para ejecutar la transición, no para revisar el diseño: sucursal y
ubicación iniciales, clasificación de fichas, membresías, vínculos de reventa y fecha
de corte. Se solicitarán sobre un informe concreto, sin inferirlos de datos privados.

Auto-revisión: separados clase/abastecimiento/venta, consumo/pago y lote/ubicación;
contemplados tránsito, parciales, reintentos, WIP, permisos e históricos legacy. Las
reglas de consistencia distinguen restricciones de fila, relaciones y transacciones.
La implementación y pruebas futuras deben demostrar estas propiedades; este diseño
por sí solo no demuestra que la instalación actual ya las cumpla.

Referencias:

- PostgreSQL, restricciones: https://www.postgresql.org/docs/current/ddl-constraints.html
- Odoo, artículos e inventario: https://www.odoo.com/documentation/19.0/applications/inventory_and_mrp/inventory/product_management/configure/type.html
- Odoo, unidades: https://www.odoo.com/documentation/19.0/applications/inventory_and_mrp/inventory/product_management/configure/uom.html
- Odoo, finalización de fabricación: https://www.odoo.com/documentation/18.0/applications/inventory_and_mrp/manufacturing/basic_setup/one_step_manufacturing.html
