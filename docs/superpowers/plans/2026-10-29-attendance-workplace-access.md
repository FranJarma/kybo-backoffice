# Asistencia con QR y puesto del local Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. El usuario autorizó implementar la propuesta aprobada en esta sesión, sin commit ni push. Se aprovecha el trabajo existente en `codex/staff-attendance`; no se traslada ni descarta el árbol sin guardar.

**Goal:** Implementar el puesto compartido del local, organización personal de la encargada desde esa PC, fichaje mediante QR dinámico y trabajo personal desde el celular.

**Architecture:** Mantener la identidad del puesto separada de la autorización temporal de gestión y de las cuentas personales. Los QR se firman por sucursal, revisión de configuración y ventana de 60 segundos; abren intentos personales persistentes de dos minutos, consumidos en la misma transacción del fichaje. La planificación, preparación/entrega, producción y excepciones existentes siguen siendo la base funcional.

**Tech Stack:** Next 16.3.6, React 19.3, TypeScript, Drizzle/PostgreSQL, Better Auth, SimpleWebAuthn, Vitest/PGlite, UI Kybo/SearchCombobox.

**Spec:** `docs/superpowers/specs/2026-10-29-attendance-access-final-design.md` (aprobado para implementar por el usuario el 29/10/2026).

**Estado final:** tareas 1–6 implementadas y verificadas en código y base descartable. La entrega inicial se mantuvo sin commit ni push; el usuario autorizó posteriormente publicar esta rama, excluyendo las imágenes y temporales de otros chats. El usuario también autorizó expresamente aplicar únicamente 0032 en Neon; se aplicó y se verificó después mediante otra conexión de solo lectura. El historial contiene 33 migraciones coincidentes y las nueve tablas nuevas se crearon vacías. Los datos existentes y el `.env` se conservaron; no se crearon cuentas o fichajes reales.

**Verificación:** compilación de producción completa (92 páginas), TypeScript, ESLint y pruebas enfocadas aprobadas. La última corrida del grupo principal pasó 95/95 pruebas en 17 archivos; la regresión de cobros y comprobantes pasó 26/26, conservando sus límites de consultas. La suite general no está verde: detectó fallos de fixtures históricos y validación, además de la falta de una base PostgreSQL descartable para concurrencia. Los fallos introducidos por este trabajo fueron corregidos y sus grupos volvieron a pasar. Se reprodujeron tres archivos representativos en una copia del HEAD anterior con las dependencias actuales; esto no certifica todos los archivos fallidos de la suite general. Evidencia detallada en `.superpowers/sdd/2026-10-29-attendance-workplace-access/`.

**Verificación visual:** navegador de escritorio y vista móvil 390 × 844 sobre la implementación real con PGlite en memoria y usuarios ficticios. Se comprobó autorización de Verónica sin reemplazar la sesión del local, guardado y regreso al punto de venta, renovación del QR y navegación personal entre jornada, tareas y producción. El botón de registrar entrada queda visible sin desplazamiento. No se verificaron GPS, desbloqueo ni instalación PWA en un teléfono físico con HTTPS. El servidor descartable fue detenido y las pestañas de prueba cerradas.

**Verificación para publicación:** TypeScript y ESLint aprobados sobre el árbol a publicar, excluyendo los temporales del otro chat. Corrida fresca: 9 archivos y 65 pruebas aprobadas de cuenta del local, QR, tareas personales, invitaciones, dirección de sucursal, cobros y comprobantes. Se verificó la lista exacta de 192 archivos preparados: ningún temporal, imagen, PDF ni documento de manuales; estos materiales permanecen fuera del commit. Los fallos previos de la suite general siguen documentados arriba.

## Global Constraints

- La implementación inicial debía conservarse sin commit ni push. La autorización posterior del usuario permite publicar esta rama, manteniendo fuera `tmp`, `.tmp`, imágenes y documentos de PDF/manuales de otros chats.
- Cualquier migración futura a Neon requiere autorización específica nueva; implementar y probar primero en una base descartable.
- QR: renovación automática cada 60 segundos; intento personal de 2 minutos, ligado a cuenta, sesión y sucursal, de un uso por operación.
- Cada marca normal exige QR vigente al abrir el intento, ubicación reciente y verificación del celular. No hay un endpoint anterior que permita omitir el QR.
- No autorizar PC/tablets, no PIN por venta ni PIN diario de encargada. No selfies ni biometría propia.
- La cuenta operativa no hereda permisos de Encargado. «Responsable asignada» no acredita quién cobró físicamente.
- Horarios y pausas configurables existentes; preparación completa y entrega física siguen separadas.
- Invitación inicial: 3 días; opciones 24 h, 48 h, 3 días y 7 días. Contraseña inicial fuera de la URL; mensaje solo compartido manualmente.
- Reutilizar SearchCombobox, UI en línea y pocas interacciones. Leer documentación Next instalada antes de modificar rutas/componentes.

## Review Focus

- Acceso revocado, cambio de contraseña/rol o cierre de sesión mientras sigue abierta la gestión: no quedan permisos personales utilizables desde el puesto.
- Dos pantallas QR simultáneas y varios empleados: renovar una pantalla no invalida la otra ni consume el QR para todos.
- Respuesta perdida o dos toques: no se duplica una marca, una preparación, una invitación ni una asignación.
- Código vencido durante login, vuelta desde PWA/navegador o sucursal distinta: retorno interno correcto, sin extender el código ni cambiar la sesión de la PC.
- Puesto no asignado o cambiado mientras preparaba: los permisos se comprueban también en los endpoints existentes; no se filtran datos de otras personas ni se confunde listo con entregado.

## Files and ownership

- `src/db/workplace-schema.ts`, `src/modules/workplace/*`, `src/components/workplace/*`, `src/app/api/workplace/route.ts`: cuentas operativas, autorizaciones limitadas y organización de puestos.
- `src/db/attendance-access-schema.ts`, `src/modules/attendance/qr.ts`, `src/app/api/attendance/qr/route.ts`, `src/components/attendance/qr-screen.tsx`: QR e intentos personales.
- `src/modules/staff-work/*`, `src/components/staff-work/*`, `src/app/api/staff/work/route.ts`: tareas propias del celular, con autorización en servicios de preparación existentes.
- `src/db/invitations-schema.ts`, `src/modules/invitations/*`, `src/components/users/*`: invitaciones y alta guiada personal.
- Integración común a cargo del controlador: `src/lib/access.ts`, `src/lib/auth.ts`, contexto de sucursales, navegación/shell, login, páginas, comandos de asistencia, `src/db/schema.ts`, migración `0032_attendance_workplace_access.sql` y fixture.
- No editar el mismo archivo desde implementadores distintos. Cada implementador entrega SQL de su módulo como fragmento en el espacio de trabajo; el controlador compone la única migración y su journal.

### Task 1: Cuenta del local y autorización de la encargada

**Files:** workplace-schema, modules/workplace, components/workplace; tests/workplace.integration.test.ts y workplace-ui.test.ts.

**Interfaces:**
- Actor agrega opcionales `sessionId: string`, `accountKind: "personal" | "store"`, `storeBranchId: string`; la sesión proviene de Better Auth, nunca del cuerpo HTTP.
- `workplaceSchemaReady(db)` permite desplegar antes de aplicar la migración, sin consultar tablas faltantes.
- `getStoreProfile(db, userId)` devuelve `{ userId, branchId, enabled } | null`.
- `requireStoreAccount(db, actor)` comprueba perfil habilitado, sucursal, permisos vivos y sesión; no convierte al puesto en encargado.
- `authorizeManagement(db, storeActor, {identifier,password}, now)` devuelve token aleatorio y `{managerId,managerName,expiresAt}`. Vigencia máxima 10 minutos, ligada a sesión del puesto/sucursal y credencial vigente de la encargada.
- API propia `/api/workplace` consume autorización en memoria mediante `X-Kybo-Management`; salida y guardado la revocan. Solo acepta organización de puestos y requestManual/redeemManual; nunca aprobar excepciones, configurar o administrar usuarios.
- `getPersonalStations(db, actor, now)` devuelve asignaciones propias con `station: "sales" | "bar" | "kitchen"`, startsAt/endsAt y fecha; consumidor Task 3.

- [x] Escribir pruebas: cuenta limitada; contraseña incorrecta/limitación de intentos; gestión ligada a otra sesión/sucursal rechazada; permisos/contraseña revocados invalida token; salida/guardado revoca; asignación atómica con revisión y horarios configurados.
- [x] Ejecutar `pnpm exec vitest run tests/workplace.integration.test.ts` y observar fallos de comportamiento nuevo.
- [x] Implementar tablas, servicios y API limitada, creación de cuenta operativa solo administrativa y UI de autorización/puestos según maqueta. Guardar no modifica el carrito.
- [x] Ejecutar pruebas hasta verde; entregar fragmento SQL e interfaces al controlador. Sin commit.

### Task 2: QR dinámico e intento personal obligatorio

**Files:** attendance-access-schema, attendance/qr.ts, attendance service/validation, API QR; tests/attendance-qr.test.ts, attendance-qr.integration.test.ts.

**Interfaces:**
- `issueAttendanceQr(branchId, revision, secret, now)` -> `{code,expiresAt}`; firma HMAC con separación de propósito, ventana exacta de 60 segundos, QR coherente entre pantallas.
- `openAttendanceQrAttempt(db, actor, {code,requestId}, now)` -> `{id,branchId,expiresAt}`. Valida código, permisos, participación/configuración y sesión; cuenta operativa rechazada.
- `consumeAttendanceQrAttempt(tx, actor, attemptId, requestId, revision, now)` reclama intento bajo bloqueo y rechaza vencimiento/reutilización/otra sesión/sucursal.
- Comando punch agrega `qrAttemptId`; la confirmación WebAuthn incluye ese campo. Replay de operación idéntica se resuelve antes de volver a consumir el intento.

- [x] Pruebas de firma adulterada, límite 60 s, futuro, cambio de política, varias pantallas y varias personas; intento vence a 120 s y se liga a identidad/sesión/sucursal.
- [x] Observar RED; implementar tokens e intentos con límites y transacción; adaptar fixtures de asistencia para exigir QR real en sus pruebas.
- [x] Pruebas de endpoint anterior sin QR, doble operación y replay tras respuesta perdida. Ejecutar pruebas hasta verde.

### Task 3: Trabajo personal desde el celular

**Files:** modules/staff-work, components/staff-work, API staff/work; servicios de preparación y pruebas staff-work.integration.test.ts.

**Interfaces:**
- `getStaffWork(db, actor, now)` devuelve puestos propios, pedidos de esas estaciones y producción asignada; no cuentas operativas.
- Comandos de preparación usan los servicios start/complete existentes e idempotencia existente; comprueban la asignación también por rutas alternativas.
- `PersonalWork({branchId,actorId})` componente con pestañas Mis tareas y Producción; el controlador lo integra junto a Mi jornada.

- [x] Escribir pruebas de filtrado propio, ninguna estación, turno cruzando medianoche, cambio de asignación, ruta alternativa de completar y producción ajena.
- [x] Observar RED; implementar consulta y autorización compartida, usando cantidades/concurrencia y distinción listo/entregado existentes.
- [x] Construir UI móvil con líneas de la estación, comenzar/marcar listo y registro de producción en Depósito; ejecutar pruebas hasta verde.

### Task 4: Invitación y activación personal guiada

**Files:** invitations-schema, modules/invitations, UI usuarios, login/identity integration; tests/invitations.integration.test.ts y onboarding.test.ts.

**Interfaces:**
- Crear/renovar invitación administrativa es idempotente; devuelve mensaje privado listo para copiar/WhatsApp, nunca lo envía.
- Activación pendiente válida limita acceso hasta primer ingreso en invitación vigente; actorFromHeaders debe rechazar cuentas pendientes. Cuenta activa no pierde acceso al vencer invitación histórica.
- Alta de credencial después del ingreso usa autorización breve de sesión y no repite la contraseña recién validada; sesiones antiguas siguen requiriendo contraseña.

- [x] Pruebas de expiración, renovación, replay, cuenta deshabilitada, invitación ajena, contraseña histórica, no filtración de secretos y autorización de enrolamiento vencida/otra sesión.
- [x] Observar RED; implementar almacenamiento cifrado de mensaje pendiente y activación ligada a login actual sin debilitar el ingreso normal; ejecutar pruebas hasta verde.

### Task 5: Integración de rutas, permisos y experiencia final

**Files:** auth/context/navigation/AppShell, POS, login, páginas staff y attendance/manager/personal; tests/attendance-access-http.test.ts, navigation.unit.test.ts, attendance-ui.test.ts.

- [x] Pruebas de retorno de login interno permitido (rechazar //, URL externa y rutas arbitrarias), sucursal explícita para Personal, cuenta local sin fichaje personal ni acceso administrativo por URL/API.
- [x] Observar RED; propagar tipo de cuenta/sesión desde el servidor; agregar accesos QR y gestionar sin desmontar el carrito; cuenta personal usa vista móvil sin emisor de QR.
- [x] Integrar apertura de intento QR antes del fichaje; mostrar persona, sucursal, código vencido, falta de conexión y verificación requerida; consumirlo al guardar y pedir nuevo escaneo para siguiente marca.
- [x] Integrar configuración/alta del puesto en Usuarios y controles existentes; no crear cuentas reales automáticamente ni guardar contraseñas en URL/localStorage.
- [x] Ejecutar pruebas de integración de rutas/permiso/UI hasta verde.

### Task 6: Migración, revisión y verificación completa

**Files:** drizzle/0032_attendance_workplace_access.sql, journal, schema.ts, tests/helpers/data-model-database.ts y registro de verificación.

- [x] Componer una migración aditiva de tablas nuevas, sin habilitar participantes, crear cuentas reales, mover stock ni cambiar puntos de fichaje.
- [x] Ejecutar migración y pruebas solo en PGlite descartable autorizado; preservar Neon y .env.
- [x] Ejecutar toda la suite con `KYBO_ALLOW_TEST_MIGRATIONS=disposable-only`, typecheck, lint y build; investigar fallos y distinguir los preexistentes con evidencia.
- [x] Revisión fresca completa de seguridad y del alcance aprobado; corregir hallazgos importantes con pruebas RED/GREEN.
- [x] Verificar UI PC/tablet/celular con capturas y casos de errores/latencia. No afirmar validación física de GPS o biometría si no se probó en teléfono HTTPS real.
- [x] Preparar resultado revisable y pedir autorización específica para aplicar únicamente 0032 en Neon, si hace falta activarla. Sin commit ni push.
