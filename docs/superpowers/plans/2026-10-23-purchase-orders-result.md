# Resultado — pedidos a proveedores

## Circuito implementado

Inventario → Compras contiene Pedidos a proveedores y Recepciones. Se registra un borrador con proveedor, insumos y presentaciones, fecha de pedido, llegada estimada opcional y notas. Confirmar el pedido no mueve stock ni genera pagos. Desde el pedido se registra cada recepción usando el circuito actual de costos, flete, lotes y pagos. Puede recibirse una parte y mantener el remanente, cambiar la fecha con motivo o cancelar lo pendiente sin alterar lo recibido.

Operación del día agrega una tarea de recepción por pedido confirmado, con responsable asignable, fecha y enlace al documento. Las alertas de Bolivia usan solo el remanente de pedidos confirmados con fecha vigente, al final del día de llegada. Se muestran cobertura física y proyectada por separado. Una llegada tardía conserva los faltantes previos; una fecha vencida o desconocida exige seguimiento y no promete cobertura. El tablero se concilia al abrirlo y al actualizarlo.

## Integridad y revisión

Revisiones, bloqueo del pedido e idempotencia impiden repetir una recepción o superar lo pendiente, incluso con envíos simultáneos. Referencias de otra sucursal/proveedor/línea se rechazan. El pedido conserva sus unidades y conversión aunque cambie una presentación. Se protegen unidad base y modalidad de inventario del insumo cuando existen pedidos, con comprobaciones defensivas al confirmar y recibir.

Revisión independiente por `purchase_orders_review` (gpt-6-astra): ningún hallazgo crítico, uno importante de compatibilidad corregido con seis regresiones RED→GREEN, uno menor pendiente. Sin comportamientos declinados para juzgar.

Detalle menor pendiente: la tarea de recepción todavía ofrece “Cancelar tarea”; el servidor lo rechaza y dirige a Compras. La cancelación efectiva del remanente está disponible en el pedido. No se pierde stock ni se cancela el pedido al intentar esa acción.

## Verificación

- 61 pruebas de pedidos, recepción, proyección, API, stock, flete y conciliación aprobadas.
- Seis pruebas de pantalla aprobadas a 600, 768 y 1024 px: circuito de pedidos y pantalla de alertas, con componentes reales y respuestas simuladas. Se comprueban borrador, confirmación, llegada parcial, remanente y fecha. Sin pedidos reales de demostración.
- TypeScript, lint de fuentes afectadas, Prettier y revisión del diff aprobados. Build Webpack aprobado; última compilación de verificación en carpeta aislada.
- La suite general final dio 632 pruebas aprobadas, una fallida y 86 omitidas (719; 123 archivos aprobados, 10 fallidos y dos omitidos). Conserva errores anteriores de fixtures legacy en `catalog.test.ts`, `inventory.test.ts`, `modifiers-schema.test.ts`, `modifiers.test.ts`, `preparation.test.ts`, `production.test.ts`, `recipes.test.ts` y `sales.test.ts`, que intentan finalizar la transición 0008 sin aplicar el mapeo. `data-model.concurrency.test.ts` requiere una base PostgreSQL exclusiva no configurada; nunca usa Neon como alternativa. `validation.test.ts` espera un objeto sin el campo `stockTracked` incorporado previamente. No se afirma que la suite general esté verde. Ninguna prueba del circuito nuevo falló en esta corrida final.
- `pnpm lint` global recorre copias y compilados ignorados dentro de `.local` y falla allí; el lint dirigido a las fuentes de esta entrega pasa. No se modificó la configuración global para ocultar esos archivos.

## Decisiones tomadas

1. Reutilizar la rama y el checkout existentes, ya limpios y usados por la app local. El costo de esa decisión es compartir la misma rama de trabajo, sin aislamiento adicional.
2. Implementar el circuito aprobado y el diseño anterior de abastecimiento, sin repetir la aprobación del diseño ni agregar histórico/cotizaciones/pagos anticipados. Si se necesita otro alcance, deberá ampliarse por separado.
3. Mantener advertencias de mínimos físicos para insumos sin consumo estimado: una ETA sola no permite asegurar cobertura. El encargado puede necesitar revisar esos avisos junto al pedido; los ocho insumos de Bolivia sí tienen tasa configurada.
4. Reutilizar el formulario actual de recepciones, en lugar de crear un segundo formulario específico de pedidos, para conservar costos, flete, lotes y pagos. Sus cambios futuros deben mantener también el modo vinculado al pedido.

## Activación

El usuario autorizó expresamente aplicar únicamente 0027 en Neon. Se aplicó con `scripts/apply-purchase-orders.ts`, verificando el historial completo, bajo transacción y bloqueo, y comparando fingerprints de las tablas previas. Resultado: migración aplicada, módulo disponible y contenido existente preservado.

La verificación posterior de solo lectura, el 2026-10-23 a las 21:30 UTC, confirmó que los servicios reales de Compras y alertas funcionan con la nueva estructura, que las ocho reglas de Bolivia siguen disponibles y que las tres tablas nuevas están vacías. No se crearon pedidos ni recepciones de demostración, no se movió stock y `.env` quedó intacto. Evidencia local en `.next-e2e/purchase-orders-activation-verified.json`.
