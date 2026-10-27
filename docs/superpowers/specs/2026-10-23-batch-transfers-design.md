# Traslados con una sola confirmación

## Objetivo
El encargado agrega los insumos a una lista en memoria y confirma todo una sola vez. Agregar, corregir o quitar renglones no reserva ni mueve inventario.

## Comportamiento acordado
- Conservar Depósito principal como origen predeterminado, Cambiar origen, destinos sin sucursal redundante y los cinco motivos aprobados. Otro motivo requiere aclaración.
- Cada insumo tiene su propio destino. El usuario aprobó sugerirlo desde los mínimos de reposición: elegir únicamente una ubicación activa, distinta del origen y dentro de la sucursal. Sin mínimo o con varios destinos, pedir selección manual. Permitir corregir el destino de cualquier renglón.
- Cargar cantidades en litros, kilos o unidades, sumar repeticiones del mismo insumo/destino con precisión exacta y permitir editar o quitar renglones.
- Confirmar traslado envía todos los renglones en una sola solicitud. Un insumo todavía seleccionado en el editor no puede omitirse silenciosamente.
- Los traslados internos quedan recibidos al confirmar cuando físicamente llegaron a sus destinos. Entre sucursales, la confirmación registra el despacho; la recepción se mantiene en destino.
- Si falla cualquier renglón o destino, revertir toda la operación. Conservar la lista ante errores y vaciarla solo después de su propia confirmación exitosa.
- Los reintentos conservan la identidad de operación. Los clientes anteriores y las reservas existentes mantienen su comportamiento.

## Enfoque y alternativas
Un formulario React independiente conserva el borrador y un comando POST /api/transfers/batch agrupa los renglones por destino bajo una transacción y operación común. Reutilizar las funciones actuales de reserva/despacho, sin migraciones. La tabla de mínimos existente aporta las sugerencias de destino.

Se descarta enviar un traslado por renglón porque conserva confirmaciones repetidas. Se descarta encadenar solicitudes de reserva y despacho desde el navegador porque permite resultados parciales. El comando atómico cumple la confirmación única solicitada incluso para varios destinos.

## Límites
Hasta 100 renglones por lote. El borrador vive en la pantalla; la protección de reintentos conserva el envío pendiente. No modificar datos reales ni aplicar migraciones durante las pruebas.
