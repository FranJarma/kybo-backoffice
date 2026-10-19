# Product Combos Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans or superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Execution method pending user selection.

**Goal:** Vender combos de productos existentes reutilizando sus modificadores, recetas, cantidades y mermas.

**Architecture:** Una línea comercial contiene el precio del combo y referencia una definición publicada e inmutable. Sus líneas hijas representan los productos elegidos y conservan las versiones y los snapshots operativos existentes; únicamente ellas reservan y consumen stock. Se reutilizan configuración, aritmética decimal, permisos, idempotencia y preparación actuales.

**Tech Stack:** Next.js 16.3.6, React 19, TypeScript, Drizzle/PostgreSQL, Zod, Vitest/PGlite y Playwright existentes; sin dependencias adicionales.

**Spec:** `docs/superpowers/specs/2026-10-16-product-combos-design.md` (aprobada).

## Global Constraints

- No se requiere volver a registrar ningún waffle, gaseosa, receta o grupo modificador existente.
- No se permiten combos dentro de combos ni referencias a sí mismo.
- En esta primera versión se elige exactamente un producto por grupo, con una cantidad entera fija por unidad de combo.
- La línea comercial del combo no crea una reserva, consumo ni comanda propia.
- No se hace commit ni push como parte de esta implementación sin una nueva solicitud.
- No tocar `.env`, contraseñas ni cambios pendientes de autenticación/sucursales. Trabajar sobre su estado actual, sin resets ni reemplazos.
- Leer las guías aplicables de `node_modules/next/dist/docs/` antes de modificar componentes o rutas.
- Migración aditiva posterior a 0017; comprobar historial antes de aplicarla. Las pruebas usan bases desechables, nunca la base del local.
- Usar importes decimales existentes, cantidades enteras y redondeos existentes; mostrar como máximo dos decimales.

## Review Focus

- Dos combos distintos del mismo producto no deben fusionar sus elecciones en el carrito: tarea 3.
- Una publicación concurrente de receta o combo debe rechazar el pedido obsoleto, sin reservas parciales: tarea 2.
- Dos grupos pueden referenciar el mismo producto: mantener elecciones independientes y sumar correctamente la demanda compartida: tareas 2 y 4.
- Un componente vendido dentro del combo no exige sumar su precio individual ni debe contarse como venta gratuita: tareas 2 y 4.
- Los costos desconocidos y cambios de ingredientes referenciados deben propagarse al combo y a su caché: tarea 5.

## Interfaces compartidas

Crear `src/modules/combos/types.ts` con:

- `ComboDefinition`: `{ id: string; productId: string; revision: number; groups: ComboGroup[] }`.
- `ComboGroup`: `{ id: string; name: string; position: number; quantity: number; options: ComboOption[] }`.
- `ComboOption`: `{ id: string; productId: string; position: number; surcharges: Record<SaleChannel, string> }`.
- `ComboChoice`: `{ groupId: string; optionId: string; expectedFulfillmentVersionId: string; expectedRecipeVersionId: string | null; modifiers: Selection[] }`.
- `ResolvedCombo`: `{ versionId: string; unitPrice: string; children: ResolvedComboChild[] }`.
- `ResolvedComboChild`: `{ groupId: string; optionId: string; productId: string; name: string; quantity: number; fulfillmentVersionId: string; recipeVersionId: string | null; composition: ResolvedComposition }`.

`quantity` en la definición es por unidad de combo; en la hija resuelta es cantidad de combos × cantidad del grupo. El adicional de la opción y los recargos de modificadores se multiplican por la cantidad del grupo, luego por la cantidad de combos al calcular el total de la línea comercial.

Límites iniciales: 1–10 grupos, 1–50 opciones distintas por grupo, cantidad 1–99 por grupo. La expansión completa del pedido se limita a 500 líneas físicas y 999 unidades por línea; los excesos se rechazan antes de reservar stock, respetando la restricción vigente de `sale_lines`.

## Tarea 1: Definiciones publicadas y editor de combos

**Crear:** `src/db/combo-schema.ts`, `drizzle/0018_product_combos.sql`, `scripts/apply-product-combos.ts`, `src/modules/combos/{types,validation,service}.ts`, `src/app/api/products/[id]/combo/route.ts`, `src/components/products/combo-tab.tsx`, `tests/combos-definition.integration.test.ts`.
**Modificar:** `src/db/{schema,business-schema,sales-schema}.ts`, `drizzle/meta/_journal.json`, `src/modules/catalog/{definitions,validation,service,types}.ts`, `src/components/catalog-manager.tsx`, `tests/helpers/data-model-database.ts`.

**Interfaces:** `getCombo(db, actor, productId): Promise<ComboDefinition | null>`; `publishCombo(db, actor, productId, raw): Promise<ComboDefinition>`. Publicación exige permisos de catálogo y `requestId` + revisión esperada, con auditoría e idempotencia existentes. Borrador en el formulario; persistencia de versiones solo al publicar, como recetas.

- [ ] Escribir pruebas: publicación con Classic/Salah existentes no crea recetas ni ingredientes; republicar crea otra versión; repetir `requestId` no duplica; staff no publica; rechazar combos anidados, autorreferencias, opciones duplicadas por grupo y publicaciones obsoletas.
- [ ] Ejecutar `node node_modules/vitest/vitest.mjs run tests/combos-definition.integration.test.ts` y comprobar fallo por funcionalidad ausente.
- [ ] Implementar tablas `combo_versions`, `combo_groups`, `combo_options`, versión activa y `products.kind` (`individual` por defecto). Agregar relaciones y restricciones para versiones/grupos/opciones. Las versiones publicadas no se actualizan.
- [ ] Agregar en `sale_lines` el discriminador `lineKind` (`individual`, `combo`, `combo_component`), `comboVersionId`, `parentLineId`, `comboGroupId`, `comboOptionId`. Claves compuestas mantienen padre e hija en el mismo pedido/sucursal y opción en la versión correcta. Hija: importe cero; padre: sin receta ni fulfillment; individual: sin referencias de combo. Proteger contra padres que no sean combos y contra componentes sin padre mediante validación transaccional y restricciones/trigger.
- [ ] Añadir tipo de producto al alta, mantener fijo al editar un producto existente. Editor con autocomplete de productos, grupos ordenados, cantidades y adicionales cero por canal. Mostrar «Componentes» y «Costeo» para combos; no ofrecer receta ni estación propia. Publicación con toast de éxito/error.
- [ ] Verificar pruebas y render del editor; el combo sin definición publicada no se puede vender.

## Tarea 2: Resolución y registro atómico de ventas

**Crear:** `src/modules/combos/resolve.ts`, `tests/combos-sales.integration.test.ts`.
**Modificar:** `src/modules/sales/{validation,service,types,product-lookup}.ts`, `src/modules/products/availability.ts`, `src/app/api/sales/products/[id]/configuration/route.ts`.

**Interfaces:** `resolveCombo(tx, ctx, { productId, expectedComboVersionId, channel, quantity, choices }): Promise<ResolvedCombo>`. Reutilizar `loadConfiguration`, `resolveComposition` y `resolveFulfillment` dentro de la transacción y el bloqueo de grafo existentes. El servidor obtiene los ingredientes; no los recibe del cliente.

- [ ] Escribir pruebas de precio: base 10000 + adicional de opción 500 + modificador 200 = 10700 por combo; dos combos = 21400. Los precios individuales 8000 y 3000 no se suman. Probar componente de cantidad 2 y recargos por canal.
- [ ] Agregar pruebas de manipulaciones: opción ajena, grupo faltante/duplicado, modificador ajeno, otra sucursal, producto agotado, versión cambiada, excesos de expansión y reintento idempotente. Verificar rollback sin líneas ni reservas parciales.
- [ ] Ejecutar la suite y comprobar fallos esperados.
- [ ] Incorporar una variante de entrada de combo conservando los payloads individuales. Cargar productos y versiones únicos en orden estable bajo los bloqueos existentes; validar disponibilidad de cada componente y del combo.
- [ ] Separar preparación de líneas físicas de validación del precio individual para reutilizar composición y fulfillment sin cobrar nuevamente. Insertar padres antes de hijas y guardar snapshots, agrupación y versiones. No permitir al cliente enviar directamente hijas con precio cero.
- [ ] Verificar suites de combos y regresión de ventas individuales; confirmar total comercial igual a suma de líneas cobrables.

## Tarea 3: Configurador y carrito

**Crear:** `src/components/sales/combo-configurator.tsx`, `tests/e2e/combos.spec.ts`.
**Modificar:** `src/components/sales/product-configurator.tsx`, `src/components/sales/sales-manager.tsx`, `src/components/sales/cart.tsx`, `src/components/sales/shared.ts`.

**Interfaces:** configuración de venta discriminada `{ kind: "combo", definition: ComboDefinition, basePrice: string, ... }` o configuración individual actual. Confirmación del combo devuelve `expectedComboVersionId`, `choices: ComboChoice[]`, `expectedPrice` y etiquetas para el carrito. No trasladar datos de costos al empleado.

- [ ] Escribir prueba de navegador: agregar Classic/masa chipá y gaseosa; volver y elegir Salah, comprobar que desaparecen las elecciones de Classic; impedir confirmar modificadores obligatorios incompletos.
- [ ] Escribir prueba de dos combos con elecciones diferentes y componente fijo con modificadores obligatorios; confirmar que el carrito conserva cada configuración y su precio.
- [ ] Ejecutar pruebas y comprobar fallos esperados con fixtures desechables.
- [ ] Extraer la sección de selección de modificadores del configurador actual para reutilizarla sin anidar modales. Aislar estado por grupo/producto/versión y descartar respuestas de red obsoletas al cambiar la selección.
- [ ] Cargar configuraciones de componentes bajo demanda y reutilizarlas durante la sesión del modal por producto, canal y sucursal. Mantener header/footer visibles y scroll legible.
- [ ] Mostrar cabecera de combo y componentes «Incluido» en carrito; permitir revisar elecciones y evitar fusiones por mero `productId`. Verificar escritorio y móvil.

## Tarea 4: Reservas, comandas, entrega e historial

**Crear:** `tests/combos-fulfillment.integration.test.ts`.
**Modificar:** `src/modules/sales/{reservation,queries,types}.ts`, `src/modules/preparation/{publication,queries,types}.ts`, `src/modules/fulfillment/{service,cancellation,returns}.ts`, `src/components/sales/{sale-detail,fulfillment-panel,history}.tsx` y componentes de comandas que consumen esas consultas.

**Interfaces:** extender `SaleLine` con discriminador y relación padre/hijo; derivar estado del padre mediante `comboProgress(children): { ordered: number; completed: number; delivered: number; cancelled: number }`, en un archivo `src/modules/combos/progress.ts`. Para una cantidad fija q de un componente, contribuye `floor(progresoHijo / q)`; el progreso conjunto es el mínimo entre los grupos. El padre no se acepta en acciones físicas.

- [ ] Escribir pruebas: reservar solo hijas; completar waffle consume ingredientes con merma una vez; entregar gaseosa consume una unidad; padre sin fulfillment/reserva/movimientos; estados parciales y cantidades múltiples correctos.
- [ ] Probar mismo producto en dos grupos con modificadores distintos y demanda compartida. Probar anulación antes/después de preparación y entrega, reintentos y devolución física de gaseosa vinculada al lote original.
- [ ] Ejecutar suite y comprobar fallos esperados.
- [ ] Filtrar padres en `reserveOrder` y consultas operativas que hoy presuponen fulfillment en toda línea. Mantener los algoritmos de consumo/liberación existentes por hija.
- [ ] Añadir identificación del combo a las comandas y panel de entrega; mostrar preparación independiente y estado agregado. La gaseosa directa continúa en Entrega, sin receta ficticia.
- [ ] Adaptar detalle/historial y cualquier conteo comercial que use `sale_lines`: cabecera cobrada, componentes incluidos, cantidades operativas por separado. Preservar cancelación completa y permisos actuales; no introducir reembolsos parciales nuevos.
- [ ] Verificar tests de cumplimiento, cantidades, cancelaciones y regresión individual.

## Tarea 5: Costo estimado por sucursal

**Crear:** `src/modules/combos/costs.ts`, `tests/combos-costs.integration.test.ts`.
**Modificar:** `src/modules/catalog/product-costs.ts`, `src/modules/catalog/product-cost-model.ts`, `src/components/catalog/product-costs.tsx`, `src/components/catalog/product-cost-cache.ts`, `src/components/products/combo-tab.tsx`.

**Interfaces:** `comboCostRange(definition: ComboDefinition, costs: Map<string, ProductCost>): ProductCost`, usando el tipo `ProductCost` existente. Sumar por grupo mínimo/máximo de productos elegibles multiplicado por cantidad. Una alternativa de costo desconocido impide presentar el extremo afectado como completo.

- [ ] Escribir pruebas con dos sucursales, productos repetidos, cantidad 2, costo desconocido y receta modificada; verificar que el costo no contiene precios de venta ni recargos comerciales.
- [ ] Ejecutar suite y comprobar fallos esperados.
- [ ] Expandir dependencias de todos los combos del lote, deduplicar productos, cargar una sola vez contexto de stock/recetas y reutilizar rangos existentes.
- [ ] Invalidar dependientes al cambiar receta, producto, modificadores, stock o sucursal. No recalcular por abrir menús o interactuar con campos ajenos; conservar el comportamiento de caché acordado.
- [ ] Verificar rangos en catálogo y detalle, junto a pruebas existentes de cache y costos.

## Tarea 6: Integración, migración y recorrido final

- [ ] Ejecutar tipos (`node node_modules/typescript/bin/tsc --noEmit`), lint de archivos modificados, `git diff --check` y las suites nuevas junto a las de ventas, preparación, costos y autenticación afectadas. Usar `KYBO_ALLOW_TEST_MIGRATIONS=disposable-only` únicamente para fixtures desechables.
- [ ] Corregir fallos propios; si una suite histórica depende de un fixture anterior a la transición de inventario, adaptarla al helper vigente sin debilitar las aserciones.
- [ ] Verificar preflight de `scripts/apply-product-combos.ts`: hashes y orden del historial hasta 0017, conteos de productos y ventas, estado ready; aplicar 0018 transaccionalmente cuando corresponda al entorno autorizado, con rollback ante divergencias. No ejecutar migraciones genéricas ni modificar migraciones ya aplicadas.
- [ ] Recorrer en navegador una venta con combo y producto individual, edición de selecciones antes de confirmar, cocina, entrega, historial y anulación. Usar entorno desechable para ventas y stock de prueba.
- [ ] Revisar que snapshots anteriores no cambien al publicar otra receta, permisos de empleados se mantengan y todas las cantidades/precios se validen del lado servidor.
- [ ] Actualizar este plan con comprobaciones realizadas y pendientes; entregar resumen con migración aplicada o pendiente. No hacer commit ni push.

## Revisión del plan

Cobertura: catálogo/versiones (1), precio/venta y auditoría (2), experiencia de selección (3), inventario/estaciones/historial/anulaciones (4), costos/performance (5), migración/regresión/recorrido (6). Las cinco condiciones de Review Focus tienen pruebas asignadas. Se mantiene el esquema de precios aprobado: importe solo en padre, hijos incluidos. No se agrega un mecanismo paralelo de receta, stock o autenticación.

Estado: implementación realizada en `codex/product-combos`, sin commit ni push. Ver registro de verificación al final.


## Registro de implementación — 16 de octubre de 2026

- Catálogo: tipo Combo de productos, tab Componentes con grupos, cantidades y adicionales por canal; publicación versionada e inmutable.
- Venta: selección de productos y sus modificadores actuales; precio en cabecera y componentes incluidos; validación de versiones, permisos, disponibilidad y stock del lado servidor.
- Operación: reservas, preparación, entrega y anulación se ejecutan sobre componentes; identificación del combo en comandas y entrega, con progreso agregado.
- Costos: expansión y deduplicación de dependencias, contexto de inventario compartido por lote y rango limitado a opciones disponibles en la sucursal.
- Revisión independiente: corregida restauración de elecciones al editar y filtrado de costos por disponibilidad local.
- Migración 0018 aplicada transaccionalmente en desarrollo después de verificar hashes, orden y transición ready. Conservados 17 productos y 0 ventas. No se modificó `.env`.
- Verificación de servicios: 12 archivos, 42 pruebas aprobadas. Cobertura de publicación/reintentos/permisos, cobro único, componentes repetidos, merma y modificadores, stock por preparación/entrega, anulación pendiente, rollback por stock insuficiente, snapshots históricos, actualización de costos, regresión individual y autenticación/sucursal/caché.
- Tipos y lint de los archivos modificados aprobados.
- El recorrido operativo completo manual (incluida devolución física luego de entrega) no forma parte de las pruebas de navegador de esta entrega; la infraestructura existente de devoluciones sigue reutilizada. Las casillas de escenarios no ejecutados se conservan pendientes como cobertura adicional.

- Navegador: prueba aprobada en Chrome, con aplicación y base desechables y respuestas de catálogo/configuración simuladas para aislar la interacción. Verificados selección obligatoria, cambio Classic→Salah sin heredar elecciones incorrectas, restauración al editar, caché sin consultas duplicadas y modal móvil de 390 px. Captura local: `.local/combos/mobile.png`. La venta/stock real se verificó en las pruebas de integración, no con estas respuestas simuladas.
- Se quitaron únicamente las referencias temporales de Next generadas por las pruebas, preservando las demás opciones. `git diff --check` aprobado.
