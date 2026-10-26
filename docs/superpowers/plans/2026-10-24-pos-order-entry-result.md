# Toma de pedidos: resultado

## Flujo aplicado

- «Lugar de consumo»: Mostrador, Mesa y Delivery. «Forma de consumo»: Para llevar / En el local en Mostrador, En el local en Mesa y Envío / Retiro en Delivery.
- «Acciones»: cliente y localizador juntos encima del catálogo; el pie del pedido queda libre para nota, total y cobro.
- Cliente mediante el Autocomplete compartido, en línea y sin modal. Se puede elegir una ficha, escribir un nombre o continuar como ocasional. El email de un cliente nuevo es opcional; nombre/email se registran con la venta y se revierten si falla el cobro o stock.
- Las coincidencias exactas se reutilizan sin editar fichas existentes; homónimos con emails distintos se mantienen separados. La selección explícita en Autocomplete usa el identificador del cliente, evitando ambigüedad por nombre.
- Localizador automático por defecto. El número mostrado es una vista previa, con el texto «Se confirma al guardar el pedido». El servidor asigna un equipo libre en la transacción. Si están todos ocupados, la pantalla indica «Sin localizadores disponibles» y el pedido puede continuar.
- Se conserva el cambio manual y la posibilidad de volver a automático. Una selección manual que deja de estar disponible bloquea el envío para evitar entregar el equipo equivocado.
- Controles seleccionados en naranja, foco azul, bordes y tamaños táctiles coherentes. Verificado en tablet vertical y horizontal, sin desbordamiento horizontal.
- La preferencia permanente de usar Autocomplete se guardó en `AGENTS.md`; se eliminó el antiguo componente sin consumidores de búsqueda separada y select.

## Verificación

- 61 pruebas funcionales en 10 archivos, incluyendo creación/reutilización/rollback de clientes, permisos de personal, concurrencia serializada en memoria, idempotencia, localizadores, combos, stock, IVA y presupuesto de consultas del cobro.
- 11 pruebas de interfaz POS, incluyendo payload de alta sin petición extra, email inválido, homónimos, limpieza de cliente/email, disponibilidad durante el cobro y tablet de 600, 768 y 1024 px.
- 5 pruebas de Compras/Inventario para verificar el componente Autocomplete compartido.
- TypeScript y ESLint de los archivos modificados: sin errores.
- Revisión independiente y regresiones roja/verde para conservar email al salir de un nombre exacto, limpiar email al borrar un nombre y adquirir el lock de sucursal antes de devolver/cambiar una asignación.

La concurrencia PostgreSQL entre sesiones se revisó estáticamente: PGlite no permite certificarla. No se ejecutaron ventas ficticias ni movimientos en Neon, ni migraciones. Sin cambios en `.env`, commit o push.

Registros en `.next-e2e/pos-entry-{final-tests,ui-final,shared-autocomplete,types-final,lint-final}.log`; capturas `.next-e2e/pos-entry-desktop.png` y `.next/pos-tablet-{portrait,landscape,order}.png`.
