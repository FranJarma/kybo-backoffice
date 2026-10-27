# Pedidos a proveedores y recepciones parciales

## Acuerdo y alcance

El usuario aprobó implementar el circuito explicado en la conversación: registrar proveedor, insumos, cantidades y llegada estimada; confirmar el pedido sin sumar stock; recibir todo o una parte; considerar el remanente oportuno en las alertas y mantener el seguimiento de las entregas atrasadas. Se amplía el diseño de Operación del día de 2026-10-22 y el módulo de alertas de Bolivia de 2026-10-23.

Se integra en Inventario → Compras, con pestañas Pedidos a proveedores y Recepciones. Encargado y administrador administran el circuito. No se contacta al proveedor ni se inventan pedidos reales. La recepción sin pedido conserva su funcionamiento.

## Enfoque

Un documento de pedido separado del comprobante de recepción conserva lo pedido, recibido y cancelado. Reutilizar una recepción anticipada contaminaría el stock físico; descontar una cantidad manual sin documento perdería el seguimiento y las recepciones parciales. Se elige el documento separado, confirmado explícitamente, enlazado a las recepciones existentes en la misma transacción.

Estados: borrador, pedido, recibido parcialmente, recibido y cancelado. Se guardan proveedor y artículo/presentación/unidad/conversión como snapshots. Cantidades exactas de seis decimales; las presentaciones se piden en packs enteros. La fecha estimada puede desconocerse, se muestra explícitamente y nunca aporta cobertura en ese caso. Cambiar fecha y cancelar el remanente requiere revisión y motivo. Cancelar no revierte lo recibido.

## Recepción

Cada línea recibida identifica una línea del pedido. El servidor comprueba sucursal, proveedor, artículo y cantidad pendiente bajo bloqueo del pedido. Conserva la conversión confirmada aunque cambie el catálogo. Recepción, lotes, movimientos, remanente, revisión, auditoría y tarea se actualizan juntos. El requestId evita duplicados, incluso tras un resultado de red incierto. Una recepción mayor al pendiente o con revisión antigua falla sin cambios parciales. Costos, flete y pagos siguen el circuito actual de recepciones; confirmar un pedido no genera deuda ni pago.

## Proyección y tareas

Se conservan cantidad y cobertura físicas; se añaden entradas pendientes y cobertura proyectada. Solo pedidos confirmados/parciales de la sucursal con fecha hoy o futura aportan remanente. La llegada sin hora ocurre al final del día. Borradores, cancelados, fechas desconocidas o vencidas no cubren riesgos. Una entrada tardía nunca borra un faltante anterior; la sugerencia cubre demanda no atendida dentro del objetivo, no resta ciegamente todo lo pedido. El motor FEFO sigue considerando vencimientos y reservas.

Cada pedido confirmado tiene una tarea de recepción vinculada, asignable desde el tablero, con fecha de llegada y enlace directo al pedido. La recepción parcial mantiene la tarea; recibir todo la finaliza; cancelar cierra el remanente. Reconciliar vuelve a evaluar prioridad y sugerencias, sin mover stock. La cobertura temporal requiere una tasa de consumo: los avisos genéricos por mínimos de insumos sin tasa conservan su advertencia de stock físico, junto con la tarea del pedido pendiente; no se promete cobertura desconocida. Los ocho insumos de Bolivia ya tienen tasa configurada.

## Decisiones de implementación

Se mantiene la tecnología, los colores Kybo y los componentes existentes, con controles táctiles y resumen pedido/recibido/pendiente. Se recibe por defecto en Depósito principal cuando está disponible, permitiendo elegir otra ubicación. Se usa consumo manual ya configurado; histórico, cotizaciones y pagos anticipados quedan fuera de este circuito.

La migración nueva es 0027. Las pruebas usan exclusivamente PGlite descartable. Aplicarla a Neon requiere autorización específica nueva; se prepara y prueba todo antes de pedirla. Se conserva la autorización previa de push.
