# Comprobantes de tarjeta en el cierre de caja

Mostrar en el paso Posnet los cobros y devoluciones con tarjeta de la jornada abierta, para compararlos con el cierre de lote. Reutilizar el libro de movimientos, que ya conserva venta, medio de pago, importe, comprobante y fecha; sin nuevas consultas por venta, migraciones ni cambios financieros.

- [x] Probar el listado en escritorio y celular: comprobantes con ceros iniciales, devolución negativa, datos históricos sin referencia y exclusión de otros medios/jornadas/sucursales.
- [x] Integrar una lista visible y desplazable junto al resumen del posnet, con venta, hora local, medio, comprobante e importe. Identificar el comprobante original en devoluciones.
- [x] Verificar el cierre existente, las referencias del libro, tipos y estilo. Inspeccionar capturas responsive.

Sin commit ni push. Las pruebas de interfaz simulan las respuestas y no registran cobros ni cierres reales.

## Resultado y verificación

`CashCardPayments` utiliza los movimientos del snapshot y filtra por jornada, sucursal y tarjeta. Ordena por fecha del movimiento, incluyendo cobros posteriores a medianoche. Se integra al cierre y a la carga posterior del comprobante durante la revisión del encargado. Los cobros anteriores sin referencia muestran «Sin comprobante registrado»; las devoluciones indican que la referencia pertenece al cobro original. El listado permite desplazamiento con teclado y limita su altura para jornadas con muchas operaciones.

Prueba inicial observada en rojo por ausencia del listado. Pasaron 20 pruebas en tres suites de cálculos, cierre y ventas con caja; también 30 pruebas de navegador de cierre y comprobantes individuales, incluyendo 390/1024/1440 px y una jornada simulada de 60 cobros con referencia de 120 caracteres. Se inspeccionaron capturas de escritorio y celular. La prueba de integración confirma que el snapshot entrega venta, importe y referencia real del libro. Tipos, ESLint de archivos afectados y `git diff --check`: correctos.

No se modificaron consultas, tablas ni reglas de cierre. Sin migraciones, movimientos reales, commit ni push.
