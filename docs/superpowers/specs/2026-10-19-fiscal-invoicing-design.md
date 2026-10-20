# Propuesta de facturación fiscal para Kybo

Estado al 19/10/2026: IVA configurable, precios finales y comisión porcentual por medio de pago implementados; migración aditiva 0021 aplicada en desarrollo. La emisión fiscal continúa como propuesta y no está implementada ni activada. Ver [verificación de IVA y comisiones](../../verification-vat-payment-fees.md).

## Contexto confirmado

Kybo opera como responsable inscripto y actualmente emite facturas con ARCA. El usuario confirmó que los precios cargados no incluyen IVA y quiere incluirlo al determinar el precio final. Las alícuotas por producto no están confirmadas: mencionó 21% y 10,5% como posibilidades. También desea considerar las comisiones del posnet. La toma de pedidos es táctil y debe mantener pocos pasos. Hay varias sucursales, cuentas de mesa, ventas de mostrador, delivery, productos con modificadores y combos. El pago admite efectivo, tarjeta, transferencia y pagos divididos.

El repositorio registra ventas y cobros con reintentos idempotentes, IVA por producto y copias de sus importes en cada venta. Todavía no tiene emisor fiscal, documentos fiscales ni conexión con ARCA. Los costos de ingredientes y las mermas no definen el IVA de los productos vendidos.

## Resultado propuesto

Una factura documenta la venta completa y se relaciona con todos sus cobros. No se configura un indicador «factura sí/no» por medio de pago. Una venta pagada mitad en efectivo y mitad por transferencia no debe producir dos facturas por esa división.

Para el caso habitual de consumidor final, el comprobante propuesto es factura B. Cuando corresponda factura A, se solicitan y validan los datos fiscales del receptor. La clase depende de emisor, receptor y habilitaciones, no del medio de pago. Fuente: [clases de comprobantes de ARCA](https://www.arca.gob.ar/facturacion/regimen-general/comprobantes.asp).

El cobro y la emisión tienen estados distintos. Un error fiscal no debe crear otro cobro, descartar una venta pagada ni aparentar que existe una factura autorizada. La caja muestra el estado fiscal real y el encargado dispone de una lista de comprobantes pendientes o rechazados.

## Experiencia de caja

1. Elegir los productos y opciones, como hasta ahora.
2. En el cobro, seleccionar el medio y completar vuelto o división solo si hace falta.
3. Con la integración fiscal habilitada, mostrar un resumen compacto del receptor: consumidor final o datos fiscales. Pedir los datos exigibles según las reglas vigentes antes de enviar el comprobante; no mantener umbrales de identificación codificados en la interfaz.
4. Confirmar el cobro y solicitar la factura con una identidad estable de operación.
5. Mostrar por separado «Cobro registrado» y «Factura autorizada» o el estado fiscal que corresponda. Imprimir o descargar el documento autorizado sin volver a cobrar.

Para cuentas de mesa con pagos parciales no se emite automáticamente una factura por cada abono. El cierre fiscal debe definirse por la venta final: antes de emitir, se fija su contenido y se impide agregar consumos sobre el documento ya autorizado. Cualquier anticipo o caso que requiera documentación intermedia se define expresamente antes de habilitarlo.

La impresión de un PDF o ticket interno no se presenta como autorización fiscal. El documento de una factura electrónica autorizada incluye sus datos de autorización y representación reglamentaria. La emisión a través de un controlador fiscal físico es otra integración; esta propuesta usa factura electrónica mediante webservices de ARCA.

## Datos y responsabilidades

- **Emisor fiscal:** CUIT, razón social, condición fiscal y datos legales de emisión. No se deduce de la cuenta de usuario.
- **Punto de venta fiscal:** relación con emisor, sucursal y ambiente. Debe estar habilitado para el servicio elegido; no se reutiliza por suposición el número usado actualmente en otro sistema de ARCA.
- **Tratamiento impositivo del producto:** alícuota y categoría fiscal correspondientes, vigencia y criterio de precio con/sin IVA. No asumir 21% para todo el catálogo ni alterar los precios existentes por defecto.
- **Receptor:** identificación, condición fiscal y datos requeridos según comprobante. El cliente comercial y su información fiscal se vinculan, pero una factura conserva su propia copia de los datos utilizados.
- **Documento fiscal:** venta y revisión de origen, emisor, receptor, sucursal, ambiente, tipo, punto de venta, número, importes netos/IVA/otros conceptos, total, estado, autorización y vencimiento. Líneas y datos fiscales inmutables después de solicitar autorización.
- **Intentos y auditoría:** identidad idempotente, huella de solicitud, usuario, fechas, respuestas relevantes y errores sanitizados. Nunca registrar claves privadas, tokens de acceso o clave fiscal.

Los importes de factura se calculan en el servidor a partir de los precios realmente vendidos, incluyendo modificadores y correcciones autorizadas. Los redondeos deben conservar el total de la venta. Para combos o descuentos que involucren tratamientos fiscales diferentes se necesita una regla explícita y comprobable de distribución antes de habilitarlos; no inferirla de los costos de receta.

## Precio final, IVA y comisión de cobro

La ficha debe distinguir el precio base neto, el tratamiento de IVA confirmado y el precio final resultante. Por ejemplo, $10.000 netos con una alícuota confirmada del 21% dan $12.100 finales. En el punto de venta y la carta se usa el precio final a pagar; no se agrega IVA sorpresivamente al abrir el cobro. La normativa de exhibición contempla tanto el importe total final como la información de precio sin impuestos nacionales: [Resolución 4/2025](https://www.argentina.gob.ar/normativa/nacional/resoluci%C3%B3n-4-2025-408455/texto).

La implementación conserva los precios y adicionales existentes como netos y muestra una vista previa final por canal al configurar IVA. No reescribe importes ni ejecuta una conversión repetible sobre el catálogo. Caja valida la revisión del producto; modificadores y combos reciben IVA una sola vez sobre el precio neto completo. Las ventas históricas conservan sus importes originales y las nuevas guardan su alícuota y desglose. Los productos existentes sin alícuota quedan pendientes de configuración.

La comisión del proveedor de cobro es un costo comercial. La primera implementación permite configurar el porcentaje total por medio de pago y conserva su estimación en cada cobro. Vacío significa desconocido; 0% es explícito. Importes fijos, condiciones por cuotas, impuestos desagregados y conciliación de liquidaciones quedan para una ampliación. No se confunden comisiones con retenciones o percepciones recuperables ni se presenta el neto estimado como una liquidación real.

El cálculo de precio sugerido puede considerar el costo esperado de cobro, pero no debe sumar automáticamente un recargo al consumidor al seleccionar tarjeta. Para un solo pago, la regla publicada contempla igual precio al contado y con tarjeta; la financiación en cuotas requiere otro tratamiento: [Precios transparentes](https://www.argentina.gob.ar/node/159872), [Ley 25.065, artículo 37](https://www.argentina.gob.ar/normativa/nacional/norma-55556/actualizacion). La definición propuesta mantiene un precio final de carta y muestra la incidencia de la comisión en los resultados del negocio.

La alícuota corresponde al producto/operación y debe confirmarse con el tratamiento fiscal aplicable; no se elige entre 10,5% y 21% por conveniencia ni según el costo de ingredientes. No se modifica el catálogo actual aplicando una tasa general mientras esa clasificación esté pendiente.

## Integración y recuperación

La propuesta usa WSAA para autenticación y WSFEv1 para autorización. ARCA publica WSFEv1 para comprobantes A/B/C/M sin detalle de ítems y ofrece entornos de homologación. El detalle comercial impreso en Kybo procede de la copia inmutable de la venta; los totales enviados deben coincidir exactamente. Fuentes: [webservices de factura electrónica](https://www.arca.gob.ar/ws/documentacion/ws-factura-electronica.asp), [manuales de homologación](https://www.arca.gob.ar/fe/ayuda/homologacion_externa.asp).

La autenticación requiere certificados X.509 y la asociación al servicio. Homologación y producción usan configuraciones separadas. No se automatiza el ingreso al portal con la clave fiscal personal. Los certificados y claves se administran en el servidor mediante almacenamiento de secretos del alojamiento; nunca se envían al navegador ni se incorporan al repositorio. Fuente: [documentación WSAA de ARCA](https://www.arca.gob.ar/ws/documentacion/wsaa.asp).

Flujo propuesto: `pendiente → enviando → autorizada / rechazada / por conciliar`.

- El guardado de la venta y la solicitud pendiente se coordinan en una transacción local; el envío externo se procesa después mediante trabajo persistente recuperable. No dejarlo en una promesa sin esperar dentro de una función de Vercel.
- Una identidad única por documento evita que tocar dos veces «Confirmar» o repetir una solicitud produzca otra factura.
- La numeración se coordina por emisor, ambiente, punto de venta y tipo de comprobante; no usar un contador del navegador ni asumir que ARCA no pudo procesar un envío que terminó en timeout.
- Si la respuesta se pierde, se consulta y concilia el comprobante con ARCA antes de volver a enviarlo. No tomar un número nuevo para resolver un estado desconocido.
- Un rechazo deja el cobro intacto y requiere corregir los datos fiscales con trazabilidad. Una autorización se conserva como documento inmutable.
- Cancelar una venta ya facturada debe coordinar devolución y documentación fiscal de reversión. No borrar ni modificar una factura autorizada; el flujo de notas de crédito se incluye antes de activar producción.

## Verificaciones antes de activar

Pruebas de importes con IVA incluido o excluido; combinaciones de alícuotas y redondeo; opciones y combos; factura B y A según receptor; pago dividido y parcial; cierre de mesa; permisos por sucursal; doble envío; concurrencia sobre la numeración; rechazo; timeout después de autorización; recuperación tras reinicio; reimpresión y nota de crédito.

Primero se ejecuta homologación, verificando importes y representación con la configuración fiscal confirmada. La conexión de producción y cualquier emisión real se habilitan por separado cuando estén listos los datos y accesos correspondientes.

## Información necesaria para continuar

La condición de responsable inscripto, el uso actual de ARCA y los precios actuales sin IVA están confirmados. Faltan las alícuotas/categorías por producto y las condiciones/comisiones reales de los proveedores de cobro. También se necesitan los datos del emisor y el punto de venta para webservices, y configurar certificados y autorización en homologación. Estos secretos no deben compartirse por el chat.

La implementación de IVA y comisiones no crea un comprobante ni emite contra ARCA. La siguiente etapa es revisar y completar el diseño de emisión, incluida la distribución fiscal de combos con tratamientos distintos, antes de conectar homologación.
