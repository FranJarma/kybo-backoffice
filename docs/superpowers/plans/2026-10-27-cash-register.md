# Caja diaria y conciliación de posnet — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking. User explicitly requested implementation now; do not ask for another design/plan confirmation. No commits or pushes.

**Goal:** Implementar apertura y cierre diario, gastos, retiros, pagos/anticipos y cierre de lote con comprobante privado, sin doble carga.

**Architecture:** Módulo `cash` con sesiones, libro de movimientos inmutable, comandos idempotentes y bloqueo por sucursal. Ventas/Compras registran sus movimientos dentro de su propia transacción. La interfaz operativa conserva el diseño aprobado y la administración de parámetros/permisos tiene una ruta exclusiva para administradores.

**Tech Stack:** Next 16.3.6, React 19.3, Drizzle/PostgreSQL, Zod, Blob privado/Sharp, Vitest/PGlite y Playwright.

**Spec:** `docs/superpowers/specs/2026-10-27-cash-register-design.md` (incluidos ajustes de aprobación).

## Global Constraints

- Rama `codex/cash-register`; sin commit, push ni migración en Neon. Pruebas únicamente descartables con `KYBO_ALLOW_TEST_MIGRATIONS=disposable-only`.
- Usar Autocomplete `src/components/ui/search-combobox.tsx` para relaciones buscables.
- Permisos y objetivos fuera de Caja; solo administrador puede cambiarlos. Encargado opera, retira, paga y revisa.
- Dinero exacto en centavos; fechas reales del servidor y jornada en la zona de sucursal. Horario 23:00 y fondo objetivo `null` inicialmente.
- No cobros/gastos/compras duplicados por reintentos. Un retiro de cierre se resta una sola vez; diferencia = contado − esperado antes del retiro.
- Cierre con diferencias o posnet pendiente exige motivos; no bloquea la siguiente apertura.
- Fotos privadas, autorizadas por sucursal/sesión; no URL pública ni reutilización de foto ajena. Cámara/galería con vista previa.
- No se modifica el historial anterior a la activación de Caja. Una vez activada, cobrar localmente exige una sesión abierta.
- Trabajo en el checkout/rama preparados por pedido del usuario. Los pasos de commit/creación de otro worktree del skill no se aplican a su instrucción explícita.

## Review Focus

- Cierre concurrente con cobro o devolución: el movimiento entra antes del corte o se rechaza, nunca queda fuera del arqueo ni en una sesión cerrada. Tests Task 1/2.
- Permiso revocado o sucursal cambiada, incluso reintento: no permite leer fotos ajenas ni ejecutar una operación usando privilegios viejos. Tests Task 1/4.
- Registro y aplicación concurrente de anticipos: no sobrepaga recepciones, no consume crédito dos veces y no genera una segunda salida de efectivo. Tests Task 3.
- Gasto de caja y análisis mensual cerrado: conserva snapshots y no mezcla compras de mercadería con overhead ni cambia un cierre mensual retroactivamente. Tests Task 2.
- Foto cargada pero cierre fallido/reintentado: el comprobante sigue disponible para ese borrador, un cierre no puede apropiarse de evidencia de otra sesión; no se confirma un cierre sin evidencia requerida. Tests Task 1/4.

## Task 1: Modelo y comandos de Caja

**Files:** `src/db/cash-schema.ts`, `drizzle/0028_cash_register.sql`, `src/modules/cash/{types,validation,access,calculation,integration,service,queries}.ts`; `src/db/schema.ts`, `src/modules/operations/command.ts`; `tests/helpers/data-model-database.ts`; `tests/cash-register*.test.ts`.

**Interfaces:** tipos públicos definidos en `src/modules/cash/types.ts`. `cashAvailable(db): Promise<boolean>`; `recordCashMovement(tx, ctx, input: CashMovementInput): Promise<string|null>` se ejecuta dentro de la transacción del documento, serializa el bloqueo de configuración/sesión y aumenta revisión. `getCashSnapshot(db,actor,sessionId?): Promise<CashSnapshot>`; `runCashCommand(db,actor,requestId,command): Promise<CashSnapshot>`; `getCashSettings`/`runCashSettingsCommand` solo administrador. Endpoints Task 4.

- [x] Escribir pruebas RED de importes, cierre, autorización, aislamiento de sucursal, idempotencia, jornada después de medianoche y motivo obligatorio. Comando: `pnpm exec vitest run tests/cash-register.test.ts tests/cash-register.integration.test.ts`.
- [x] Crear tablas/configuración/permisos/sesiones/libro/gastos/cierre/adjuntos. Una sola sesión abierta por sucursal; claves de origen únicas en movimientos; FK y checks monetarios coherentes.
- [x] Implementar comandos `open`, `expense`, `withdraw`, `close`, `review` y configuración `configure`/`permission`. El cierre requiere `expectedRevision`; conserva conteo/esperado/retiro/fondo/diferencias y comprobantes. Cambios posteriores agregan revisión, no reescriben el cierre.
- [x] Bloquear configuración de caja antes de sesión en cada operación y registrar cobros/egresos en la transacción del origen. Configurar activa parámetros; la primera apertura activa el requerimiento de caja para cobros futuros. No hace backfill.
- [x] Verificar GREEN de suites; guardar evidencia en `.superpowers/cash-implementation/progress.md`, sin commit.

## Task 2: Ventas y gastos mensuales

**Files:** `src/modules/sales/service.ts`; `src/modules/overheads/{service,types}.ts`; `src/components/finance/expenses-manager.tsx`; pruebas `tests/cash-sales.integration.test.ts`, `tests/cash-overheads.integration.test.ts`.

**Consumes:** `recordCashMovement(tx,ctx,{kind,amount,sourceType,sourceId,methodKind,methodName,concept,reference?,occurredAt?})` registra importes firmados (colección positiva/reembolso negativo), y no hace nada antes de activar Caja. Tipos exactos en Task 1.

- [x] RED: cobro dividido por medio, reintento, devolución de una venta anterior en jornada actual, y caja cerrada tras activación.
- [x] Registrar cada pago local con su ID de `salePayments` en creación/pago/cancelación, ignorar cobros por plataforma y no sumar tarjetas al cajón. Adquirir el bloqueo de Caja al inicio de operaciones financieras para evitar inversión de bloqueos.
- [x] RED: un gasto del día entra una vez al análisis mensual, una compra no se suma, y un cierre mensual previo no se reescribe. Exponer filas automáticas de Caja separadas y de solo lectura; el resumen incorpora el registro original sin exigir cargarlo nuevamente. No copiar esas filas al payload manual.
- [x] GREEN: `pnpm exec vitest run tests/cash-sales.integration.test.ts tests/cash-overheads.integration.test.ts tests/overheads.test.ts tests/overheads.integration.test.ts`; evidencia, sin commit.

## Task 3: Compras y anticipos

**Files:** `src/db/purchase-advance-schema.ts`, `drizzle/0029_purchase_advances.sql`, `src/modules/procurement/{advances,types,queries,receipts}.ts`; `src/modules/inventory/{service,types,validation}.ts`; UI de compras correspondiente; rutas de anticipos; pruebas `tests/cash-purchases.integration.test.ts`.

**Consumes:** `recordCashMovement` del Task 1. `purchasePayments` sigue siendo el registro directo de pagos a recepción. Los anticipos y aplicaciones tienen identidades propias y conservan proveedor/sucursal/pedido. No editar archivos de Task 1; pedir al responsable agregar la migración 0029 al fixture/journal.

- [x] RED de anticipo externo $100.000 → recepción parcial $60.000 → remanente $40.000, sin movimiento de caja ni pago repetido; aplicación idempotente; recepción sin costo conserva crédito; bloqueo de cruce de proveedor/sucursal.
- [x] Implementar registro administrativo de anticipo con medio/fecha/origen explícitos. Caja origen solo para medio efectivo; externo no disminuye cajón. Pagos al recibir conservan su recorrido actual e incorporan origen del dinero.
- [x] Aplicar créditos disponibles del pedido en recepción con costo real, incluso parcial, en la misma transacción. Mostrar adelantado/aplicado/remanente y resolver cancelaciones sin fingir devolución automática. No inventar total del pedido sin precios.
- [x] UI: registrar anticipo desde detalle del pedido; pago a recepción con origen; una sola confirmación financiera y referencias visibles. APIs usan autorización efectiva y comandos idempotentes.
- [x] GREEN: `pnpm exec vitest run tests/cash-purchases.integration.test.ts tests/purchase-orders.integration.test.ts tests/purchase-shipping.integration.test.ts`; evidencia, sin commit.

## Task 4: Fotos privadas y HTTP

**Files:** `src/modules/cash/{photos,http}.ts`; rutas `src/app/api/cash/{route,status/route,photos/route,photos/[id]/route}.ts`, `src/app/api/settings/cash/route.ts`; `tests/cash-photos*.test.ts`, `tests/cash-http.test.ts`.

**Endpoints:** GET `/api/cash?sessionId=...` → `CashSnapshot`; POST `{requestId, command}` → `CashSnapshot`. GET `/api/cash/status` → `{available,activated,open,sessionId,canOpen}` sin importes. GET/POST `/api/settings/cash` → `CashSettingsSnapshot`. POST `/api/cash/photos?sessionId=...` body imagen cruda → `{id,url}`; GET `/api/cash/photos/:id` stream privado sin caché pública.

- [x] RED: autorización/CSRF/límite real de bytes/imagen inválida/sucursal cruzada/evidencia de otra sesión.
- [x] Normalizar JPG/PNG/WebP hasta 10 MB, una imagen no animada, rotar y conservar legibilidad. Almacenar con `PhotoStorage` privado existente y tabla propia, fuera del limpiador de fotos de productos. Borrar carga huérfana si falla persistencia y no borrar comprobantes confirmados.
- [x] Exigir permisos efectivos de cierre para carga; lectura requiere acceso actual a Caja/sucursal. Al cerrar, adjuntos de esa misma sesión se reclaman una sola vez y permanecen legibles después del cierre/revisión.
- [x] GREEN con almacenamiento falso en pruebas, sin subir fotos reales; evidencia, sin commit.

## Task 5: Interfaz operativa y administración

**Files:** `src/components/cash/*`; páginas `src/app/(operations)/finance/cash/page.tsx`, `src/app/(operations)/settings/cash/page.tsx`; `src/lib/navigation.ts`; integración informativa POS; `tests/e2e/cash-register.spec.ts` y pruebas UI necesarias.

**Consumes:** `src/modules/cash/types.ts` y endpoints Task 4, usando `useApiData`/`api`/`useMutation` según patrones existentes. La maqueta aprobada está en `.next-e2e/cash-prototype/` (referencia visual, no copiar sus datos ni controles de demostración).

- [x] Construir Caja: estado de apertura, esperado, libro y otros medios; gastos y retiros; historial/revisión. Capacidad por persona, sin pestañas/botones de permisos ni configuración de fondo.
- [x] Construir cierre Efectivo → Posnet → Revisar; motivos/diferencias, varios lotes, foto cámara/galería con vista previa/ampliación/eliminación, conservar borrador al ir atrás. El servidor recalcula siempre; conflicto conserva datos y pide revisar cifras actuales. Sin acreditar un pago por el solo hecho de registrar un lote.
- [x] Configuración de caja en Configuración, solo administrador: horario, fondo objetivo nullable y permisos por empleado usando Autocomplete. Ni encargados ni personal pueden concederse permisos ni modificar el fondo.
- [x] POS muestra enlace a abrir Caja si la sucursal está activada pero no hay sesión; el servidor es la autoridad de cobros. Vista responsive 390/768/1024/1440 y acciones fijas en cierre móvil.
- [x] Verificar typecheck/lint y Playwright con APIs simuladas, y por separado los servicios reales en base descartable; sin datos de ejemplo en producción. No se afirma una prueba de navegador conectada a esa base.

## Task 6: Integración y entrega

- [x] Revisar todas las fronteras de autorización, idempotencia, signos, orden de bloqueos, gastos mensuales y fotos. Revisión independiente final (skill requesting-code-review), sin commit/push.
- [x] Ejecutar `pnpm typecheck`, lint y suites nuevas/afectadas. Comparar cualquier fallo con el baseline documentado; no atribuirse fallos previos ni omitir fallos nuevos.
- [x] Documentar migraciones 0028/0029 y preparar aplicador acotado/idempotente para revisión; no usar migrador genérico deshabilitado ni modificar `.env`.
- [x] Entregar cambios locales, pruebas y límites concretos; solicitar autorización nueva para aplicar a Neon solo cuando el circuito esté completo y revisable. No registrar movimientos reales para probar.

## Registro de ejecución

El avance y las decisiones de integración se guardan en `.superpowers/cash-implementation/progress.md`. La orden del usuario de implementar y no hacer commit/push prevalece sobre pausas y pasos de commit de los skills. Las tareas 2, 3 y 5 pueden trabajarse en paralelo después de publicar los tipos/contrato de Task 1, con propiedad de archivos separada. Cada implementador lee el plan y usa TDD para lógica financiera.


Resultado final: docs/superpowers/plans/2026-10-27-cash-register-result.md. 127 pruebas de dominio/integración y 21 de navegador aprobadas; compilación Webpack, tipos y lint aprobados. 0028/0029 fueron autorizadas posteriormente y aplicadas en Neon, con consultas reales de Caja, configuración y Compras verificadas. Sin operaciones de prueba, commit ni push.
