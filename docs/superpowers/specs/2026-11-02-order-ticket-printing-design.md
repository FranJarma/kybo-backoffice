# Impresión de comandas por estación

Fecha: 2 de noviembre de 2026. Rama: `codex/order-ticket-printing`.

Estado: diseño y propuesta visual aprobados. El usuario autorizó la implementación el 2/11, incluyendo modificadores claros, conector USB, separación por Barra y Cocina y reimpresión. Posteriormente autorizó la 0035 en Neon, confirmó la salida correcta de dos tickets USB y autorizó commit y push. La instalación y vinculación permanente del conector siguen pendientes de la publicación de la app.

## 1. Decisiones del usuario

- Hasar P-HAS-181 conectada **por USB a la PC de caja con Windows**. Esto reemplaza la conexión Ethernet mencionada en el diseño general de septiembre.
- Impresión automática al confirmar cada pedido; también debe poder reimprimirse.
- Tickets separados para Barra y Cocina. Solo generar ticket para una estación si tiene productos en ese pedido.
- Conector propio de Kybo en Windows, elegido frente a la alternativa QZ Tray.
- La propuesta visual fue aceptada con el ajuste de mostrar claramente los modificadores.
- Los tickets fiscales quedan para otra etapa. No hacer commit ni push por ahora.

## 2. Objetivo y alcance

El empleado confirma el pedido mediante el circuito actual y continúa atendiendo. Se guarda una solicitud duradera de impresión por estación, sin esperar a la impresora ni agregar un diálogo por venta. El papel sirve para preparar y coordinar la entrega; no modifica estados de preparación, cobros, caja o stock.

La primera instalación tiene **una impresora física**. Los tickets de ambas estaciones salen por esa Hasar y se reparten en el local; no se presume que haya una impresora en cada área. Mantener una asociación explícita de estación a destino permite una futura segunda impresora, sin incluir esa instalación en esta entrega.

No se desarrollan facturación, conexión ARCA, tickets fiscales, pagos, cajón de efectivo, servidor local de ventas, preparación offline, impresión desde el celular directamente al USB ni reconocimiento automático de identidad de la cajera. La PWA de preparación y el circuito de entrega continúan funcionando independientemente de la impresora.

## 3. Alternativas consideradas

1. **Conector propio, seleccionado.** Se instala una vez en la PC del local, arranca con Windows y recibe trabajos del backend mediante conexión saliente autenticada. Permite controlar la cola y recuperación, a cambio de desarrollar, instalar y mantener ese componente.
2. **QZ Tray.** Alternativa existente con soporte de impresión RAW/ESC-POS. La operación silenciosa requiere firma y confianza mediante certificado propio o contratado; agrega esa dependencia y su configuración. No se eligió.

El diálogo de impresión del navegador se conserva como posible contingencia explícita, sujeta a prueba con el driver. No satisface la impresión automática elegida y no será el camino habitual.

## 4. Integración con el pedido actual

La fuente es la comanda confirmada (`saleOrders` y sus líneas), no el carrito del navegador ni un evento visual de éxito. Crear las solicitudes originales dentro de la transacción que confirma/publica la comanda; si esa transacción revierte, no puede quedar un trabajo imprimible. Un replay confirmado devuelve el mismo pedido y los mismos originales.

Respetar los momentos actuales: Mostrador confirma con el cobro exigido; Mesa publica cada comanda aunque su cuenta permanezca abierta; Delivery sigue su confirmación actual. Agregar productos a una cuenta abierta genera el ticket de esa nueva comanda/secuencia, sin repetir las comandas anteriores. Cobrar después una mesa no imprime otra vez su comida.

La transacción solo guarda datos y solicitudes acotadas: no consulta Windows, no llama al conector, no espera papel ni renderiza imágenes pesadas. Medir la latencia antes y después de incorporar el registro para evitar regresiones del cobro.

No encolar automáticamente ventas históricas al activar la función. Mientras no esté instalada o esté deshabilitada, las ventas mantienen el circuito actual; se muestra el estado de impresión sin impedir operar. La activación tiene un corte explícito para no confundir pedidos nuevos con históricos.

## 5. Distribución y contenido

Reutilizar las estaciones y rutas por producto de la sucursal. Para productos que ya generan tareas digitales, el destino del papel coincide con el destino congelado de esa tarea. No cambiar la distribución de pedidos confirmados cuando se edite el catálogo.

**Decisión propuesta para cerrar los casos de borde:** todos los renglones operativos (`individual` y `combo_component`) deben estar representados en un ticket, incluso los productos sin receta/preparación digital, como una gaseosa en botella. Su ruta de producto determina la estación; configurar esas bebidas en Barra durante la puesta en marcha, sin cambiar los datos reales automáticamente. Si un producto operativo carece de estación, incluirlo en un ticket excepcional **«REVISAR ESTACIÓN»** con alerta visible en caja. No omitirlo ni asignarlo silenciosamente a Cocina o Barra, y no bloquear el cobro.

Los combos ya se expanden en el circuito actual: `prepareLines` guarda un padre `combo` y componentes `combo_component` con `parentLineId`, cantidad e información propia. **Conservar esa expansión y distribuir cada componente según su producto/estación**, igual que la preparación digital. Un combo de bebida y waffle puede aparecer en ambos tickets, cada uno solo con su componente y sus modificadores. El padre aporta el nombre/referencia de combo y no se envía a preparar ni a «REVISAR ESTACIÓN» como si fuera otro producto. No imprimir simultáneamente padre y componentes como cantidades adicionales. Las cantidades de los hijos ya incluyen cantidad de combos por cantidad del grupo: no multiplicarlas otra vez. Las observaciones y modificadores se toman del hijo confirmado, preservando la referencia de combo.

Cada ticket lleva:

- Logo monocromático y nombre breve de la sucursal.
- Estación grande, número de venta y secuencia de comanda, localizador cuando exista y cliente cuando esté informado.
- Lugar/forma de consumo, mesa o referencia operativa de Delivery si corresponde, fecha y hora de la sucursal.
- Cantidad y nombre de cada producto de esa estación.
- Modificadores de cada renglón, observaciones del producto y nota general del pedido con jerarquías distintas.
- Referencia de coordinación si otras estaciones participan; no incluir sus productos como si debieran prepararse nuevamente.
- Marca y número de copia cuando corresponda; fecha/hora original y fecha/hora de la reimpresión identificadas por separado.

No imprimir precios, costos, comisiones, documentos, email o teléfono del cliente en una comanda de preparación. No incluir una receta interna completa ni convertir la nota general en un modificador.

### Modificadores: requisito explícito

Usar la información guardada al confirmar (`sale_line_modifiers`): **nombre de grupo, opción elegida, cantidad e instrucción operativa**, cuando existan. No resolverlos de nuevo contra la receta o el catálogo actual durante una reimpresión.

Debajo de cada producto aparece un bloque **MODIFICADORES**, con un modificador por línea e indentación consistente. Ejemplos: `Leche: ENTERA`, `Hielo: SIN HIELO`, `Perlas: TAPIOCA × 1`, `Dulzor: MENOS AZÚCAR`. Mostrar las opciones relevantes aunque sean predeterminadas si están incluidas en la selección resuelta del pedido. No inventar opciones ausentes del snapshot.

La cantidad de un modificador se presenta **por unidad del producto**; la cantidad de productos tiene su propia columna. Si el producto tiene cantidad mayor que uno, explicitar «Modificadores por unidad» para no confundir doble extra por producto con extras totales. Los productos iguales con distinta combinación o distinta observación permanecen en renglones separados. No sumar por nombre.

La instrucción de un modificador se muestra debajo de su opción cuando aporta una indicación adicional; evitar repetir una instrucción idéntica a la opción. Las opciones de retirar ingredientes, cantidad extra y ajustes de preparación se leen con igual o mayor contraste que el resto del contenido. No interpretar texto libre como una modificación estructurada ni agregar afirmaciones sobre alérgenos que no existan en los datos.

Las notas de producto llevan **OBSERVACIÓN DEL PRODUCTO** debajo de sus modificadores. La nota compartida lleva **NOTA DEL PEDIDO** en un bloque separado visible en cada estación que participa. Los textos largos se envuelven y continúan, sin recortar indicaciones operativas.

## 6. Originales, copias y permisos

El original se identifica de forma única por pedido, estación, revisión/evento y destino. Doble clic, actualización de página, respuesta perdida o dos ventanas no generan otro original.

Desde el detalle de venta existente en modal y la información de impresión del pedido se puede reimprimir **una estación**. Evitar abrir otra página o perder el carrito/filtros. El operador ve qué ticket está solicitando, el motivo obligatorio y una confirmación única. Motivos rápidos propuestos: «No salió el ticket», «Ticket perdido», «Ticket ilegible» y «Otro motivo», con aclaración obligatoria solo en este último caso. No pedir escritura en todos los casos.

Cada copia tiene número consecutivo por ticket, «COPIA» destacado y la referencia original. El comando tiene identidad de reintento y revisión: repetirlo por una respuesta perdida recupera esa copia, no incrementa otra vez el número. Copiar no crea una venta ni cambia inventario o preparación. Guardar solicitante real de sesión, fecha/hora y motivo; la cuenta compartida del local se identifica como tal, sin inventar una empleada responsable.

**Permisos propuestos:** la cuenta operativa del local y usuarios con acceso actual a esa venta/sucursal pueden reimprimir sus tickets activos. No abrir acceso a pedidos ajenos desde la vista personal de una estación. Configuración, emparejamiento/revocación del conector e impresión histórica quedan para Administración/Encargado según capacidades actuales; la cuenta compartida no hereda administración. Todo se comprueba en servidor, no por ocultar botones.

El histórico se imprime explícitamente como **«HISTÓRICO · NO PREPARAR»**, además de «COPIA». Los datos originales permanecen; no presentar un localizador liberado como si estuviera asignado actualmente. Cualquier cambio vigente de localizador o cancelación se señala al revisar/reimprimir en lugar de mezclarlo silenciosamente con el documento original.

## 7. Conector Windows y seguridad

Instalar el driver/cola de la Hasar que efectivamente funcione por USB; verificar nombre exacto de la cola, permisos, ancho útil, corte y soporte RAW/ESC-POS. Elegir el formato final a partir de prueba real, sin presumir que todo driver admita los mismos comandos o informes de estado.

El conector es un proceso en segundo plano que inicia con Windows y utiliza una identidad local con acceso a esa cola. No depende de una pestaña de Kybo abierta ni convierte esa PC en servidor de caja. Un solo despachador activo por impresora física serializa Barra/Cocina, sin intercalar bytes entre tickets.

Emparejamiento administrativo inicial de un solo uso y duración breve. Tras vincularlo, el conector usa una credencial técnica revocable, limitada a sucursal/destino y a obtener, reclamar e informar trabajos. Sin contraseña del administrador, sin sesión de una empleada, sin acceso directo a Neon. El secreto queda protegido por el almacenamiento seguro de Windows y fuera de logs, HTML y almacenamiento del navegador.

Comunicación saliente HTTPS con Kybo: no abrir puertos públicos hacia USB, Windows o la red del local. Revalidar habilitación y destino al reclamar cada trabajo; revocar o cambiar la asociación impide trabajos nuevos. No aceptar desde el cliente cuerpos RAW arbitrarios ni comandos para otras impresoras. El backend construye contenido autorizado; el formateador escapa controles/ESC del texto ingresado por usuarios.

La elección del lenguaje, empaquetado, servicio/tarea de inicio, esquema de credenciales y APIs concretas queda al plan técnico, cumpliendo estas garantías. Preferir un instalador o ejecutable reproducible sin exigir a las empleadas configurar un entorno de desarrollo.

## 8. Cola, recuperación y estados honestos

Cola persistente del servidor, reclamación exclusiva con vigencia y registro durable local por ID de trabajo. Antes de llamar a Windows, guardar que comenzó el envío; después, conservar el ID de spool y el resultado. Asociar el ID de Kybo con el nombre del documento de Windows para reconciliar al reiniciar. Un ACK perdido se reenvía usando el registro local, sin imprimir de nuevo.

Si el proceso se corta en un punto donde pudo entregar datos a Windows pero no hay evidencia concluyente, el estado es **«Revisar envío»**. No resolverlo por un reintento automático a ciegas. Tampoco interpretar que un trabajo desapareció de la cola de Windows como prueba suficiente de que el papel salió.

Estados visibles mínimos:

| Estado | Significado y acción |
| --- | --- |
| Pendiente | Trabajo guardado; todavía no aceptado por Windows. |
| Enviando | El conector está procesando ese ticket. |
| Enviado | Windows aceptó el trabajo; no certifica salida física del papel. |
| En espera / Error | Impedimento conocido y fuente del dato. Si el driver informa falta de papel, indicarla; si no lo informa, mostrar el error disponible sin inventarlo. |
| Revisar envío | Resultado ambiguo; revisar papel y cola local antes de pedir una copia. |
| Cancelado / Requiere revisión | No enviar automáticamente el original por cambio de estado o antigüedad. |

Reintentar automáticamente solo si hay certeza de que todavía no fue entregado a Windows, manteniendo el mismo trabajo. Si ya está en la cola de Windows por falta de papel, reponerlo continúa ese trabajo; no crear otra copia ni otro original.

Antes de despachar una copia por un envío incierto, reconciliar si el original sigue en Windows. Si sigue retenido, continuar ese original o cancelar/verificar su retiro antes de enviar otra copia; no dejar ambos preparados para salir cuando vuelva el papel. Si no se puede confirmar su retiro, conservar el aviso de incertidumbre y pedir la revisión del operador, sin prometer exclusión física que no puede garantizarse.

Después de desconexión/reinicio, no soltar una tanda histórica sin revisión: revalidar estado del pedido y de la preparación antes del despacho. **Propuesta de seguridad operativa:** los trabajos que perdieron la ventana de despacho por desconexión se retienen para revisión desde caja; un trabajo con preparación iniciada, entregado o cancelado no se imprime automáticamente como una orden nueva. La revisión permite decidir enviar los vigentes o descartarlos con auditoría. Un ticket ya aceptado por Windows puede seguir allí; su cancelación es mejor esfuerzo y nunca se presenta como papel retirado físicamente.

La venta y la preparación siguen disponibles aunque fallen conector, driver, USB o papel. Mostrar por separado la conexión del conector y el estado reportado de la impresora; que el conector esté conectado no demuestra que la impresora tenga papel.

## 9. Anulaciones y cambios posteriores

Antes del despacho, una anulación invalida originales pendientes. Si el original ya fue enviado o su envío es incierto y aún hay preparación que detener, generar un aviso separado **«CANCELADO · NO PREPARAR»** para las estaciones afectadas, con ID/revisión propios. No reimprimir el original como si fuera una nueva orden. La cancelación digital mantiene autoridad; papel y Windows no ofrecen una transacción atómica con la base.

Una comanda adicional es otro original con su secuencia. Los cambios estructurados permitidos después de confirmar requieren un aviso de modificación diferenciado con el dato cambiado y su revisión, sin volver a mandar toda la venta a preparar. El plan debe inventariar esas rutas existentes (cancelación, cantidades y localizador) antes de implementar los hooks; no habilitar ediciones nuevas ni alterar las reglas del pedido para facilitar la impresión.

## 10. Experiencia en Kybo

La información de impresión aparece como parte del pedido y su detalle en modal. Cada fila identifica estación, estado y acción de esa estación. El estado normal es discreto; los impedimentos llevan un aviso que aclara **«Pedido confirmado. La impresión está pendiente»**. No convertir un problema de papel en un error de cobro ni invitar a registrar la venta nuevamente.

Mantener campos obligatorios reconocibles, foco dentro de los diálogos, recuperación del foco al cerrar y mensajes accesibles. El modo de reimpresión conserva el pedido y los filtros. Reutilizar Autocomplete si el plan incorpora relaciones con búsqueda; no combinar búsqueda y selector separados. Los escenarios de la maqueta no se agregan al producto como controles de simulación.

La configuración de impresión vive en Configuración, con el conector, impresora vinculada y estaciones. La muestra es ilustrativa: la autenticación y capacidades se concretan en el plan; no añadir secretos recuperables a la UI.

## 11. Validación requerida antes de uso real

- Pruebas transaccionales: rollback de venta, replay, doble ventana, cuenta de mesa con varias comandas, cobro posterior sin duplicado y sucursal aislada.
- Ruteo de productos con/sin receta, sin estación, combos con componentes repartidos entre Barra/Cocina y productos iguales con modificadores distintos. Ningún padre de combo preparado adicionalmente, ninguna cantidad hija multiplicada dos veces, ninguna línea operativa omitida o duplicada entre destinos.
- Renderizado: grupo/opción/cantidad/instrucción, predeterminados resueltos, cantidades por unidad, notas largas, tildes, ñ y controles maliciosos sin ejecutar comandos de impresora.
- Copias: una estación, motivo requerido, Otro con aclaración, secuencia concurrente, respuesta perdida, originales inmutables e histórico marcado.
- Conector: exclusión, journal local, ACK perdido, caída antes/después de Windows, reinicio y reconciliación; no afirmar entrega física ni repetir trabajos ambiguos.
- Permisos/credenciales: roles y sucursales, cuenta compartida, emparejamiento expirado/reutilizado, revocación, secreto no expuesto, ningún RAW arbitrario desde el navegador.
- Cambios de pedido y recuperación: anulación antes y durante envío, cola desconectada, pedido ya en preparación/entregado y avisos sin duplicación.
- UX en PC/tablet: carrito/filtros conservados, cobro no bloqueado por hardware, foco, obligatoriedad y mensajes comprensibles. Medir latencia de confirmar antes/después.
- Prueba física en la **Hasar USB con la PC Windows del local**: impresión de ambos tickets, separación/corte, logo monocromático, caracteres españoles, modificadores, fin de papel, USB desconectado y reinicio. La maqueta y las pruebas simuladas no sustituyen esa validación.

Pruebas de datos solo en base descartable autorizada. Cualquier nueva migración en Neon requiere autorización específica después de implementar y verificar; no aplicar migraciones ni instalar/activar el conector en la PC del local por aprobar este diseño.

## 12. Propuesta visual y procedencia

La maqueta usa datos sintéticos y no consulta APIs del negocio, no cobra ni imprime. Está en `.superpowers/brainstorm/237-1793649817/content/order-tickets-v3.html`, ignorada por Git. Pestañas: «En el punto de venta», «Los tickets» y «Conexión del local». La tercera versión separa grupos/opciones de modificadores, observación de producto y nota de pedido. El estado «Sin papel» representa un reporte disponible del driver; no promete que la unidad instalada lo provea.

Fuentes técnicas consultadas el 2/11/2026:

- [Hasar P-HAS-181: USB, Ethernet, rollo, corte y ESC/POS](https://compania.grupohasar.com/producto/p-has-181/).
- [Microsoft: RAW y cola de impresión](https://learn.microsoft.com/windows-hardware/drivers/print/raw-data-type).
- [Microsoft: Print Spooler](https://learn.microsoft.com/en-us/windows/win32/printdocs/print-spooler).
- [QZ: requisitos de firma y alternativas de certificados](https://qz.io/docs/faq).
- [MDN: window.print abre un diálogo](https://developer.mozilla.org/en-US/docs/Web/API/Window/print).

Este documento reemplaza las propuestas antiguas de Ethernet e impresión solo a pedido del diseño general, según las decisiones nuevas del usuario. No transforma las decisiones de implementación propuestas aquí en requisitos previamente dictados por él; se presentan para aprobación conjunta con la maqueta.
