# Impresión de comandas USB — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans task by task. El usuario autorizó la implementación completa; resolver elecciones rutinarias sin otra aprobación. Sin commit ni push.

**Goal:** Imprimir automáticamente cada comanda por estación mediante una Hasar USB en Windows, con modificadores claros, cola durable y copias auditadas.
**Architecture:** Outbox transaccional PostgreSQL; conector Windows por HTTPS saliente con journal local y spooler; UI dentro del detalle en modal y configuración administrativa. Ninguna espera de hardware en el cobro.
**Tech Stack:** Next 16/React/Drizzle/Zod, Vitest/PGlite, PowerShell 5.1 + C# Win32/System.Drawing (incluidos en Windows), Playwright. Sin dependencias de impresión de terceros ni entorno de desarrollo en la PC de caja.
**Spec:** `docs/superpowers/specs/2026-11-02-order-ticket-printing-design.md` (aprobado al pedir implementar el 2/11).

**Autorización posterior:** tras completar la implementación, el usuario autorizó únicamente la migración 0035 en Neon y luego commit y push de esta rama. La 0035 ya está aplicada y la salida de los dos tickets USB fue confirmada por el usuario. El resultado y los pasos pendientes de publicación/vinculación están en `2026-11-02-order-ticket-printing-result.md`; estas autorizaciones reemplazan las restricciones originales correspondientes del plan.

## Global Constraints

- Rama aislada `codex/order-ticket-printing`; sin commit, push, impresión real, instalación local operativa ni migraciones en Neon. Tests con `KYBO_ALLOW_TEST_MIGRATIONS=disposable-only`.
- Migración aditiva siguiente `0035_order_printing`; instalación sin tablas sigue vendiendo y muestra activación pendiente. No backfill de trabajos históricos.
- Hasar P-HAS-181 USB en PC Windows. Una cola física; tickets separados por estación. Padres de combo solo referencia; hijos conservan ruta y cantidades ya multiplicadas.
- Snapshot original incluye grupo/opción/cantidad/instrucción de modificadores; notas separadas. Nunca reconsultar receta para una copia ni sumar productos con distintas elecciones.
- Enviado significa aceptado por Windows, no papel confirmado. No repetir envíos ambiguos; antes de copiar reconciliar/cancelar el original retenido.
- Credencial técnica por conector/sucursal, revocable, hash en servidor y DPAPI CurrentUser en Windows. Emparejamiento 10 min de un uso; secretos fuera de logs y argumentos del proceso.
- Colas solo imprimen activos; trabajos >60 s o con preparación iniciada se retienen para revisión. Reconexión no dispara tandas de comandas viejas. Las anulaciones usan avisos separados.
- Reutilizar Autocomplete para relaciones buscables y preservar carrito/filtros/modal. Admin configura; operadores autorizados a la venta reimprimen solo esa sucursal. Sin nuevo emisor de QR ni permisos de asistencia.

## Review Focus

- Corte entre aceptación del spooler y ACK: journal y estado incierto impiden duplicados (Task 2/4).
- Combo con bebida y comida, gaseosa sin receta y producto sin estación: no perder ni duplicar líneas (Task 1).
- Otra sucursal, revocación o conector concurrente: leases/validación viva rechazan (Task 1/4).
- Reprint de respuesta perdida, nota larga, modificadores por unidad y cambio de catálogo: misma copia y snapshot original (Task 1/3).
- Rollback/cancelación y cobro posterior de mesa: ningún trabajo huérfano o repetido (Task 4).

## Contrato conector HTTP v1

`POST /api/printing/connector`, JSON. Acción `pair` sin cookies: `{action:'pair',code,printerName}` -> `{connectorId,token,printerName}`. Origen servidor proporcionado al instalar; HTTPS obligatorio salvo localhost de prueba. Token bearer en acciones siguientes, nunca en URL.

- `heartbeat`: `{action,instanceId,printerStatus:'ready'|'offline'|'paper-out'|'unknown'|'error',printerMessage?}` -> `{ok:true,serverNow,reconcile:{id,leaseToken,spoolJobId:number|null,documentName:string}[]}`. Reconciliar estos trabajos consultando ID/nombre en Windows, sin volver a enviarlos. Backend marca presencia/ausencia de cola sin afirmar salida física.
- `claim`: `{action,instanceId}` -> `{job:null|{id,leaseToken,leaseExpiresAt,printerName,documentName,document:TicketDocument}}`.
- `begin`: `{action,instanceId,jobId,leaseToken}` -> `{dispatch:boolean}`. Obligatorio antes de crear un trabajo Windows. Valida vigencia y marca sending.
- `report`: `{action,instanceId,jobId,leaseToken,outcome:'sent'|'failed'|'uncertain'|'cancelled',spoolJobId?,error?}` -> `{ok:true}`. Reenviar mismo reporte es idempotente; aceptar ACK tardío solo para el mismo envío no sustituido.
- `reconcile`: `{action,instanceId,jobId,leaseToken,spoolJobId?,outcome:'present'|'removed'|'unknown'}` -> `{ok:true}`. Informa el resultado del journal/consulta local sin generar otra impresión. El worker procesa este resultado antes de copias que dependan del original. Las copias esperan ausencia del original en Windows; si sigue presente no crear un segundo envío ni cancelarlo silenciosamente. El operador revisa esa cola; la aplicación explica el bloqueo.

`TicketDocument = {version:1,widthDots:576,lines:{text:string,style:'normal'|'bold'|'title'|'heading'|'small',align?:'left'|'center'}[],logo:true}`. El servidor genera líneas seguras, el conector rasteriza Unicode con System.Drawing y emite ESC/POS. Texto nunca se evalúa ni se interpreta como comandos. Ancho fijo configurable en Windows para la prueba de hardware (576 inicial, admisión acotada a 384/512/576). Logo asset original de Kybo incluido en el instalador.

## Task 1: Modelos, cola y documentos

**Files:** `src/db/printing-schema.ts`, `drizzle/0035_order_printing.sql`, schema/journal, `src/modules/printing/{types,availability,document,snapshot,service,connector,validation}.ts`, `tests/printing-{document,queue}.test.ts`, `tests/helpers/data-model-database.ts`.

**Interfaces:** `enqueueOrderPrints(tx,actor,orderId)`, `cancelOrderPrints(tx,actor,saleId)`, `notifyLocatorChange(tx,actor,orderId)`; `getPrintingSnapshot(db,actor,saleId?)`; `runPrintingCommand(db,actor,requestId,command)`; `runConnectorCommand(db,bearer,input)`. DB access snapshot/routing shared; pure `ticketDocument(snapshot,{kind,copyNumber,requestedAt})` returns TicketDocument.

- [x] RED pure document tests: modifiers per unit, notes distinct, no control bytes/prices, combo children only and wrapped Unicode. RED disposable queue tests: missing schema, disabled, idempotent originals, other branch, pair/revoke, two claimants, stale lease, copied snapshot/replay, uncertain freeze.
- [x] Implement migration/settings/connectors/tickets/jobs/request ledger with unique constraints, scoped FKs, row locks. Pair and bearer use cryptographic random tokens; store only hashes. Settings default disabled, pairing rotates/revokes previous connector, active machine instance heartbeat and lease exclusivity.
- [x] Implement typed document/snapshot from sale lines, task routes, sold modifiers; fallback REVISAR ESTACIÓN for operative unmapped rows; preserve combo metadata without parent duplication. Job labels opaque IDs, no customer data in Windows title.
- [x] Implement operator/config/connector services with server-side validation. Browser mutations origin-checked; machine endpoint bounded JSON + bearer auth, not browser session. Copies with reason, one sequence and idempotency; unresolved originals cannot bypass reconciliation.
- [x] Verify focused tests green and record evidence. No commit.

## Task 2: Conector Windows — componente independiente

**Files:** `connector/windows/{Install-KyboPrintConnector.ps1,KyboPrintConnector.ps1,KyboPrintNative.cs,README.md}`, `connector/windows/tests/Test-KyboPrintConnector.ps1`, installer asset bundling script/function.

**Interfaces:** HTTP v1 above, immutable TicketDocument. Installer accepts server URL + pairing code through prompts (not shared secrets on command line), selects exact installed queue and enrolls. Download payload contains source files/logo; installer code can operate with embedded payload generated by server.

- [x] RED tests with fake HTTP/spool adapter: first send, duplicate claim, crash before spool/after spool before ACK, uncertain recovery, canceled begin, spool failure, Unicode document render, two processes same local journal. No Win32 print submission in tests.
- [x] Implement PowerShell worker with durable atomic per-job journal (flush before spool), cross-process mutex, heartbeat/claim loop, begin-before-submit, signed backend responses trusted only via HTTPS and scoped bearer. Query Windows existing job by ID/name during recovery; ambiguous absence never resubmits. Retry ACK, never blind spool retry.
- [x] Implement C# raster Unicode/monochrome logo and Win32 OpenPrinter/StartDocPrinter/WritePrinter/EndDocPrinter, status/cancel helpers, safe queue name handling. Preserve raw ESC/POS boundaries and physical cut. Windows-call cancellation/recovery is best effort and reflected honestly.
- [x] Installer DPAPI, restricted local directory, scheduled task current user on logon with hidden window, uninstall/revoke directions; dry-run/self-test safe by default. Package source reproducibly for app download without Node/Python requirement on local PC. Do not run installer, scheduled task, or print calls against real hardware.
- [x] Verify tests via Windows PowerShell and compile/render native helper without sending bytes; record evidence. No commit.

## Task 3: Interfaz de pedidos y configuración

**Files:** `src/components/printing/{order-printing,printing-settings,printing.css}.tsx` (CSS separate .css), `src/app/(operations)/settings/printing/page.tsx`, `src/app/api/printing/{route.ts,connector/route.ts,installer/route.ts}`, navigation, `src/components/sales/{sale-detail,sales-manager}.tsx`; UI/E2E tests.

**Interfaces:** GET `/api/printing?saleId=` -> PrintingSnapshot; POST `{requestId,command}` with `configure|pairing|revoke|reprint|retry|resolve|test` commands. Expose exact exported DTOs from Task1. No secret recovery: pairing code only newly generated response; technical token only pair endpoint.

- [x] RED renderer/browser tests for per-station row, modifier ticket preview, required reason/Other, copy-only-selected, pending activation, errors do not close/order reset, admin route guard.
- [x] Build inline print status/order detail integration, accessible reprint dialog, polling only visible, scoped error/retry identity retained on lost response; normal state quiet and errors explicitly keep confirmed order.
- [x] Build Configuración > Impresión, allow enable/disable, installed queue name, conector/driver status separately, pairing one-use code, revoke and private installer download. Use actual route permissions/Autocomplete as appropriate. Add review-pending queue with safe release/discard controls and history.
- [x] Validate PC/tablet/mobile widths and dialog focus with synthetic data; no hardware or Neon. No commit.

## Task 4: Hooks, entrega y revisión

**Files:** sales/service `insertOrder`/cancel hooks, pickup command hooks; relevant integration/browser tests; `docs/superpowers/plans/2026-11-02-order-ticket-printing-result.md`.

- [x] RED sales fixture tests: rollback leaves no work, original once on replay, Mesa second comanda then later payment does not duplicate, combo across stations, packaged goods included, cancellation invalidates pending / sends cancellation advisory after dispatch, locator change notice.
- [x] Wire server transaction hooks at existing authoritative operations only. Old schema readiness probe cached per request/transaction without caching false indefinitely, safe rolling deploy. Avoid circular sales/printing imports.
- [x] Verify Task1–3 suites, regressions of checkout/pickup/preparation, typecheck, scoped lint and production build with test-only env. Never use production DB to build fixtures. Restore generated Next-only config changes attributable to verification.
- [x] Fresh independent whole-branch security/queue/USB review, fix important findings with regression evidence. Record remaining physical proof and migration activation steps honestly.
- [x] Leave all changes uncommitted/unpushed. Only after all verification, ask separately for applying 0035 to Neon, with exact scope. No install/printing permissions implied by that DB approval.
