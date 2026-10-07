# Modificadores y costeo dinámico — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Configurar un producto una sola vez y resolver sus ingredientes, costo y precio según opciones elegidas, conservándolas en ventas y comandas.

**Architecture:** Grupos reutilizables con versiones inmutables, vinculados a versiones de recetas. Un resolvedor puro compila la selección; el simulador calcula costos y el servicio de ventas persiste selección y composición dentro de su transacción existente. La migración es aditiva y mantiene el comportamiento anterior de recetas y producción.

**Tech Stack:** Next.js 16.3.6, React 19.3.0, TypeScript 6.0.3, Drizzle 0.45.3, PostgreSQL/Neon con `pg`, Tailwind y componentes existentes, Vitest, PGlite y Playwright. Conservar el lockfile; no cambiar el driver en esta entrega.

**Spec:** `../specs/2026-09-27-modificadores-recetas-design.md`. Acompañar este plan con esa especificación al ejecutar.

**Referencia inspeccionada:** `kybo-operations-next.zip`, versión 0.5.0. Este documento no certifica el estado de la instalación de Francisco ni una base Neon conectada. Estado: plan preparado; código de producto sin modificar.

## Global Constraints

- “No se generan productos por combinación.”
- “Las cantidades usan `numeric(18,6)` y los importes comerciales `numeric(14,2)`”. Usar la aritmética exacta de `src/modules/inventory/decimal.ts`.
- “El cliente nunca determina el precio ni la composición aceptados.”
- “Los costos desconocidos permanecen `null`”. No confundirlos con recargo cero ni composición vacía.
- “La migración SQL es aditiva.” No borrar recetas, ventas ni producciones anteriores.
- “La composición de venta no es una prueba de consumo ni un costo real.” Esta entrega no mueve inventario por ventas.
- “El producto conserva su estación asignada”. Las opciones no generan tareas independientes.
- “No introduce multiempresa, combos de productos anidados, reglas condicionales entre grupos, cobros Mercado Pago ni movimientos de inventario por ventas.” Fudo es la siguiente integración, no una dependencia de este bloque.
- Node >=24 según package.json. Antes de escribir código, instalar con el lockfile y leer las guías pertinentes de `node_modules/next/dist/docs/`, como exige AGENTS.md.
- Mantener español, permisos admin/manager/staff y componentes visuales actuales. Header alineado en escritorio; diseño usable con teclado y celular.

## Review Focus

1. Reintento de una venta tras cambiar el catálogo: devolver el resultado original sin recalcular ni duplicar comandas (tarea 4).
2. Cantidades decimales, rendimiento y extras repetidos: escalar una sola vez y rechazar pérdida de precisión/overflow (tarea 2).
3. Grupo archivado ya asignado frente a insumo archivado: conservar la asignación y bloquear solamente selecciones que consumen el insumo retirado (tareas 2 y 3).
4. Dos configuraciones del mismo producto y edición de una: conservar renglones e instrucciones independientes (tarea 5).
5. Respuesta a personal: no filtrar costos mediante configuración, errores, simulación ni detalle de venta (tareas 3–5).

## Mapa de archivos y contratos compartidos

Todos los caminos siguientes son relativos a la raíz del proyecto extraído. No implementar dentro del repositorio que contiene solamente documentación.

- `src/db/modifier-schema.ts`: las once tablas del diseño, restricciones y relaciones. Exportarlas desde `src/db/schema.ts`; ampliar `recipe-schema.ts` y `sales-schema.ts`.
- `src/modules/modifiers/types.ts`, `validation.ts`, `service.ts`: contratos, validación de entradas locales y gestión versionada de grupos.
- `src/modules/recipes/composition.ts`: resolvedor puro; `configuration.ts`: carga transaccional de composición y proyección pública; `costing.ts`: evaluación de costos reutilizable; `conversion.ts`: propuesta de conversión legacy.
- `src/modules/recipes/service.ts`: persistencia de grupos ligados a recetas, publicación y costeo; mantener la API legacy de preparados.
- `src/modules/sales/service.ts`, `validation.ts`, `queries.ts`, `types.ts`: selección, control de versión, snapshots y consulta histórica.
- `src/components/modifiers/`: editor y listado; `src/components/recipes/`: configuración y simulación; `src/components/sales/`: selector y carrito; `src/components/preparation/`: opciones en comandas.

Definir en `modifiers/types.ts` los siguientes contratos; cantidades/importes internos normalizados como strings con punto decimal. Las entradas humanas usan el parser argentino existente y se convierten una sola vez en el límite HTTP.

```ts
type Component = { ingredientId: string; name: string; baseUnit: "g" | "ml" | "unit"; quantity: string; archived: boolean };
type Selection = { recipeModifierOptionId: string; count: number };
type ConfiguredOption = { id: string; key: string; name: string; kind: "composition" | "instruction"; instruction: string | null; enabled: boolean; defaultCount: number; maxCount: number; mode: "inherit" | "override"; components: Component[]; prices: Partial<Record<SaleChannel, string>> };
type ConfiguredGroup = { id: string; groupVersionId: string; name: string; min: number; max: number; factor: string; options: ConfiguredOption[] };
type Configuration = { recipeVersionId: string; revision: number; model: "legacy" | "configurable"; yieldQuantity: string; fixed: Component[]; groups: ConfiguredGroup[] };
type ResolvedModifier = { recipeModifierOptionId: string; groupName: string; optionName: string; count: number; instruction: string | null; unitSurcharge: string };
type ResolvedComposition = { components: Component[]; modifiers: ResolvedModifier[]; surcharge: string };
type CompositionCost = { totalCost: string | null; knownSubtotal: string; missing: string[]; components: { ingredientId: string; cost: string | null }[] };
```

`SaleChannel` se importa del contrato existente. `ConfiguredOption.components` contiene la lista heredada o el reemplazo completo según `mode`; el factor solo se aplica a `inherit`. `Configuration.fixed` se expresa por rendimiento de receta, los componentes opcionales por elección de una unidad vendida. El resolvedor divide únicamente la parte fija por `yieldQuantity`, conservando recetas de producto con rendimiento distinto de uno. Nunca escalar nuevamente al guardar snapshots por unidad.

## Tarea 1: Esquema aditivo e integridad de pertenencia

**Files:** Crear `src/db/modifier-schema.ts`, `tests/modifiers-schema.test.ts`; modificar los tres esquemas indicados. Generar la siguiente migración y metadatos en `drizzle/` con `pnpm db:generate`; conservar 0000–0005 sin modificaciones.

**Interfaces:** Exportar tablas Drizzle camelCase correspondientes a los once nombres SQL del diseño. Agregar `recipeVersions.compositionModel` y `saleLines.compositionStatus`. `modifierGroups.revision` representa versión actual; las versiones conservan autor y fecha. `sale_line_modifiers` guarda las referencias necesarias a línea, versión de receta y asignación para validar pertenencia con FK compuestas.

- [ ] **1. Escribir pruebas de migración e integridad.** `legacy_rows_survive`: cargar fixture al esquema 0005 y migrar; assert mismas ventas/importes/recetas/producciones, modelo `legacy`, composición `legacy_unknown`. `foreign_option_rejected`: insertar asignación con opción de otra versión debe fallar por FK. `duplicate_component_rejected`: mismo insumo en una opción falla. `historical_delete_restricted`: borrar opción referenciada falla.
- [ ] **2. Ejecutar `pnpm test -- tests/modifiers-schema.test.ts`.** Debe fallar por ausencia de tablas/campos, no por entorno o fixture inválidos.
- [ ] **3. Implementar esquema y migración.** Agregar unicidades e índices del diseño, CHECK de cantidades y mínimos/máximos no negativos y factor positivo. FK compuestas garantizan pertenencia entre receta, grupo, opción y selección vendida. Las sumas entre filas se verifican en servicios. Migración nunca crea componentes ficticios para ventas viejas.
- [ ] **4. Repetir el comando y `pnpm typecheck`.** Esperar pruebas aprobadas y cero errores TypeScript.
- [ ] **5. Commit:** `feat: add versioned modifier schema and sale snapshots`.

## Tarea 2: Resolvedor único y costo de reposición

**Files:** Crear `src/modules/modifiers/types.ts`, `src/modules/recipes/composition.ts`, `src/modules/recipes/costing.ts`, `tests/composition.test.ts`; modificar `src/modules/recipes/service.ts` y `types.ts`.

**Interfaces:** `resolveComposition(config: Configuration, selections: Selection[], channel: SaleChannel): ResolvedComposition`; `defaultSelections(config: Configuration): Selection[]`; `costComposition(db: AppDb | Tx, components: Component[]): Promise<CompositionCost>`. Reutilizar el contexto y cálculo recursivo de preparados extraídos de `recipes/service.ts`, sin cambiar sus resultados legacy.

- [ ] **1. Escribir fixtures y assertions.** `inherit_override_repeat`: fijo leche `300.000000`; opción heredada perlas `40.000000`, factor `1.500000`, count 2 → perlas `120.000000`; override perlas `50.000000`, count 2 → `100.000000`. `fixed_plus_extra`: queso fijo 20 + extra 10 × 2 → `40.000000`. `yield_two`: fijo leche 600 / rendimiento 2 + perlas 40 → leche 300, perlas 40 por unidad.
- [ ] **2. Añadir rechazo de selección.** Counts negativos/fraccionarios, IDs repetidos, opción ajena/deshabilitada, máximo por opción/grupo excedido, obligatorio vacío, precio ausente y componente seleccionado archivado arrojan VALIDATION. Grupo archivado no invalida versión ya asignada. Opción vacía explícita devuelve componentes vacíos y costo cero. Opción con insumo sin costo devuelve `totalCost: null` y faltante, nunca cero. Precision superior a seis decimales tras conversión y overflow se rechazan.
- [ ] **3. Ejecutar `pnpm test -- tests/composition.test.ts`.** Confirmar fallos por resolvedor faltante.
- [ ] **4. Implementar contratos.** Sumar por insumo sin borrar aportes legítimos, conservar procedencia en modifiers; devolver cantidades por unidad de producto. Multiplicar recargos por count, nunca por factor de ingrediente. Instrucciones no admiten componentes. Normalizar escalas antes de `integer`; división exacta para cantidades, redondeo monetario coherente con costeo existente. Preparados usan rendimiento y detección de ciclos actuales.
- [ ] **5. Ejecutar `pnpm test -- tests/composition.test.ts tests/recipes.test.ts tests/production.test.ts`.** Todo aprobado, incluyendo preparados y costos pendientes.
- [ ] **6. Commit:** `feat: resolve configurable recipes and replacement costs`.

## Tarea 3: Servicios de administración, conversión y configuración pública

**Files:** Crear `src/modules/modifiers/{service,validation}.ts`, `src/modules/recipes/{configuration,conversion}.ts`, `tests/modifiers.test.ts`, `tests/modifiers-http.test.ts`; ampliar `recipes/{service,types,validation}.ts` y rutas existentes. Crear rutas `src/app/api/modifier-groups/route.ts`, `src/app/api/modifier-groups/[id]/route.ts`, `src/app/api/recipes/[id]/conversion/route.ts`, `src/app/api/sales/products/[id]/configuration/route.ts`.

**Interfaces:** `createModifierService(db)` produce `list(actor, raw)`, `get(actor,id,versionId?)`, `save(actor,raw)`, `archive(actor,id,raw)`; `save` devuelve grupo con versión y opciones. `loadConfiguration(db: AppDb | Tx, recipeVersionId: string): Promise<Configuration>`. `proposeConversion(db: AppDb | Tx, actor: Actor, recipeId: string, revision: number): Promise<ConversionDraft>`; `ConversionDraft` contiene revisión origen, fijos, grupos propuestos y precios por completar, sin IDs persistidos nuevos. `getProductConfiguration(db: AppDb, actor: Actor, productId: string, channel: SaleChannel)` devuelve versión, grupos, defaults, precios y disponibilidad, sin componentes ni costos.

- [ ] **1. Escribir assertions de servicio.** `publish_pins_version`: editar grupo no cambia receta ligada. `adopt_requires_new_recipe`: adopción crea nueva receta tras revisar claves/precios/excepciones. `conversion_preserves_default`: receta legacy con alternativa primera A y opcional primera B propone defaults A+B y elimina copias fijas; costo y cantidades iniciales iguales. Ningún recargo se completa automáticamente; publicar con precio ausente en canal activo falla. Versiones históricas siguen consultables.
- [ ] **2. Escribir seguridad y atomicidad.** Staff recibe 403 al administrar/costear; configuración de venta no contiene `unitCost`, `cost` ni composiciones. Opciones instruction con override/componentes fallan. Defaults inválidos y canal faltante fallan sin nuevas filas. Cambiar insumo/unidad concurrentemente no publica composición obsoleta. Archive bloquea nuevas asignaciones y muestra productos vinculados; no invalida asignaciones ya publicadas.
- [ ] **3. Ejecutar `pnpm test -- tests/modifiers.test.ts tests/modifiers-http.test.ts`.** Confirmar rojos esperados.
- [ ] **4. Implementar validación/servicios/rutas con patrones HTTP y permisos existentes.** Ampliar `RecipeInput` con discriminación legacy/configurable y grupos ligados. Configurable admite parte fija vacía si hay grupos válidos, pero cada línea fija debe ser obligatoria y tener una sola opción. Preparados continúan legacy. Publicación transaccional usa claim/fingerprint/audit y revisión optimista. Reusar bloqueos de receta/ingrediente existentes con orden uniforme; no asumir que validación de cliente protege concurrencia.
- [ ] **5. Ejecutar pruebas anteriores más `tests/recipes.test.ts`, `pnpm typecheck` y `pnpm lint`.** Todos aprobados.
- [ ] **6. Commit:** `feat: manage reusable modifiers and reviewed recipe conversion`.

## Tarea 4: Venta atómica y snapshots de comandas

**Files:** Modificar `src/modules/sales/{service,validation,queries,types}.ts`, `src/modules/preparation/{queries,types}.ts`; ampliar `tests/sales.test.ts`, `tests/preparation.test.ts`, `tests/sales-http.test.ts`; crear `tests/modifiers-concurrency.test.ts`.

**Interfaces:** Ampliar `LineInput` con `expectedRecipeVersionId: string | null` y `modifiers: Selection[]`. `expectedPrice` ahora es total unitario catálogo base + opciones; mantener ajuste manual con sus permisos/motivo. `SaleLine` añade `compositionStatus` y `modifiers: ResolvedModifier[]`. `PrepTask.lines` añade solo nombres, counts e instrucciones históricas, sin costos ni recargos. `prepareLines` consume `loadConfiguration` y `resolveComposition`; `insertOrder` persiste los dos snapshots antes de `publishOrder`, todo en la transacción existente.

- [ ] **1. Escribir `sale_two_configurations`.** Un producto base 7000, tapioca recargo 0 y explosivas 500 genera dos renglones; con quantity 2 en explosivas, unitPrice 7500 y lineTotal 15000. Snapshot por unidad contiene 50 g si esa elección aporta 50 g, no 100 g. Cocina mantiene ambas selecciones.
- [ ] **2. Escribir `retry_after_catalog_edit`, `stale_version`, `tampered_selection`.** Reintento idéntico retorna venta original aunque receta cambió; misma requestId con contenido distinto falla. Cambiar versión/precio entre selección y confirmación devuelve conflicto sin ventas/pagos/tareas parciales. Insumo archivado seleccionado falla; archived no seleccionado no bloquea. Producto sin receta usa `unavailable`; nueva venta legacy resuelve primeras alternativas; ventas antiguas siguen `legacy_unknown`.
- [ ] **3. Ejecutar `pnpm test -- tests/sales.test.ts tests/preparation.test.ts tests/sales-http.test.ts`.** Confirmar fallos concretos de snapshots y validaciones faltantes.
- [ ] **4. Implementar integración.** Verificar replay antes de resolver catálogo actual. Bloquear y validar revisiones dentro de la transacción antes de publicar; catálogo y ventas siguen igual orden de locks. Configurable exige versión esperada explícita; clientes legacy sin nuevo campo solo se toleran en productos legacy/sin receta. Precio servidor incluye extras. Canonicalizar selections por ID para fingerprint sin modificar el orden significativo de renglones. Lecturas de cocina usan snapshots, nunca grupo actual. No escribir inventory movements.
- [ ] **5. Probar con dos conexiones PostgreSQL independientes.** `tests/modifiers-concurrency.test.ts` usa una base de prueba dedicada indicada por `KYBO_TEST_DATABASE_URL`; debe saltarse con motivo visible si no está disponible. Barreras controladas: venta vs publicación, venta vs archivo de insumo y requestId simultánea. Esperar venta coherente o conflicto, nunca mezcla de versiones ni doble orden. No usar sleeps como coordinación ni base productiva. PGlite no cuenta como prueba de concurrencia PostgreSQL.
- [ ] **6. Repetir tests y `pnpm typecheck`.** Registrar por separado cualquier prueba externa no ejecutada.
- [ ] **7. Commit:** `feat: snapshot sale modifiers and preparation instructions`.

## Tarea 5: Editores, simulador y selector de venta

**Files:** Crear `src/components/modifiers/{manager,group-editor}.tsx`, `src/components/recipes/{modifier-editor,cost-simulator}.tsx`, `src/components/sales/product-configurator.tsx`; modificar `recipes/recipes-manager.tsx`, `sales/{cart,sales-manager,sale-detail}.tsx`, `preparation/{card,detail}.tsx`; crear `tests/e2e/modifiers.spec.ts`.

**Interfaces:** `ProductConfigurator({ productId, channel, initialSelection, onConfirm, onCancel })`; `onConfirm` entrega `{ expectedRecipeVersionId, modifiers, expectedPrice }` y etiquetas públicas para carrito, nunca costos. `CostSimulator({ recipeId, revision })` consulta el servicio de costo para admins/managers. Editores usan los servicios de tarea 3; ningún componente duplica el algoritmo de costo.

- [ ] **1. Escribir recorrido Playwright.** Crear grupo perlas → asignar y completar precios por canal → simular tapioca/explosivas con costo diferente → vender ambas configuraciones → verificar comandas. Assert un solo producto en catálogo, dos renglones y snapshot estable tras publicar versión nueva.
- [ ] **2. Añadir casos UX.** Conversión muestra precios pendientes; falta obligatorio bloquea agregar con mensaje asociado al campo. Selección multicomponente, instrucción sin ingredientes, override y factor visibles. Editar un renglón no cambia otro. Cambiar canal recalcula precios y señala opciones sin precio. Conflicto conserva carrito y exige revisión. Respuestas viejas al cambiar rápidamente producto/canal no pisan selección actual.
- [ ] **3. Ejecutar `pnpm test:e2e -- tests/e2e/modifiers.spec.ts`.** Verificar primero que el runner reenvía el filtro; si no, adaptar el runner para soportar argumentos Playwright sin alterar su preparación. Debe fallar por flujo aún no implementado.
- [ ] **4. Implementar componentes.** Conservar tokens y componentes existentes; radios para elección única, controles de cantidad para repetidas, obligatorios claros, total y CTA visibles. Advertir insumo presente en fijo y extras sin eliminarlo. Mostrar «Costo pendiente», «Sin precio», «Heredado» y «Composición propia» cuando corresponda. Evitar recetas y costos en la interfaz staff. Mantener ruteo/timing de cocina.
- [ ] **5. Verificar a 390 y 1440 px y con teclado.** Capturas de editor/simulador/configurador/comanda, sin desbordes, foco visible y header alineado. Ejecutar recorrido nuevo y regresiones de recetas-producción, ventas y preparación.
- [ ] **6. Commit:** `feat: add modifier editors and configurable sales UI`.

## Tarea 6: Ensayo de actualización y entrega verificable

**Files:** Crear `docs/verification-modifiers.md`, `docs/modifiers-migration.md`; actualizar README y versión package.json solo al completar la entrega.

**Interfaces:** ZIP instalable con migraciones acumulativas, spec y plan; instrucciones de actualización que conservan datos y configuración privada.

- [ ] **1. Ejecutar `pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm build`, `pnpm test:e2e`.** Registrar resultados reales, no reutilizar cifras de la versión 0.5.0. Resolver fallos introducidos antes de entregar.
- [ ] **2. Ensayar actualización en una copia de pruebas poblada al esquema anterior.** Verificar importes, historial, producción tapioca/waffles y receta legacy antes/después. Convertir una receta, comprobar cantidades/costo y rechazo de publicación sin precios. Base real de Francisco queda fuera del ensayo salvo acceso posterior explícito.
- [ ] **3. Revisar el diff contra las diez condiciones del diseño.** Confirmar ausencia de movimientos de stock y secretos, permisos de endpoints y salida pública staff. Documentar pruebas PostgreSQL o dispositivos no realizadas como pendientes, sin afirmar validación Neon.
- [ ] **4. Documentar backup previo, aplicación con `pnpm db:migrate` y recuperación.** No usar `db:push` ni borrar tablas. El rollback no elimina registros nuevos; recuperar backup requiere conservar/reconciliar operaciones posteriores. Entregar sin `.env`, dependencias instaladas ni datos privados.
- [ ] **5. Commit:** `docs: document modifier migration and verification`; guardar ZIP actualizado reemplazando la identidad del entregable existente.

## Revisión del plan

Cobertura: tablas e históricos (1), selección y costos (2), grupos/versionado/conversión/permisos (3), venta/atomicidad/comandas (4), administración y uso móvil (5), compatibilidad y entrega (6). Cada riesgo de Review Focus tiene prueba asignada. No hay tareas de integración externa ni consumo de stock ocultas en este bloque.

Recomendación de ejecución: **Native**, tareas secuenciales en esta sesión, con revisión independiente al terminar. Los contratos se comparten entre receta, venta y cocina; implementar en orden permite comprobar cada transición sin desarrollos paralelos dependientes. La modalidad alternativa es ejecución por subagentes con revisión por tarea.
