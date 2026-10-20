# Punto de equilibrio en Finanzas — Implementation Plan

> **For agentic workers:** usar trabajo por componentes disjuntos y verificación antes de completar. No commits, push ni migraciones de desarrollo.

**Goal:** explicar los costos actuales y simular el equilibrio por sucursal, mes y mezcla sin modificar los datos financieros.
**Architecture:** servicio de lectura que reutiliza Costeo; cálculo puro en memoria; panel cliente activado mediante tabs en Gastos del negocio.
**Tech Stack:** Next.js/React, TypeScript, Drizzle/PostgreSQL, BigInt, Vitest y Chrome/Playwright.
**Spec:** `docs/superpowers/specs/2026-10-20-break-even-design.md`.

## Restricciones y revisión

- Datos pendientes nunca son cero; base siempre presupuesto guardado, no real incompleto.
- Sin mezcla no existe una estimación global definitiva. No inventar ponderaciones.
- Combos: ingresos del padre, cantidad de unidades finales de sus componentes; no duplicar ingresos ni stock/costos.
- Costos, impuestos y comisión de los mismos cálculos existentes de Costeo; sólo composición predeterminada y precios actuales.
- Consulta financiera exclusiva de encargado; sucursal y mes validados; respuesta privada, sin escrituras.
- Inputs del simulador recalculan localmente. No solicitudes nuevas por interacción ni actualización de datos locales sin guardar.

## Contrato compartido (`src/modules/overheads/break-even-model.ts`)

`BreakEvenSnapshot`:
```
{ branchId:string; branchName:string; month:string; asOf:string;
  expenseRevision:number|null;
  budget:{ total:string|null; expectedUnits:number|null; rate:string|null; pending:number; entries:ExpenseEntry[] };
  methods:{id:string;name:string;percent:string|null}[];
  historicalMix:{productId:string;quantity:number}[];
  historicalUnits:number; historicalExcludedUnits:number; warnings:string[];
  products:{ id:string;name:string;kind:'individual'|'combo';finalUnits:number|null;
    labels:string[];pendingReasons:string[];
    estimates:{channel:SaleChannel;price:string|null;netPrice:string|null;cost:string|null;
      vat:string|null;iibb:string|null;
      methods:{id:string;commission:string|null;contribution:string|null}[] }[] }[] }
```
Moneda canónica: dos decimales; `cost` tiene seis. `contribution` ya es `marginAfterTaxes` de Costeo, antes de gastos fijos. `rate` tiene seis decimales. Sin presupuesto completo, `budget.total=null`.

`BreakEvenScenario`:
```
{channel:SaleChannel;methodId:string;entries:{productId:string;quantity:number}[];
 expectedUnits:number|null;daysOpen:number|null}
```
Cantidades relativas enteras no negativas; cero excluye. Selecciones/cantidades inválidas producen bloqueo, nunca una excepción no controlada en pantalla.

`calculateBreakEven(snapshot,scenario):BreakEvenResult` en `src/modules/overheads/break-even.ts`:
```
{status:'ready'|'missing_mix'|'pending'|'non_positive';selectedUnits:number;
 averageContribution:string|null;breakEvenUnits:number|null;breakEvenPerDay:number|null;
 projectedContribution:string|null;projectedProfit:string|null;blockers:string[];
 products:{productId:string;finalUnits:number|null;price:string|null;cost:string|null;
 commission:string|null;iibb:string|null;contribution:string|null;
 allocatedOverhead:string|null;projectedMargin:string|null;
 breakEvenSales:number|null;breakEvenUnits:number|null;
 status:'ready'|'pending'|'non_positive';pendingReasons:string[]}[]}
```
Promedios/prorrateo exactos BigInt. Se normalizan cantidades relativas por su máximo común divisor, se calcula ceil(gastos/aporteDelPatrónReducido) y se convierte a unidades finales. Así el umbral conserva la mezcla y nunca exige medio combo. Equilibrio por producto = ceil(gastos/aportePorVenta); unidades finales = ventas × finalUnits. No redondear el promedio antes de calcular el umbral. Aporte <=0 no admite equilibrio por crecimiento de ventas. Gasto explícito cero con aporte positivo da umbral cero. Valores fuera de rango/pendientes bloquean el agregado. Días de apertura opcionales de 1 a 31. El volumen proyectado se expresa en unidades finales.

**Precisión decidida al verificar combos:** un umbral teórico por unidad final podía exigir media venta de combo y diferir del detalle individual. Se redondea al patrón reducido completo de ventas (unidades compuestas), manteniendo el cálculo promedio/proyección sin redondeo anticipado.

## Tareas

- [x] Matemática y tipos (agente): crear los dos archivos de contrato/cálculo y `tests/break-even.test.ts`; demostrar RED/GREEN con mezcla, combos, precisión, pendientes, cero, negativos, duplicados e inválidos.
- [x] Servicio y API (raíz): `src/modules/overheads/break-even-service.ts`, `src/app/api/finance/break-even/route.ts`, pruebas HTTP/integración. Consultar catálogo activo habilitado en sucursal y mezclar sólo ventas cerradas del mes. Informar históricos no cubiertos. Agrupar Costeo de a 10 con concurrencia 2; no N consultas por render. `getBreakEven(db,actor,rawMonth?) => Promise<BreakEvenSnapshot>`.
- [x] Panel (agente): `src/components/finance/break-even-panel.tsx`, exportar `BreakEvenPanel({month,revision}:{month:string;revision:string|number})`. Fetch lazy al montar, deduplicación/ref para StrictMode, ignora respuestas obsoletas, botón Actualizar. Usa API y cálculo puro, no nuevas dependencias ni imágenes. Campos relativos por producto (puede iniciar con histórico explícitamente identificado), medio/canal, volumen local y días opcionales; resumen legible, detalle de productos y pendientes. Error en OperationAlert/useErrorFeedback. No editar ExpensesManager.
- [x] Integración de tabs y diagnóstico real (raíz): ExpensesManager agrega tabs Gastos del mes/Punto de equilibrio y mantiene borradores con confirmación de descarte existente. La revisión del panel cambia con mes/generation/revisión. Analizar en sólo lectura gastos/productos actuales y guardar datos particulares sólo en `.local/` ignorado.
- [x] Verificación (raíz): pruebas relevantes; flujo navegador presupuesto/lector/simulación, sin consultas al modificar hipótesis; permisos y sucursal; tipos/lint/formato; revisión independiente y evidencia visual. Preservar y restaurar archivos temporales Next de las pruebas.

## Verificación completada

- 82 pruebas en 9 archivos: cálculo puro, permisos efectivos, sucursal, costos actuales, IVA/comisiones/IIBB, combos completos, historial/mezcla, presupuesto pendiente y regresión de gastos/rentabilidad. Todas pasan; casos nuevos observados en RED y GREEN.
- Chrome: simulación local y caché de consulta, mezcla vacía, aporte requerido sin mezcla, resultado negativo, días de apertura, conservación de borradores e hipótesis, error de conexión mediante toast y actualización tras guardar gastos. La consulta se hizo una vez al abrir, no se repitió al editar, se renovó sólo al actualizar y guardar presupuesto.
- Chrome: regresión de presupuesto, cierre/revisión mensual y Costeo pasó. Vista de escritorio y móvil revisada; sin desbordamiento horizontal en móvil.
- TypeScript, ESLint y Prettier del alcance pasan; `git diff --check` correcto. Revisión independiente sin hallazgos importantes pendientes.
- Consulta real de 20 productos en aproximadamente 3 s; las simulaciones posteriores no repiten consultas. Datos particulares y diagnóstico completos quedan sólo en `.local/`, ignorado por Git.
- El usuario todavía no conoce su mezcla: el equilibrio general permanece pendiente. El panel muestra el aporte promedio mínimo necesario y umbrales individuales explícitamente identificados.
- Sin cambios a `.env`, sin migraciones/escrituras de prueba en desarrollo, sin commits ni push. Archivos generados de Next restaurados tras Chrome.
- Capturas: `docs/previews/finance-break-even-desktop.png`, `docs/previews/finance-break-even-mobile.png`.
