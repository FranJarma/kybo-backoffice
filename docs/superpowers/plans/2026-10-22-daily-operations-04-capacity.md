# Etapa 4 — Rendimiento y productos preparables

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans or superpowers:subagent-driven-development after approval. Steps use checkbox (`- [ ]`) syntax. No commit/push.

**Goal:** Responder para cuántos productos alcanza un insumo y cuántos pueden prepararse ahora con todos los componentes.
**Architecture:** Consultas derivadas de composición vigente, rutas de preparación y lotes utilizables; ninguna reserva ni modificación del stock por simular.
**Tech Stack:** TypeScript/BigInt, Drizzle, módulos actuales de recetas/combos, Vitest, Playwright.
**Spec:** [Diseño](../specs/2026-10-22-daily-operations-design.md).

## Global Constraints
Heredar límites del [plan principal](2026-10-22-daily-operations.md#global-constraints). Depende de etapa1 para navegación, puede desarrollarse sin algoritmo de compras. Usar composición/merma reales y no fórmulas redondeadas para UI. No nueva migración de balance ni nueva dependencia.

## Review Focus
Merma y redondeo al límite; ingrediente repetido en combo; variante sin predeterminado válido; preparado aún no producido; stock de otra ubicación o reservado. Cubiertos en T1/T2.

### T1. Motor puro de capacidad

**Files:** crear `src/modules/capacity/{types,engine}.ts`, `tests/capacity-engine.test.ts`; consumir `src/modules/recipes/{composition,waste}.ts` y utilidades decimales, sin cambiar su semántica.

**Interfaces:** `CapacityResult={units:number|null;capped:boolean;limitingItemIds:string[];status:'known'|'requires_configuration'|'untracked'|'unavailable';assumptions:string[]}`. `calculateCapacity(input:{available:Map<string,bigint>;tracked:Set<string>;demandForUnits:(units:number)=>Map<string,bigint>;maximum:number}): CapacityResult`. `maximum=1_000_000`. Demanda calculada con funciones canónicas para n unidades, no sumar cantidades ya redondeadas por unidad si el dominio redondea por lote.

- [ ] Tests: taro1000g/neto30g/merma2%→32; más32 requiere consumo real>stock para33; límite exacto sin float; taro para32+vasos20→20 y vasos limitante; dos componentes de mismo insumo se suman antes de comparar; cantidad0→0; ningún insumo controlado→untracked/null; al llegar al máximo→capped y UI «≥ 1.000.000».
- [ ] Usar claves canónicas de artículo + ubicación en ambos mapas y en `tracked` para capacidad operativa; proyectar esas claves a `limitingItemIds` sin duplicados para el resumen y conservar ubicaciones en el detalle. En simulación teórica usar una ubicación virtual explícita; nunca mezclar saldos de estaciones distintas.
- [ ] Implementar búsqueda entera monótona, rango acotado y consumo real canónico; validación de cantidades no negativas y merma<100%. Empates pueden tener varios limitantes. No usar número redondeado mostrado para decidir stock.
- [ ] Ejecutar `pnpm test tests/capacity-engine.test.ts tests/production-consumption.unit.test.ts`; PASS.

### T2. Consultas de receta, ubicación y simulación

**Files:** crear `src/modules/capacity/{queries,composition}.ts`, `tests/capacity.integration.test.ts`; reutilizar `src/modules/products/fulfillment.ts`, `recipes/composition.ts`, `combos/service.ts`, `inventory/availability.ts` y rutas de preparación.

**Interfaces:** `getProductCapacity(db:AppDb,actor:Actor,input:{productId:string;selections?:Selection[];comboChoices?:LineInput['comboChoices']}): Promise<CapacityView>`; `simulateIngredientYield(db,actor,input:{itemId:string;quantity:string;unit:'g'|'kg'|'ml'|'l'|'unit';productId:string;selections?:Selection[];comboChoices?:LineInput['comboChoices']}): Promise<CapacityView>`. `CapacityView={asOf;productId;recipeVersionIds:string[];locationIds:string[];result:CapacityResult;components:{itemId;name;unit;requiredPerUnit;available;locationName}[]}`. DTO de simulación distingue que otros componentes no restringen el rendimiento teórico.

- [ ] Tests: stock solo en Depósito no aumenta capacidad de Barra; reservas, vencidos y bloqueados excluidos; mezcla de estaciones de combo usa cada ubicación y agrega por item/location; preparado sin stock sigue limitante aunque haya materia prima; sin receta→unavailable; opciones predeterminadas inválidas→requires_configuration; costo no se devuelve.
- [ ] Tests de coherencia: calcular capacidad n, reservar n con servicio real en fixture debe aceptar; n+1 rechaza por insumo limitante (sin otras restricciones comerciales en fixture). Validar tanto producto directo como receta con merma y combo con componentes compartidos.
- [ ] Implementar snapshots repeatable-read y contexto de sucursal; consultas paginadas de productos, calcular a demanda sin N consultas por tarjeta. Reutilizar composición de productos a través de helpers sin crear ventas. Simular no escribe documentos, reservas o eventos de inventario.
- [ ] Ejecutar `pnpm test tests/capacity.integration.test.ts tests/combos-sales.integration.test.ts tests/stock-shortages.integration.test.ts`; PASS.

### T3. Pantalla y rendimiento real de preparaciones

**Files:** crear `src/app/api/operations/capacity/route.ts`, `src/components/daily-operations/{capacity-panel,ingredient-simulator}.tsx`, `tests/capacity.http.test.ts`, `tests/e2e/daily-capacity.spec.ts`; integrar pestaña en manager y reutilizar `src/modules/production/result.ts` para resultado revisado.

- [ ] GET capacidad autenticado; POST simulación de solo lectura con validación explícita de unidades y opciones. Encargado ve sucursal; empleado no obtiene información de otra sucursal. No endpoints públicos.
- [ ] UI distingue «Rendimiento de este insumo» y «Preparables ahora». Mostrar selección/versión, ubicación, limitantes, timestamp y explicación de merma. Texto fijo: «Estas capacidades no se suman: los productos pueden compartir insumos».
- [ ] Historial de preparación: planificado, obtenido real vigente y diferencia; tomar última revisión de resultado. No inferir que rendimiento real reemplaza receta. Sin historial mostrar estado vacío explícito.
- [ ] Tests navegador: 1kg taro→32, vasos limitan a20, cambio de variante recalcula, unidad incompatible produce error accesible, nombres largos no desbordan tablet, nunca botón que ejecute stock al simular.
- [ ] Ejecutar tests HTTP/E2E, tipos/lint y build final de integración. Presentar resultados de las cuatro etapas, migraciones pendientes y configuración necesaria; sin commit/push hasta autorización distinta.
