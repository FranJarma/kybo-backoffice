# Asistencia del personal — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Implementar la asistencia aprobada: turnos por fecha, fichaje personal con passkeys y cercanía, revisión y excepciones autorizadas con códigos únicos configurables por sucursal.

**Architecture:** Módulos de dominio y comandos transaccionales independientes de sus componentes. Las credenciales y confirmaciones WebAuthn son comunes a asistencia, inicio de producción y cierre de caja; la cercanía se exige para el fichaje. El servidor controla identidad, permisos vigentes, desafíos, hora, vigencia y consumo; ningún indicador del navegador concede autorización.

**Tech Stack:** Next.js 16.3.6 / React 19.3, PostgreSQL/Drizzle, Better Auth existente y SimpleWebAuthn con versión exacta verificada al instalar. Vitest con PGlite descartable para integración.

**Spec:** ../specs/2026-10-28-staff-attendance-design.md, aprobada mediante la propuesta visual y el pedido explícito de implementación del usuario.

## Global Constraints

- Trabajar en la rama existente codex/staff-attendance. Sin commit ni push. No tocar el manual ni los PDF/temporales del otro chat.
- No aplicar migraciones en Neon ni cambiar .env. Autorización de pruebas existente: KYBO_ALLOW_TEST_MIGRATIONS=disposable-only, solo memoria o directorio descartable dedicado.
- Una sola PWA online, sin una app nativa ni fichajes oficiales offline. No cachear respuestas autenticadas, desafíos ni comprobantes.
- Autocomplete existente en src/components/ui/search-combobox.tsx para empleados, sucursales y relaciones.
- Campos obligatorios señalados con FieldCaption, foco accesible y diseño Kybo aprobado, con acciones táctiles y pocas interacciones.
- Face ID/huella son métodos que el dispositivo puede ofrecer; se exige verificación WebAuthn, sin afirmar exclusividad biométrica ni guardar biometría.
- Coordenadas y activación se configuran explícitamente: no inventar la ubicación real de la sucursal ni activar nuevas restricciones con una configuración incompleta.
- Códigos: aprobación por otro administrador, solicitud inmutable, un solo uso, TTL por sucursal fijado al emitir; cambio de TTL afecta solo códigos nuevos.
- Conservar originales, hora declarada y horas de auditoría por separado. No interpretar pausas o interrupciones como productividad.
- Rulings de implementación se anotan en el ledger; no solicitar confirmación entre tareas ya autorizadas. La revisión final usa un revisor independiente.

## Review Focus

1. Dos acciones concurrentes o una respuesta perdida deben producir una sola marca y un solo consumo; probar replay, payload distinto y bloqueo por persona.
2. Un permiso, una credencial o una sucursal revocados entre desafío y confirmación deben impedir la operación; probar comprobación vigente al consumir.
3. Cambios de huso horario, medianoche y varios tramos de una misma jornada no deben duplicar tiempo; probar secuencias nocturnas y comparación agregada.
4. Aprobación tardía, canje incorrecto y configuración modificada no deben desplazar la hora declarada ni prolongar un código; probar TTL snapshot e intentos limitados persistentes.
5. Un cliente no debe autenticarse por otro usuario, modificar el contenido confirmado o acceder a códigos/ubicaciones ajenos; probar lectura por rol, enlace al payload y rechazo de campos extra.

## File structure

- src/db/attendance-schema.ts y src/db/identity-schema.ts: configuración, participantes, turnos, asignaciones, eventos originales, correcciones, autorizaciones, operaciones y credenciales/desafíos/pruebas.
- drizzle/0030_staff_attendance.sql y meta/_journal.json: cambio aditivo, sin datos reales ni habilitación automática.
- src/modules/attendance/{types,validation,rules,access,service,scheduling,queries}.ts: reglas puras, comandos y lectura por rol.
- src/modules/identity/{types,validation,crypto,service,confirmation}.ts: configuración de origen, registro con reautenticación, verificación y prueba consumible.
- src/app/api/attendance/route.ts y src/app/api/identity/route.ts: HTTP privado, validación de origen, sesión y tamaño; reusar catálogo/http.
- src/components/attendance/{manager,personal,register,manual,planning,settings,shared}.tsx y attendance.css: pantallas reales con la misma jerarquía de la maqueta.
- src/components/identity/{client,verification}.tsx: inscripción y confirmación WebAuthn, con mensajes de compatibilidad/cancelación.
- src/app/(operations)/staff/{attendance,schedule}/page.tsx y settings/attendance/page.tsx, navegación y shell: alcance personal/encargado/administrador.
- src/app/manifest.ts, layout.tsx, public/assets/pwa-*.png y componente de instalación: PWA online, sin service worker que intercepte datos privados.
- Integración limitada en módulos y componentes existentes de caja/producción, vinculando prueba a operación y contenido.
- tests/attendance*.test.ts, tests/identity*.test.ts y cobertura HTTP/UI pertinente; fixture de datos con opción de incluir la migración nueva.

### Task 1: Reglas, esquema y migración aditiva

**Interfaces:** tipos PunchKind, LocationEvidence, AttendanceSettingsInput y AssignmentInput. Reglas evaluateLocation(settings,evidence,now), validateTimeline(events), summarizeAttendance(events,now), assignmentWindow(input,timeZone).

- [x] Escribir tests en tests/attendance-rules.test.ts: rango/antigüedad/precisión/permiso, secuencias válidas e inválidas, pausas múltiples, noche, intervalos abiertos y comparación con turno.
- [x] Ejecutarlos y observar el fallo por módulo ausente.
- [x] Implementar tipos/reglas puras y esquema con claves foráneas, checks, índices y una identidad por persona que serializa sus operaciones entre sucursales. Validar configuración positiva y dejar activación deshabilitada hasta guardar coordenadas/participantes.
- [x] Crear 0030 y registrar journal. No ejecutar migrador real. Fixture carga 0030 solo en pruebas de asistencia, evitando alterar escenarios legacy.
- [x] Ejecutar tests de reglas e integración de esquema en PGlite vacío. Registrar resultado sin commit.

### Task 2: Credenciales y confirmaciones por operación

**Interfaces:** beginRegistration(db,actor,input,config), finishRegistration(db,actor,input,config), beginVerification(db,actor,binding,config), finishVerification(db,actor,input,config), consumeConfirmation(tx,actor,binding,proofId,now). Binding contiene sucursal, operación, resource/payload canónico y requestId.

- [x] Tests RED en tests/identity.integration.test.ts y tests/identity.unit.test.ts para origen/RP configurados, desafío de un uso, expiración, usuario distinto, credencial revocada, contenido alterado y reintento.
- [x] Instalar versiones exactas de SimpleWebAuthn según documentación primaria y lockfile. Usar verificación de firma real; las pruebas de integración pueden inyectar/verificar un autenticador de prueba sin exponer un bypass productivo.
- [x] Registro exige sesión personal y reautenticación con contraseña mediante Better Auth, o una passkey existente verificada para agregar otra; no basta enviar un nombre. Permitir revocación administrativa y recuperación mediante acceso autenticado.
- [x] Guardar clave pública, contador, transportes y auditoría; no guardar claves privadas ni PIN del teléfono. Desafíos breves de un uso y pruebas breves consumidas en la transacción de negocio.
- [x] Cliente hace feature detection, usa startRegistration/startAuthentication y trata cancelación como operación no realizada. HTTP devuelve no-store y respeta origen configurado en Better Auth, nunca Host arbitrario.
- [x] Ejecutar suites de identidad y autorización; ledger sin commit.

### Task 3: Fichajes y excepciones manuales

**Interfaces:** runAttendanceCommand(db,actor,requestId,command,now?), getAttendanceSnapshot(db,actor,filters,now?). Comandos punch, requestManual, approveManual, rejectManual, redeemManual; identidades/payloads se validan estrictamente.

- [x] Tests RED de entrada/pausa/reanudación/salida, doble entrada, acceso a otra sucursal, otra persona, pertenencia revocada y respuesta perdida.
- [x] Implementar autorización vigente, bloqueo por usuario, evidencia de ubicación reciente (30 s, hasta 10 s futuros), precisión máxima configurable y distancia conservadora dentro del radio. Hora del servidor en marcas normales; vincular asignación y jornada a la entrada.
- [x] Tests RED de solicitud manual: solo encargado/administrador, motivo obligatorio, aprobador administrativo distinto, código privado al solicitante, hash/cifrado en reposo, snapshot de TTL y canje atómico. Cinco intentos incorrectos inutilizan el código y quedan persistidos.
- [x] Implementar código aleatorio de seis dígitos, cifrado AES-GCM y HMAC con secreto de servidor; sin códigos en logs/listados ajenos. Renovar requiere solicitud y aprobación nuevas. Guardar hora declarada sin reemplazarla por la de aprobación.
- [x] Tests de código usado/vencido, cambios de estado tras aprobación y payload de requestId distinto; asegurar que UI/HTTP no habilitan una ruta alternativa.
- [x] Ejecutar reglas, identidad y comandos de asistencia; ledger sin commit.

### Task 4: Turnos, planificación y correcciones

**Interfaces:** comandos saveShift, assign, copyWeek, requestCorrection, resolveCorrection y configure; snapshot devuelve turnos, asignaciones versionadas, personal autorizado, eventos efectivos y originales, solicitudes y totales según rol.

- [x] Tests RED: 09–17 y 17–23 con pausa 30; horario particular; off incompatible; múltiples tramos sin solapamiento; medianoche; snapshot al editar plantilla; copia solo sobre vacíos; motivo para editar con fichajes.
- [x] Implementar calendario y guardas de revisión. Usar zona de sucursal y helper existente scheduleInstant, conservando instantáneas. Serializar asignaciones por usuario y orden estable en copias.
- [x] Tests RED: corrección conserva originales, no autoaprobación de encargado, secuencia efectiva válida y rechazo con motivo. Agregar marcas faltantes requiere excepción administrativa, no una corrección común.
- [x] Implementar solicitudes de edición/anulación de eventos existentes, aprobación transaccional y auditoría. No fabricar pausas, ausencias, salidas o tolerancias de tardanza.
- [x] Implementar configuración administrativa por sucursal (coordenadas, radio, precisión, TTL, activación y participantes), usando revisión para evitar sobreescrituras.
- [x] Ejecutar suites de calendario/correcciones/consultas y permisos de lectura; ledger sin commit.

### Task 5: Pantallas reales y PWA

**Interfaces:** AttendanceSnapshot serializable, AttendanceCommand estricto y cliente HTTP sin caché con requestId estable por intento. Cambiar sucursal resetea datos y borradores ajenos.

- [x] Tests RED de render: navegación por rol, Autocomplete, indicación de requeridos, ausencia de simulaciones y datos privados ajenos, configuración reservada a Administración.
- [x] Implementar páginas y componentes personales/encargado/administrador siguiendo maqueta: turno/estado/acciones, historial, tabla responsive, inspector de excepción y calendario semanal.
- [x] Usar verificación real y ubicación real solo tras acción del usuario. No confundir permiso denegado, fallo/cancelación o respuesta incierta con fichaje guardado. Conservar requestId y consultar/reintentar con idempotencia.
- [x] Implementar configuración/participantes y acciones de código por rol; mostrar vigencia, vencimiento, aprobado/usado/vencido y trazabilidad. Foco automático en código y campos primarios, errores accesibles.
- [x] Añadir manifiesto e iconos desde el logo existente, metadata e instrucciones iOS/Android. No añadir caché offline de información privada ni prometer instalación en la maqueta.
- [x] Verificar navegación, render, teclado y layouts 390/768/1440; usar CUA en una app de prueba descartable. Ledger sin commit.

### Task 6: Confirmación al iniciar producción y cerrar caja

**Interfaces:** consumeConfirmation de Task 2, payload canónico excluye únicamente el identificador de prueba; conserva todos los datos de negocio y requestId.

- [x] Tests RED: prueba requerida al activar la política en sucursal, misma cuenta/sucursal/recurso/contenido, sin duplicación en replay y rechazo de credencial o permiso revocado.
- [x] Integrar confirmación en production-start y cash close existentes, en su transacción; mantener permisos y lógica de stock/caja. No exigir GPS para estas acciones.
- [x] Solicitar confirmación en el último botón; no en cada campo/paso ni en otras acciones. Mantener habilitación explícita por sucursal para no interrumpir cajas sin configurar/credenciales.
- [x] Ejecutar regresiones de caja/producción afectadas y ledger sin commit.

### Task 7: Revisión final y entrega

- [ ] Ejecutar typecheck, lint, suites nuevas y regresiones pertinentes, build de producción con el método compatible de este repositorio.
- [ ] Revisor independiente inspecciona diff completo sin commits, plan/spec y rulings; corregir defectos importantes con RED→GREEN. No incluir archivos del otro chat.
- [ ] Verificar en navegador contra datos descartables: permisos, flujo personal sin biometría simulada en producto, excepciones y configuración. La validación física con iPhone/Android necesita el dispositivo y HTTPS y no se presentará como realizada.
- [ ] Dejar resumen y pasos de activación; solicitar autorización específica de la migración 0030 en Neon solo cuando el código esté listo y revisable. No commit/push.


## Entrega y activación

Implementación terminada y revisada en `codex/staff-attendance`, sin commit ni push. Migración `0030_staff_attendance.sql` aplicada en Neon con autorización explícita del usuario. Historial verificado hasta 0030 (31 migraciones), 13 tablas nuevas vacías y contenido histórico preservado. No se modificó `.env` ni se activaron participantes o ubicación.

Verificación: 132 pruebas enfocadas en 21 suites, comprobación de tipos y lint de los cambios sin errores, compilación de producción satisfactoria. La revisión independiente encontró tres problemas importantes; los tres se reprodujeron con pruebas que fallaban y se corrigieron: inicio desde tareas sin confirmación, reutilización de un intento de fichaje anterior y selección de turnos nocturnos. No dejó observaciones menores. No se declara que la suite legacy completa esté corregida.

La app de prueba con datos ficticios está en http://127.0.0.1:3019/staff/attendance. Se verificaron escritorio (1440), tablet (768) y celular (390), navegación por rol, formulario del dispositivo, aprobación por Administración, código privado al solicitante y registro manual de un solo uso. El icono real de la PWA respondió como PNG de 192 píxeles. No se registró una credencial física desde el navegador de prueba ni se concedió acceso a la ubicación del usuario.

Para habilitar en el proyecto:

1. Completado: el usuario autorizó y se aplicó únicamente 0030 en Neon. Las 13 tablas nuevas quedaron vacías; no se habilitaron personas ni se registraron asistencias.
2. En Configuración de asistencia, Administración ingresa las coordenadas reales del local, radio, precisión y vigencia del código. Los valores iniciales del formulario son editables y no representan una ubicación real.
3. Habilitar las personas que van a fichar. Configurar/asignar horarios desde Personal → Horarios del equipo.
4. Cada persona abre su propia cuenta en el celular por HTTPS y registra su dispositivo desde Asistencia → Mi dispositivo. La contraseña de su cuenta autoriza ese registro inicial. Se usa el método de verificación que ofrezca el dispositivo; Kybo no guarda el rostro, la huella ni el código del teléfono.
5. Probar físicamente entrada, pausa, reanudación y salida con un celular compatible, dentro y fuera de la zona. La verificación por software y las capturas de interfaz no sustituyen esta prueba.
6. Activar la confirmación de inicio de producción y cierre de caja cuando el equipo tenga sus credenciales. Incluye iniciar desde órdenes y desde Operación del día. Estas dos acciones no exigen ubicación.

## Decisiones de ejecución

El registro siguiente conserva todas las decisiones del proceso, junto con su costo si la interpretación no fuera la deseada. La migración real sigue requiriendo aprobación nueva.
- Ruling: User explicitly authorized implementation after the visual design. Proceed inline through all tasks without another approval/method selection round; keep a fresh independent final review. Cost if wrong: execution preference differs, not feature behavior.
- Ruling: Work in the existing user-requested feature branch and checkout. Do not create another worktree or switch away from the approved prototype and unrelated untracked files. No commits/pushes and no real migrations. Cost if wrong: less physical isolation; bounded by scoped edits and status checks.
- Ruling: Existing generic legacy test failures are documented in previous Cash handoff; use meaningful targeted baselines and regressions rather than repairing unrelated fixtures. Cost if wrong: unrelated full-suite failures remain and must be reported.
- Ruling: Dedicated Windows ledger/brief bookkeeping is maintained directly; shell helper scripts require unavailable Git Bash. Preserve ledger while work is uncommitted. Cost if wrong: helper automation absent; test evidence still recorded.
- Ruling: Idempotency hashes exclude verification credentials (proofId and redemption code), but retain the business intent. A successful replay returns the accepted result to its original authorized caller without re-consuming the code. Cost: changing only a credential on a replay does not report a payload conflict; it cannot create another event.
- Ruling: Initial settings are explicit, disabled until saved with coordinates. Administrative opt-in controls the separate production/cash verification requirement; enabling is never inferred from installation of code. Default draft TTL10/radius100/accuracy40 are editable setup defaults, not asserted real business settings. Cost: administrator must complete activation before use.
- Ruling: WebAuthn credential stores its RP ID so localhost/alternate configured development origins cannot select a key for a different RP. Enrollment requires password reauthentication with persistent per-user throttling, rather than a bare existing session. Cost: one-time password prompt when enrolling, not on normal punches.
- Ruling: Punch replay hashes the business action and assignment, excluding refreshed GPS evidence; the WebAuthn proof still binds the complete location payload for a new operation. A lost-response retry with a fresh GPS timestamp can recover the original success. Cost: changed GPS alone does not produce an idempotency conflict on an already accepted action, and cannot create a second mark.
- Task 5 ruling: Period interruption totals sum within each business day; overnight active journal stays tied to its entry business date. Comparing several entries under one assignment uses first entry and final exit, with exact deviations and no invented lateness tolerance. Cost if wrong: policy interpretation is visible and can be revised without changing original marks.
- Task 5 ruling: A declared new entry may remain pending while an older open span is regularized. Only redemption revalidates and records the approved event; normal phone entry remains blocked. Cost if wrong: an approved declaration can expire while waiting and then needs a fresh authorization.
- Final: Ruling: Reviewer set aside legacy /api/production, which records an already completed batch and is restricted to manager/admin. Keep its existing authorization and audit: the approved step-up requirement applies to starting planned production, through both production orders and daily tasks. Cost if wrong: completed-batch registration remains possible for managers without an additional device confirmation; extending the policy to that distinct action remains a business choice.
- Finishing ruling: User already chose keep-as-is without commit/push. Preserve codex/staff-attendance and the ledger instead of presenting an integration menu or deleting uncommitted execution evidence. Scoped test gate is retained because known legacy fixture failures are outside this authorized change. Cost if wrong: no integration performed, and those unrelated legacy failures remain.
