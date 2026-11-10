# Jornada completa · ensayo manual de Kybo

Versión de referencia: `c7551a8` (PR #18). Datos completamente ficticios. Duración orientativa: 90–120 minutos; no hace falta esperar una jornada de 14 horas. **No usar las cuentas ni la dirección publicadas del negocio.**

Fecha del ensayo: __________ · Responsable: __________ · Carpeta del ensayo: __________

En cada casilla comprobar el resultado, no solo que el botón responda. Si algo falla, registrar una incidencia con su ID y continuar únicamente si no invalida el siguiente control. Estados útiles: pendiente, aprobado, falló, bloqueado.

## 0. Comprobar el entorno

- [ ] Entrar en `http://127.0.0.1:3100/login`, o la dirección indicada en `ACCESOS.md` si se preparó otro puerto. La sucursal debe decir **PRUEBAS · Kybo ficticio**.
- [ ] Abrir `ACCESOS.md` de la carpeta del ensayo. Usar `qa_admin`, `qa_encargada`, `qa_local`, `qa_barra` y `qa_cocina`; cada cuenta tiene una contraseña ficticia distinta.
- [ ] Usar perfiles de navegador independientes para conservar varias sesiones. Varias pestañas de una misma ventana privada comparten sesión y no separan a las personas.
- [ ] Con administración, comprobar que Caja no tiene jornada abierta; Historial de ventas y Pedidos/Recepciones de Compras están vacíos. Los movimientos de stock iniciales sí existen.
- [ ] Confirmar que la impresión está desactivada y que no hay un conector vinculado. No conectar la impresora real a esta prueba.
- [ ] Abrir en otra ventana la pantalla pública indicada en `ACCESOS.md`. Debe comenzar vacía. Activar el sonido con una interacción si el navegador lo solicita.

## 1. Turnos, puestos y asistencia

Ruta: **Asistencia / planificación de horarios**, y **Puesto del local** para la gestión desde la PC.

- [ ] Ver los turnos Mañana 09–17 y Tarde 17–23, con pausa de 30 minutos.
- [ ] Ver que Barra y Cocina tienen hoy una **ventana ficticia 00:00–23:59** y su puesto correspondiente. Esa ventana sirve para probar a cualquier hora; no representa los horarios reales del personal. No reemplazarla durante la jornada de referencia.
- [ ] Asignar un turno por varios días, empezando mañana. Comprobar la vista previa y las fechas asignadas. Al incluir hoy, conservar la asignación existente y comprobar que figure como omitida.
- [ ] Entrar como `qa_local`, abrir la gestión y autorizarla con `qa_encargada`. Ver que la autorización permite gestionar puestos y que no convierte la cuenta compartida en administradora.
- [ ] Probar una excepción de asistencia: encargada solicita una entrada manual para `qa_barra`, con hora actual y motivo “Ensayo manual sin celular”. Administración aprueba; encargada usa el código dentro de sus 10 minutos de vigencia.
- [ ] Ver el ingreso identificado como manual, con persona, hora, motivo y aprobación. Intentar otra entrada: debe rechazarse sin duplicar el fichaje.
- [ ] Registrar inicio y fin de pausa mediante el circuito manual autorizado. No es necesario esperar 30 minutos: comparar la duración realmente transcurrida. Una salida sin entrada o un fin de pausa sin inicio deben rechazarse; usar `qa_cocina` todavía sin fichar para comprobar la primera condición.
- [ ] Habilitar después la entrada manual de `qa_cocina` para continuar el ensayo. Los puestos asignados deben ser visibles en cada cuenta personal.

**Alcance local:** ubicación y verificación adicional de cierre/producción están desactivadas solamente en esta sucursal ficticia. El fichaje normal por QR mantiene sus requisitos propios. La prueba real desde el celular requiere una dirección HTTPS de pruebas y se encuentra al final; este bloque manual no certifica QR, Face ID, huella ni distancia.

## 2. Apertura y stock inicial

- [ ] Como encargada, abrir Caja desde el encabezado. El campo de fondo inicial recibe el foco. Al no existir un cierre anterior, no debe inventar un saldo previo.
- [ ] Ingresar **$50.000** de fondo inicial. Ver en el encabezado quién abrió, cuándo y con cuánto. No permitir otra apertura simultánea en la sucursal.
- [ ] Como personal de Barra/Cocina, verificar que no se ofrecen pagos a proveedores, retiros ni configuración de caja. La cuenta del local permite operar ventas, sin mostrar gestión de caja.
- [ ] En Operación del día → Stock por ubicación, comparar “Todas las ubicaciones” con cada ubicación. Los totales deben sumar las ubicaciones y conservar las unidades.

| Insumo | Depósito | Barra | Cocina |
|---|---:|---:|---:|
| Leche | 20 L | 1 L | 0 |
| Té seco | 1 kg | 0 | 0 |
| Concentrado de té | 0 | 0 | 0 |
| Tapas de waffle | 30 | 0 | 2 |
| Jamón | 3 kg | 0 | 0,2 kg |
| Queso | 4 kg | 0 | 0,2 kg |
| Vasos | 80 | 10 | 0 |
| Sorbetes | 90 | 10 | 0 |
| Cacao | 0,2 kg | 0 | 0 |

El agua es un componente sin control de stock. No esperar un saldo físico de agua.

- [ ] Ver tareas de reposición por ubicación y la necesidad de preparar concentrado en Depósito. Asignar una tarea a un empleado y comprobar que aparece en su cuenta personal.
- [ ] Ver la sugerencia de compra de vasos: consumo estimado 10/día, plazo 7 días + margen 3, objetivo 17 días. Son valores ficticios para disparar la alerta, no mínimos recomendados para el negocio real.

## 3. Compras: pedido, anticipo y recepción parcial

Como encargada/administración, desde **Compras**:

- [ ] Crear y confirmar un pedido a **QA · Proveedor Bolivia** de **4 paquetes de 25 vasos** a **$2.000 por paquete**: 100 vasos, total **$8.000**. Fecha estimada: hoy + 7 días. Si se parte de la sugerencia de 80 unidades, ajustar explícitamente a 4 paquetes; no añadir un segundo renglón con la misma sugerencia.
- [ ] Confirmar que el pedido aumenta lo pendiente por recibir, pero todavía no el stock físico. La proyección debe considerar la llegada y evitar proponer otra compra para esa misma necesidad cubierta. Una alerta por llegada tardía podría seguir siendo válida: no confundirla con comprar dos veces.
- [ ] Registrar el anticipo de **$8.000 por transferencia externa**, referencia `QA-ANT-001`. No realizar una transferencia bancaria. Ver el anticipo en el pedido y comprobar que el efectivo de Caja sigue en $50.000.
- [ ] Registrar una recepción parcial de **2 paquetes / 50 vasos**, destino Depósito. Ver 50 pendientes, aumento físico de 50 y anticipo aplicado una sola vez.
- [ ] Recibir los otros **2 paquetes / 50 vasos**. Es una llegada anticipada ficticia para poder probar todo hoy. Ver pedido completo, pendiente 0 y Depósito con **180 vasos**. No pagar otros $8.000 al recibir.
- [ ] Crear una compra local de **6 cajas de leche de 1 litro**, a **$1.000 cada una**, a **QA · Proveedor local**, destino Depósito. Recibir: el Depósito pasa de 20 a **26 L**.
- [ ] Registrar **un solo pago de $6.000 desde Caja** asociado a esa compra. Debe aparecer en la compra y como salida de Caja; no cargar además un gasto por el mismo importe.
- [ ] Cambiar entre Para comprar / Pedidos / Recepciones con un borrador sin enviar. Comprobar que se conserva y que guardar una vez produce una sola operación.

## 4. Producción en Depósito y reposición en un traslado

- [ ] En Registro de producción, planificar **1 receta / 1.000 ml de QA · Concentrado de té**, en Depósito, asignada a `qa_barra`. Consume 50 g de té y 1.000 ml de agua sin stock.
- [ ] En la cuenta de Barra, ver la asignación y empezar la producción. El stock se reserva; no debe aparecer todavía 1 L de preparado disponible.
- [ ] Terminar según lo previsto. Ver té seco en **950 g** y concentrado en **1 L en Depósito**. La tarea debe reflejar el resultado real y no quedar duplicada.
- [ ] Preparar el siguiente traslado por lotes, con Depósito como origen. Agregar renglones sin ejecutar cada uno por separado:

| Insumo | Cantidad a ingresar | Destino esperado |
|---|---:|---|
| Leche | 4 L | Barra |
| Concentrado de té | 0,5 L | Barra |
| Tapas de waffle | 8 unidades | Cocina |
| Jamón | 0,8 kg | Cocina |
| Queso | 0,8 kg | Cocina |
| Vasos | 40 unidades | Barra |
| Sorbetes | 40 unidades | Barra |

- [ ] Comprobar unidades visibles y destino automático según el mínimo de cada insumo. No escribir 4.000 en un campo que muestra litros.
- [ ] Confirmar **una sola vez** el traslado completo cuando se haya simulado la entrega de los insumos. Ver cambios en ambas ubicaciones y un único lote de operaciones, sin dejar reservas pendientes.
- [ ] Ver que las necesidades cubiertas del tablero se actualizan. Las tareas asignadas que requieran confirmación no deben darse por hechas sin una operación registrada.

**Reservar el cacao:** no trasladarlo todavía. Se usa en el caso S7 de falta de stock.

## 5. Ventas, preparación, pantalla pública y entrega

Usar `qa_local` para tomar y cobrar; `qa_barra` y `qa_cocina` para preparar; volver al puesto para entregar. Completar cada caso hasta la entrega antes de pasar al siguiente, salvo que se esté probando intencionalmente una cola.

| Caso | Pedido y control | Efectivo | Tarjeta | Plataforma |
|---|---|---:|---:|---:|
| S1 | Bebida; cliente Ana Prueba; Para llevar; modificador Sin hielo | $5.000 | — | — |
| S2 | Waffle; cliente nuevo Luis Prueba, sin email; comprobante QA-0001 | — | $8.000 | — |
| S3 | Bebida + Waffle; pago dividido; comprobante QA-0002 | $5.000 | $8.000 | — |
| S4 | Combo bebida y waffle; verificar que cuesta $12.000, no $13.000 | $12.000 | — | — |
| S5 | Mesa 1: agregar Bebida, enviar; sumar Waffle en otra comanda; pagar toda la mesa con QA-0003 | — | $13.000 | — |
| S6 | Delivery / PedidosYa; Bebida; ID externo QA-DEL-001; cobra la plataforma | — | — | $5.000 |
| S7 | Cacao: falta stock, reponer y reintentar una vez, como se indica debajo | $4.000 | — | — |
| S8 | Otra venta de Mesa 1 con Bebida; enviar y anular **sin preparar ni cobrar** | — | — | — |
| **Totales** | **7 ventas cobradas + 1 venta de mesa anulada** | **$26.000** | **$29.000** | **$5.000** |

En S1–S7 comprobar:

- [ ] La selección de cliente es Autocomplete en línea. El nombre nuevo queda guardado sin exigir email ni consentimiento de marketing. No registrar clientes reales.
- [ ] Cuando corresponda, hay localizador automático y no se puede omitir si hay disponibles. No asignar uno ocupado. Registrar el número junto a cada caso.
- [ ] Al confirmar, aparece una sola venta y el pedido llega al puesto correcto. En S3 y S4 deben existir partes de Barra y Cocina, con sus productos y modificadores claros.
- [ ] La pantalla pública muestra el número/localizador y el nombre. Observar la actualización automática; no confundir la primera compilación del entorno local con una demora de la aplicación publicada.
- [ ] Comenzar y marcar listo desde la cuenta del puesto correspondiente. El personal no puede preparar pedidos de otro puesto ni registrar la entrega al cliente.
- [ ] En un pedido con dos puestos, no anunciar “listo para retirar” hasta completar ambas partes. Comprobar el sonido en Comandas y pantalla pública; atender cualquier solicitud del navegador de activar audio.
- [ ] Entregar desde el puesto del local: desaparece de la cola activa, se libera el localizador y el historial conserva lo ocurrido.
- [ ] Abrir el detalle en modal desde Historial; al cerrarlo se mantienen filtros y el pedido en curso.
- [ ] En S2, S3 y S5 el comprobante de tarjeta es obligatorio y queda guardado exactamente como QA-0001, QA-0002 y QA-0003. No usar un ticket bancario real.

S7, antes de que exista stock de cacao en Barra:

- [ ] Intentar cobrar el Cacao. Debe señalar **QA · Cacao en Barra**, preservar el pedido y no crear un cobro ni una venta completada.
- [ ] Trasladar **0,1 kg de cacao** de Depósito a Barra. No tiene mínimo configurado: elegir Barra manualmente debe ser necesario y comprensible.
- [ ] Reintentar el pedido original. Debe cobrarse una sola vez por $4.000; verificar en Historial y Caja.

S8:

- [ ] Anular la venta de mesa antes de preparar/cobrar. Ver saldo 0, ningún cobro y liberación de reservas sin consumo físico. Si hay una devolución de localizador pendiente, completarla con su acción de devolución antes de seguir.

## 6. Gastos y retiros, sin duplicar

- [ ] Como encargada, registrar desde Caja un gasto de **$1.500**, motivo “QA · Limpieza del día”, pagado con efectivo de esta caja.
- [ ] Verlo en Gastos del negocio y Caja como el mismo movimiento, no dos salidas.
- [ ] Registrar un retiro durante el día de **$10.000**, motivo “QA · Retiro de billetes”. Ver responsable, hora e importe.
- [ ] Confirmar que el pago local de $6.000 se distingue del gasto y del retiro. El anticipo externo de $8.000 a Bolivia no debe aparecer como salida de efectivo de esta caja.

## 7. Cierre, lote del posnet y foto

Con las operaciones anteriores, antes de un nuevo retiro al cerrar:

`$50.000 + $26.000 − $1.500 − $6.000 − $10.000 = $58.500`

- [ ] Abrir Cerrar caja. Ver **$58.500 registrados en el sistema** junto al campo Efectivo contado; el campo recibe el foco.
- [ ] Ingresar **$58.500** contados: diferencia $0. Ingresar **$8.500** como nuevo retiro de cierre; quedan **$50.000** de fondo. No volver a registrar los $10.000 retirados durante el día.
- [ ] Guardar y salir; cambiar de módulo y volver a Caja. Comprobar que se restaura el borrador de esta jornada y no se crea un cierre.
- [ ] En Posnet, comparar los tres cobros con QA-0001 / QA-0002 / QA-0003. Total **$29.000**, **3 operaciones**, antes de comisiones.
- [ ] Registrar lote **QA-001**, fecha/hora actual del comprobante, 3 operaciones y total $29.000. Cargar `COMPROBANTE-FICTICIO.png` de la carpeta del ensayo. La imagen dice SOLO PRUEBAS y no tiene validez fiscal ni bancaria.
- [ ] Comprobar que los campos obligatorios y la foto se reconocen, y que no se puede confirmar un lote incompleto. Ver la foto guardada; probar el mismo comprobante al volver a abrir el borrador.
- [ ] Revisar y confirmar el cierre una sola vez. Ver contado $58.500, retiro final $8.500, fondo $50.000, diferencia de efectivo $0 y diferencia de tarjetas $0.
- [ ] Ver Caja cerrada en el encabezado. Abrir solamente el modal de la próxima apertura: debe informar el fondo retenido de $50.000; cancelar sin abrir otra jornada de referencia.

## 8. Conciliación final y asistencia

- [ ] Comprobar 7 ventas cobradas por **$60.000**: $26.000 efectivo, $29.000 tarjeta y $5.000 plataforma. Una venta de mesa anulada sin cobro; ningún pedido activo o reserva pendiente de esos casos.
- [ ] Registrar salida manual autorizada de Barra y Cocina. Ver ingreso, pausas y egreso de cada persona; comparar duraciones con los horarios reales registrados. No interpretar la ventana QA de todo el día como un turno real trabajado.
- [ ] Comprobar los siguientes saldos físicos, si se siguió el recorrido sin agregar movimientos:

| Insumo | Depósito | Barra | Cocina | Total |
|---|---:|---:|---:|---:|
| Leche | 22 L | 4 L | 0 | 26 L |
| Té seco | 0,95 kg | 0 | 0 | 0,95 kg |
| Concentrado de té | 0,5 L | 0,25 L | 0 | 0,75 L |
| Tapas de waffle | 22 | 0 | 6 | 28 |
| Jamón | 2,2 kg | 0 | 0,84 kg | 3,04 kg |
| Queso | 3,2 kg | 0 | 0,8 kg | 4 kg |
| Vasos | 140 | 44 | 0 | 184 |
| Sorbetes | 50 | 44 | 0 | 94 |
| Cacao | 0,1 kg | 0,08 kg | 0 | 0,18 kg |

- [ ] Revisar Operación del día: las tareas resueltas no deben seguir pidiendo ejecutar el mismo traslado/producción/compra. Distinguir una necesidad nueva de una operación duplicada.
- [ ] Registrar incidencias separando error funcional, configuración faltante y función todavía pendiente. Guardar capturas con el ID del caso y el número de venta/movimiento.

## 9. Excepciones en un segundo ensayo

Preparar otra carpeta/base para no alterar los importes de referencia.

- [ ] Cierre con faltante o sobrante: motivo obligatorio, cierre permitido y revisión posterior de encargada. No cambiar el conteo para esconder la diferencia.
- [ ] Producción con diferencia: informar cantidad/motivo; cambiar de pestaña y provocar una actualización; conservar el borrador. El personal no finaliza ni ajusta stock mientras espera revisión.
- [ ] Interrupción de conexión después de enviar un cobro/traslado: reintentar el mismo envío; comprobar una sola operación. Si no se puede confirmar el resultado, mantener la advertencia y evitar crear otro pedido para “resolverlo”.
- [ ] Localizadores agotados: en este segundo ensayo configurar pocos; ocuparlos y comprobar “Sin localizadores disponibles”, sin impedir indebidamente una venta cuando realmente no quedan.
- [ ] Permisos: personal no accede a mínimos, caja, pagos ni retiros; cuenta del local no actúa como persona de Barra/Cocina; administración puede revisar y configurar.
- [ ] Contraseña temporal de una cuenta QA nueva: aviso de cambio y plazo de 24 h desde primer ingreso. El vencimiento real necesita un ensayo específico; no darlo por aprobado por ver el aviso.
- [ ] Compras: reprogramar llegada, anular el saldo pendiente y evitar recepción superior a lo pedido. Revisar la proyección después de cada acción.

## 10. Pendiente en dispositivos y servicios separados

Estos controles **no quedan aprobados** por el ensayo local:

- [ ] Celular real con una URL HTTPS de pruebas: QR dinámico, retorno después del login, registro/verificación del dispositivo, ubicación dentro/fuera del radio, código vencido, duplicados y pausas. `127.0.0.1` en un celular apunta al propio teléfono, no a esta PC. No usar producción como sustituto.
- [ ] Foto tomada con cámara del celular y carga en un almacenamiento remoto exclusivo de pruebas. El adaptador local comprueba el circuito de archivos, no Vercel Blob.
- [ ] Impresora y conector exclusivos de ensayo: comandas de Barra/Cocina, modificadores, reimpresión y recuperación tras desconexión. Aquí no se envía nada a la Hasar real.
- [ ] PostgreSQL de pruebas: concurrencia de varios cobros sobre el último insumo/localizador, cierre simultáneo y carga de varias terminales. PGlite no certifica esos comportamientos ni los tiempos del despliegue real.
- [ ] En otro ensayo que cruce medianoche, cobrar antes y después del cambio de fecha y comprobar que se conserva la misma jornada hasta cerrar Caja.
- [ ] Comprobar si existe una vista de capacidad de venta que responda “con 1 kg de este insumo, ¿para cuántos productos alcanza?”. Si no existe, registrar la función pendiente; el rendimiento de un lote producido no certifica esa previsión comercial.
- [ ] Inventario diario formal y análisis de tiempos sin tarea: comprobar el alcance existente antes de darlos por implementados. Comparar saldos y fichajes no equivale por sí solo a tener ambos módulos completos.

Resultado de la jornada: __________ · Incidencias bloqueantes: __________ · Próxima acción: __________
