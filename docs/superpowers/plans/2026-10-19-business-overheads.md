# Gastos mensuales del negocio

Goal: registrar presupuesto y gastos reales por sucursal y mes, cerrar con historial y mostrar el prorrateo en Costeo.
Architecture: tablas aditivas para períodos y cierres inmutables; comandos operativos existentes para autorización, transacción e idempotencia; cálculo decimal exacto; consulta financiera opcional y una pantalla de gestión.
Tech Stack: Next 16, React 19, Drizzle/PostgreSQL, Zod, Vitest/PGlite, Playwright.
Spec: `docs/superpowers/specs/2026-10-19-business-overheads-design.md` (aprobado por el usuario).

## Global Constraints

- Preservar `.env`, catálogo, ventas, stock y todos los cambios previos (checkpoint 5bb639c ya publicado).
- Continuar inline por instrucción explícita «después Empeza». Mantener este trabajo nuevo sin commit ni push hasta revisión del usuario.
- Trabajar en la rama de funcionalidad actual, separada de main. No reutilizar el antiguo worktree de transición de datos.
- Importes desconocidos no equivalen a cero; usar enteros escalados, redondear solo para mostrar.
- Solo administradores y encargados autorizados de la sucursal. Los datos financieros no llegan a caja ni empleados.
- Cierres por fecha de operación y líneas históricas: excluir encabezados de combos, incluir componentes y productos individuales.
- No cambiar precios, consumo ni valoración de inventario.

## Review Focus

Revisar autorización efectiva y reintentos después de revocar permisos; concurrencia entre guardado/cierre; datos pendientes frente a cero; combos con cantidades múltiples; límites mensuales; cierre sin ventas; conservación de snapshots y auditoría; ausencia de datos financieros en respuestas de empleados; caché y recálculo en Costeo; claridad del cierre y revisión en la interfaz.

## Task 1: modelo y cálculo

Files: `src/db/overhead-schema.ts`, `drizzle/0022_business_overheads.sql`, journal/schema exports, `src/modules/overheads/{types,calculation}.ts`, test helper, `tests/overheads.test.ts`.
Interfaces: entrada de gastos con categoría/concepto/presupuesto/real/notas; resumen con totales conocidos, pendientes y tasa por unidad. Período único sucursal+mes; revisión y snapshots de cierre.

- [x] Escribir pruebas de $2M/4000, $2.1M/3500, pendiente/cero, redondeo y asignación múltiple; ejecutar antes del código (Expected: fallo por funcionalidad ausente).
- [x] Implementar matemáticas con BigInt y migración aditiva con restricciones.
- [x] Ejecutar `vitest run tests/overheads.test.ts` (Expected: todas pasan).

## Task 2: gestión, cierre y acceso

Files: `src/modules/overheads/service.ts`, `src/app/api/finance/expenses/route.ts`, `tests/overheads.integration.test.ts`, `scripts/apply-overheads.ts`.
Interfaces: GET mes -> período, resumen, unidades actuales y cierres; POST acción save/close/revise -> comando idempotente con revisión, confirmación y motivo de revisión. Consulta de tasa presupuestada autorizada para Costeo.

- [x] Pruebas integración primero: unicidad, permisos, reintentos, revisión obsoleta, cierre incompleto, conteo histórico y revisión de cierre (Expected: rojo).
- [x] Implementar servicio transaccional, auditoría, validación y API privada sin caché.
- [x] Implementar verificación/migración segura, solo tablas nuevas.
- [x] Ejecutar integración con base descartable (Expected: verde).

## Task 3: pantalla y Costeo

Files: `src/components/finance/expenses-manager.tsx`, `src/app/(operations)/finance/expenses/page.tsx`, `src/lib/navigation.ts`, `src/modules/catalog/product-costs.ts`, `src/modules/pricing/product-profitability.ts`, `src/components/products/profitability.tsx`, pruebas unitarias y navegador.
Interfaces: mes opcional en consulta financiera; resumen presupuestario con totales originales para asignación precisa, cantidad de unidades finales del producto/combo; margen de contribución y margen después de gastos separados.

- [x] Añadir pruebas de rentabilidad con prorrateo simple/combo/desconocido/negativo y flujo de navegador (Expected: rojo).
- [x] Pantalla con selector mensual, unidades previstas, edición de gastos, resumen presupuesto/real, cierre confirmado e historial con revisión motivada. Usar diseño visual existente, controles amplios y ayudas breves.
- [x] Integrar mes y gastos asignados en Costeo sin recalcular por interacción irrelevante.
- [x] Ejecutar pruebas de cálculo, permisos, integración, tipos, lint y navegador (Expected: verde).

## Task 4: habilitación y revisión final

- [x] Verificar y aplicar migración aditiva en desarrollo bajo autorización vigente, comprobar contenido previo y conservar `.env`.
- [x] Revisión fresca de la implementación completa; corregir problemas relevantes con pruebas.
- [x] Registrar verificaciones y límites reales en `docs/verification-business-overheads.md`.
- [x] Informar commit previo publicado y nueva funcionalidad sin commit/push.

Plan self-review: interfaces consistentes. Task 1 produce los tipos/tabla/cálculo usados por Task 2; Task 2 produce lectura financiera usada por Task 3; Task 4 valida conjunto y despliegue del esquema. La UI guarda el documento mensual completo con revisión; el cierre conserva copias independientes y no puede editarse silenciosamente.
