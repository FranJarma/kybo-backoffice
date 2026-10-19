# IVA configurable y comisiones — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Configurar IVA por producto y comisión por medio de pago, cobrar siempre precios finales y conservar las condiciones de cada venta.

**Architecture:** Los precios base de catálogo y los adicionales se conservan netos, conforme a lo confirmado por el usuario. Una función compartida calcula el precio final una sola vez sobre el total neto configurado. Las nuevas líneas guardan su IVA y desglose; los cobros guardan la comisión vigente y su neto estimado, sin reducir el importe pagado. Datos históricos permanecen sin clasificación retrospectiva.

**Tech Stack:** Next.js 16, React 19, Drizzle/PostgreSQL, BigInt, Vitest/PGlite y Playwright/Chrome.

**Spec:** `docs/superpowers/specs/2026-10-19-fiscal-invoicing-design.md`, limitado al alcance aprobado: IVA/precios y comisiones; ARCA queda fuera.

## Global Constraints

- Preservar las modificaciones locales y `.env`; sin commits ni push.
- No asignar alícuotas ni comisiones desconocidas por suposición.
- Un producto sin IVA configurado se muestra pendiente y no se cobra como si fuera 0%.
- La comisión es costo del negocio, nunca recargo automático al cliente.
- El cálculo compartido usa centavos y puntos básicos enteros; neto + IVA = total.
- Los combos usan la alícuota configurada del producto combo; sus componentes son composición incluida, no importes gravados otra vez. La futura factura con tratamientos mixtos exige un diseño específico antes de conectarse a ARCA.
- Las comisiones configuradas representan el porcentaje total de costo del proveedor. No se presumen retenciones ni se presentan estimaciones como liquidaciones conciliadas.

## Review Focus

- Opciones de pocos centavos: redondear una sola vez el precio neto completo, sin divergencias entre caja y servidor.
- Cambios de IVA con caja abierta: validar versión de precio y alícuota; no aceptar una configuración vieja por coincidencia accidental del total.
- Comisiones sin definir y 0% explícito: distinguir pendiente de costo cero.
- Combo con productos incluidos: no sumar precios individuales ni gravar dos veces adicionales.
- Anulaciones e historial: no inventar IVA previo ni asumir devolución de comisiones al reintegrar el importe.

### Task 1: Cálculo monetario y esquema aditivo

**Files:** Crear `src/modules/pricing/amounts.ts`, `drizzle/0021_product_vat_payment_fees.sql` y pruebas `tests/pricing-amounts.test.ts`; modificar esquemas comercial/ventas, journal y helper de base descartable.

- [x] Prueba roja de conversión 21%/10,5%, desglose inverso, redondeo, límites, comisión pendiente/0% y tasa inválida.
- [x] Implementar `priceWithVat(net, rate)`, `vatBreakdown(gross, rate)` y `paymentFee(gross, percent)` con strings monetarios canónicos.
- [x] Agregar IVA nullable en productos; comisión nullable en medios; copias de IVA y comisión en líneas/cobros. Restricciones coherentes y valores antiguos null.
- [x] Probar migración descartable: conserva importes y filas históricas, sin elegir tasas.

### Task 2: Catálogo y precios visibles

**Files:** `src/modules/catalog/validation.ts`, `definitions.ts`, `service.ts`, `src/components/catalog-manager.tsx`, nuevo componente de vista previa de precio; pruebas de integración de catálogo.

- [x] Prueba roja de tasas aceptadas/rechazadas, edición sin doble incremento y comisión desconocida frente a 0%.
- [x] Agregar campos y ayudas. Edición de precios netos con vista previa final por canal; el listado presenta precio final.
- [x] Conservar precios netos existentes; configurar IVA los habilita a la venta sin una conversión destructiva.

### Task 3: Caja, opciones y combos

**Files:** lookup de productos, configuración pública de recetas, ruta de combo, configuradores de producto/combo, servicio y tipos de ventas, listado de recetas.

- [x] Prueba roja: venta 10.000 netos a 21% cobra 12.100; opciones y combo coinciden entre navegador y servidor.
- [x] Exponer neto/rate y final. Los datos sin IVA quedan pendientes y no seleccionables; validar en servidor aunque el cliente sea viejo.
- [x] Calcular el total neto de base + opciones antes de IVA; guardar desglose y revisión fiscal en la línea. Historial anterior sigue null.
- [x] Probar modificación de IVA durante la venta, componentes incluidos y redondeo.

### Task 4: Comisión y trazabilidad

**Files:** servicio/consultas/tipos de ventas y detalle de venta; pruebas de cobros.

- [x] Prueba roja: dos medios con tasas distintas, comisión sobre importe efectivamente cobrado, reintento sin duplicados y cambio posterior que no altera el historial.
- [x] Guardar comisión vigente, costo y neto estimado en cada cobro. No modificar total, pago recibido ni stock por esa comisión.
- [x] Mostrar información al encargado. Devoluciones no presumen devolución de la comisión; importes históricos desconocidos se indican pendientes.

### Task 5: Verificación y activación de desarrollo

**Files:** script de aplicación acotada, pruebas de migración/integración y navegador, documentación de verificación.

- [x] Ejecutar pruebas enfocadas, tipos y lint.
- [x] Recorrido táctil: ficha IVA/comisión, precio final en carta, opciones y consulta histórica. Pago dividido y comisiones distintas verificados en integración.
- [x] Verificar migración en solo lectura y aplicar en desarrollo únicamente dentro de la autorización previa para migraciones de desarrollo; comprobar preservación de datos.
- [x] Registrar resultados, pendientes de configuración y limitaciones. No emitir contra ARCA ni alterar `.env`.

## Resultado de ejecución

Completado el 19/10/2026. Migración 0021 aplicada en desarrollo con preservación verificada de 12 tablas. Permanecen pendientes de configurar 20 productos y 4 medios de pago. Pruebas: 55/55 en 10 archivos, 4/4 recorridos de navegador, repetición visual de IVA aprobada, comprobación de tipos y lint aprobados. La configuración pública conserva dos lecturas. Revisión independiente sin defectos, con sus escenarios de redondeo y revisión incorporados a pruebas. Ver [registro de verificación](../../verification-vat-payment-fees.md). Sin commits, push ni emisión ARCA.

