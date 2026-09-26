# Compras e inventario — segundo incremento

Continúa las secciones 4 y 5 del diseño general de Kybo. Francisco pidió seguir desarrollando y dejar la integración para después. Se implementa localmente sobre la base existente; no se despliega ni conecta Neon ni se cambia el sitio original. Los costos faltantes no bloquean el trabajo.

## Resultado

Registrar mercadería efectivamente recibida, convertir presentaciones a unidades base, mantener lotes y movimientos trazables y separar los pagos. El usuario puede cargar dos paquetes de 800 g, confirmar una recepción de 1.600 g, registrar un pago parcial y luego una merma sin duplicar ninguna operación al reintentar.

La implementación es un nuevo subsistema dentro del monolito aprobado, no un rediseño. Se conserva Drizzle, Better Auth y los componentes Shadcn. Opción elegida: recepciones manuales confirmadas e inmutables. Frente a editar saldos directamente, el libro de movimientos conserva las causas; frente a implementar toda la cadena de órdenes/recepciones parciales ahora, permite una entrega coherente más pequeña. Órdenes al proveedor y conciliación de recepciones parciales quedan para otra entrega: aquí toda cantidad ingresada significa recibida, nunca pedida.

## Recepción y pagos

La pantalla permite proveedor activo, fecha de recepción, comprobante externo opcional, notas y 1–30 renglones. Cada renglón tiene insumo, presentación opcional del mismo proveedor/insumo, cantidad recibida, precio final por presentación/unidad (opcional), descuento monetario del renglón (cero por defecto), lote opcional y vencimiento opcional. Una misma recepción admite varios renglones del mismo insumo con lotes diferentes. Sin presentación, la cantidad y precio se expresan por unidad base del insumo. El precio admite 6 decimales para costos por g/ml; el descuento y total usan centavos. Cada renglón redondea cantidad × precio a centavos antes de restar descuento. Cantidades y conversiones conservan 6 decimales; se rechaza una conversión que no pueda representarse exactamente o exceda el límite.

Los totales se calculan en servidor. Si falta algún precio, su costo y el total de la recepción permanecen pendientes; un cero explícito se conserva como cero. Descuento sin precio o mayor al importe bruto se rechaza. Se conserva la instantánea de nombres, unidad, presentación, factor y precios; cambios posteriores al catálogo no alteran el histórico. La UI envía `ingredientRevision` y `presentationRevision` del catálogo revisado; si cambia antes de confirmar, el servidor responde409 y exige revisar la selección. Estos campos son opcionales para clientes API que explícitamente usan los datos vigentes al confirmar. Un comprobante no vacío se normaliza (trim y mayúsculas) y se controla por proveedor para impedir doble carga. Recepciones sin comprobante se distinguen por su clave de operación.

Revisar antes de confirmar; la confirmación crea recepción, renglones, lotes, movimientos y auditoría en una transacción. No hay edición/borrado de recepciones confirmadas en este incremento. Las correcciones físicas requieren movimientos explícitos; no se ofrece anulación financiera ni una compensación automática incompleta.

Pagos registrados en tabla separada: fecha, medio activo, importe positivo y referencia opcional. No alteran stock. Pagos parciales permitidos hasta el total conocido; bloqueo de sobrepago bajo concurrencia. Un total pendiente debe completarse mediante una futura corrección auditada antes de admitir pagos: la UI explica esta limitación. Registrar el pago no procesa tarjetas ni verifica transferencias.

## Inventario

Una fila de saldo por insumo contiene cantidad física y valor de stock (nullable). Los lotes conservan entrada y remanente, fecha, unidad, vencimiento y bloqueo explícito. Las vistas muestran cantidad física y utilizable por separado; vencidos/bloqueados siguen existiendo físicamente hasta la merma. Vencimiento sin hora: por prudencia no utilizable desde el inicio de la fecha indicada en America/Argentina/Salta. Se ordenan lotes por vencimiento (sin fecha al final), sin inventar vida útil. Sin fecha se muestra «Sin fecha», no «Seguro» ni «Apto para promoción».

Movimientos disponibles: recepción; ingreso manual de stock inicial/ajuste positivo con costo opcional y motivo; merma parcial/total de un lote con motivo; conteo absoluto por lote con diferencia auditada; bloqueo/desbloqueo con motivo. Merma/conteo/bloqueo exigen revisión del lote para no sobrescribir cambios ajenos. Una merma puede dar de baja stock vencido o bloqueado, nunca más que el remanente. Un conteo no renombra unidades ni vencimiento; cantidades negativas se rechazan. Los conteos positivos sobre lotes agotados con valor desconocido mantienen costo pendiente, no heredan un precio supuesto.

Se usa promedio ponderado a nivel insumo, separado del costo de reposición del catálogo. Recepciones suman su costo neto; salidas aplican el promedio previo y conservan costo aplicado. Ajuste positivo de un lote usa promedio actual; si se desconoce, queda pendiente. Un saldo con costo desconocido no se convierte en conocido por recibir una compra valorada. Cuando el saldo llega a cero se reinicia su valor; la próxima entrada puede volver a tener costo conocido. No se cambian precios comerciales ni costos históricos.

Libro de movimientos inmutable: operación, lote/insumo, delta, costo aplicado nullable, motivo, responsable y hora servidor UTC. El saldo coincide con la suma de movimientos, y remanentes con las cantidades físicas por lote. Cambiar unidad base queda bloqueado cuando existe historial de inventario, aunque el saldo sea cero. Archivar catálogo no elimina historial; permite dar de baja lotes existentes pero impide nuevas recepciones/entradas sobre referencias inactivas.

## Seguridad, repetición y alcance

Solo admin/manager leen o modifican compras/stock. Mismo control de Origin y límite JSON que catálogo; todos los endpoints privados sin caché. Cada mutación lleva requestId UUID persistido con actor, tipo y huella del payload validado. Reintento idéntico devuelve el resultado sin repetir movimiento/pago; clave reutilizada con otro contenido o actor devuelve 409. Antes de enviar, la UI conserva URL, clave y payload exacto en sessionStorage, separados por usuario y tipo de operación. Si ese guardado falla, no envía. Tras un resultado incierto, una recarga o navegación restaura el aviso y permite reintentar manualmente el mismo envío; no editarlo silenciosamente ni iniciar otra escritura mientras falta resolverlo. No se reenvía automáticamente al entrar. Un pago recuperado conserva el destino original. No se elimina una operación pendiente por un error de autenticación o límite de intentos. Una nueva operación usa nueva clave. Esta recuperación cubre la pestaña; no es una cola offline completa ni garantiza recuperación si se cierra la pestaña o se borran sus datos. Los bloqueos de insumos se adquieren en orden estable y los cambios son transaccionales.

No se agregan OCR/fotos, WhatsApp, Fudo, Neon real, POS, consumo automático de recetas, reservas de stock, producción, caja, correcciones financieras ni promoción automática. Alertas de vencimiento se basan solo en lotes cargados; no se inventan ritmos de consumo ni recomendaciones sin historia.

## Contrato de servicio y HTTP

`createInventoryService(db, clock?)` exporta los métodos siguientes. Actor usa el tipo existente; fechas/decimales de salida son strings canónicos (punto decimal). Entradas monetarias/cantidades usan strings con formato argentino. clock opcional devuelve Date para probar vencimientos.

- `listReceipts(actor, search?) -> {rows: ReceiptSummary[], total:number}` (100 más recientes, recuento completo).
- `getReceipt(actor,id) -> ReceiptDetail`.
- `receive(actor,input) -> ReceiptDetail`.
- `pay(actor,receiptId,input) -> ReceiptDetail`.
- `getStock(actor, search?) -> StockResult` (100 insumos, recuento completo; incluye archivados con historial).
- `getLots(actor,ingredientId,offset=0) -> {rows: LotRow[], total:number}` (100, remanentes positivos primero y luego orden FEFO).
- `getMovements(actor,ingredientId,offset=0) -> {rows: MovementRow[], total:number}` (100 recientes). Los offsets son enteros de 0 a 1.000.000.
- `adjust(actor,input) -> {lot:LotRow}` para opening/waste/count/block.

GET/POST `/api/purchases`: listado / confirmar recepción (POST devuelve `{receipt}`). GET `/api/purchases/[id]`: detalle `{receipt}`. POST `/api/purchases/[id]/payments`: `{receipt}`. GET `/api/inventory`: StockResult. GET `/api/inventory/[id]?lotOffset=0&movementOffset=0`: `{lots:{rows,total},movements:{rows,total}}`, id=insumo. POST `/api/inventory/adjustments`: `{lot}`. Tipos compartidos en `src/modules/inventory/types.ts`.

## Aceptación

1. Dos paquetes de 800 g ingresan 1.600 g; dos confirmaciones con la misma clave no duplican recepción, lote, movimiento ni auditoría.
2. Edición posterior de presentación/unidad/precio no corrompe histórico; unidad con movimientos se bloquea.
3. Pago parcial modifica pendiente, sin stock; dos pagos concurrentes no sobrepagan.
4. Merma y conteo conservan responsable/motivo; revisión vieja rechaza sin alterar saldos; fallos revierten toda la transacción.
5. Vencidos/bloqueados y sin fecha se distinguen; no se elimina stock automáticamente al vencer.
6. Costo desconocido, cero y promedio ponderado se verifican con importes literales; UI conserva formularios ante error y reintentos inciertos no duplican entradas.
