# Detalle de venta sin perder la caja

El usuario aprobó convertir el detalle en un modal amplio, conservar pedido/filtros al cerrarlo y dejar el trabajo sin commit ni push.

- Abrir desde Historial, Última venta, cuenta de mesa o localizadores sin sustituir la superficie de origen. El borrador, cliente, notas, localizador, selección de productos y filtros permanecen montados.
- Modal casi completo en tablet; cabecera/cierre y acciones visibles, cuerpo con scroll propio. Cabecera con venta, cliente, estado y total; productos con su preparación/entrega integrada. Cobros y detalles financieros se despliegan a demanda; anulación secundaria y con permisos vigentes.
- Conservar acceso directo por `?account=`. Cambiar ese parámetro no debe remontar SalesManager. Cerrar elimina el parámetro y devuelve foco sin desplazar el contexto.
- Las mutaciones del detalle actualizan solo esa venta. Cobrar/anular una venta consultada no borra el pedido de otro cliente. Agregar un pedido a mesa preserva el borrador anterior para recuperarlo al terminar/cancelar ese modo.
- Lectura lenta o fallida: cierre disponible y reintento dentro del modal; respuestas tardías no reabren ni reemplazan otro detalle. Operación enviada o incierta: no cerrar el contexto hasta confirmar/reintentar.
- Reutilizar servicios, permisos, idempotencia, Autocomplete y controles financieros existentes. No cambiar inventario, API/esquema, `.env` ni datos reales. Sin commit ni push.

La vista separada pierde contexto; un panel lateral angosto obliga a apilar demasiado contenido. Se aplica el modal amplio aprobado, manteniendo las confirmaciones necesarias de cobro/anulación.
