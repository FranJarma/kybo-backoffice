# WhatsApp Password Recovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Recuperar una contraseña desde el login con código por WhatsApp y contactos administrados privadamente.

**Architecture:** Servicio transaccional con contactos, desafíos y límites persistentes; adaptador Meta inyectable y envío desacoplado de la respuesta usando Next `after`. Formularios públicos sin teléfono ni datos de la cuenta; control del contacto en Usuarios.

**Tech Stack:** Next 16.3.6, React, Drizzle/PostgreSQL, Zod, crypto de Node, Vitest/PGlite descartable.

**Spec:** `docs/superpowers/specs/2026-11-05-whatsapp-password-recovery-design.md`.

## Global Constraints

- Sin commit ni push, sin modificaciones de Neon, contactos reales o `.env`.
- Código 6 dígitos / 5 minutos / 5 intentos; permiso 256 bits / 5 minutos / un uso.
- Espera de reenvío 60 segundos; 3 emisiones/cuenta/15 minutos; 5 solicitudes/identificador/15 minutos; 10 solicitudes y 30 acciones/cliente/15 minutos; 100 solicitudes globales/minuto.
- Excluir cuentas compartidas, deshabilitadas y pendientes de activación; resolver contraseñas temporales vencidas.
- No Playwright E2E en esta etapa. Reutilizar componentes y comportamiento de login existentes.

## Review Focus

- Fallos del proveedor y cierre del proceso tras responder: no habilitar códigos sin aceptación del proveedor ni prometer entrega.
- Modificación del contacto, contraseña, acceso o invitación entre solicitud y canje: denegar permisos viejos.
- Intentos inválidos y carreras: persistir contadores aunque la operación falle y permitir un solo canje.
- Varias representaciones del mismo usuario: límite adicional por cuenta y respuestas públicas uniformes.
- Entorno sin migración/proveedor: login operativo, recuperación con explicación honesta, sin escrituras reales.

### Task 1: Contactos y contrato de envío

**Files:** crear `src/db/password-recovery-schema.ts`, `drizzle/0036_whatsapp_password_recovery.sql`, `src/modules/password-recovery/{validation,crypto,provider,contacts}.ts`, pruebas `tests/password-recovery-provider.test.ts` y `tests/password-recovery.integration.test.ts`; extender exportaciones y journal.

**Interfaces:** `RecoveryConfig`, `CodeSender.sendCode({phone,code})`; `getRecoveryContact(db,actor,userId)` y `saveRecoveryContact(db,actor,userId,input)` devuelven `{ready,phone,enabled,confirmed,version}`. Contactos con versión UUID y confirmación administrativa.

- [x] Escribir pruebas de normalización, rechazo de configuración parcial, solicitud de plantilla Authentication, ausencia de redirecciones y errores saneados; acceso administrativo, confirmación, duplicados y revisión de contacto.
- [x] Ejecutar y observar fallos por implementación faltante.
- [x] Implementar migración manual equivalente a los esquemas, crypto, configuración, proveedor y contacto transaccional.
- [x] Verificar pruebas con secretos y teléfonos ficticios, sin red real.

### Task 2: Recuperación transaccional y HTTP

**Files:** crear `src/modules/password-recovery/{service,http}.ts`, `src/app/api/account/recovery/route.ts`, `src/app/api/settings/users/[id]/recovery/route.ts`; pruebas `tests/password-recovery-http.test.ts` y ampliación de integración.

**Interfaces:** `createRecoveryService(db,config,sender,now)` produce `request(identifier,clientKey) -> {challengeId,expiresIn,retryAfter,message,deliver}`, `verify(challengeId,code,clientKey) -> {token,expiresIn}`, `reset(challengeId,token,newPassword,clientKey) -> void`. `handleRecoveryRequest` recibe un planificador inyectado; el route handler usa `after`.

- [x] Escribir y ejecutar pruebas rojas para éxito, respuestas uniformes, límites/reenvío, expiración exacta, cinco fallos persistidos, códigos de otro desafío, ausencia de envío, errores del proveedor, doble canje, secreto nuevo, acceso/contacto/contraseña modificados, cuenta compartida y activación pendiente.
- [x] Implementar límites atómicos, bloqueos de sujeto, desafío y permisos, cambio de contraseña, revocaciones y auditoría.
- [x] Implementar HTTP con mismo origen, tamaño acotado, cabeceras privadas y disponibilidad veraz; probar que nunca salen códigos, teléfonos ni tokens de proveedor en respuestas/errores.
- [x] Verificar las suites de política de contraseñas y usuarios relacionadas, documentando límites de PGlite respecto a concurrencia PostgreSQL.

### Task 3: Formularios y preparación para activar

**Files:** crear `src/app/recover-password/page.tsx`, `src/components/password-recovery-form.tsx`, `src/components/users/recovery-contact.tsx`, `docs/setup/whatsapp-password-recovery.md`; modificar `src/components/login-form.tsx`, `src/components/users/manager.tsx`, `.env.example`.

- [x] Añadir recuperación en línea en una página propia, estados de solicitud/código/contraseña/completado, contador de reenvío, ojos accesibles, errores y vuelta al login con retorno interno seguro.
- [x] Añadir control de contacto separado de guardar perfil, con confirmación administrativa y estado no configurado.
- [x] Documentar configuración privada de Meta, plantilla, migración pendiente y comprobación antes de enviar. No guardar números reales ni credenciales.
- [x] TypeScript, lint focalizado, inspección PC/celular en entorno aislado sin operaciones reales; revisión independiente final y corrección de hallazgos.

No se incluyen pasos de commit porque el usuario lo prohibió explícitamente. La autorización de implementar el circuito permite ejecutar este plan en la misma sesión y el worktree ya aislado; no se crea otra rama ni se descartan cambios existentes.

## Verification ledger

- Final recovery suites: 43 passed (25 integration, 10 provider, 8 HTTP). Related focused regression: 70 passed before the extra global-window case, 71 distinct cases verified in total.
- Application TypeScript and scoped ESLint: exit 0; no remaining lint warnings.
- Isolated production build: exit 0, database/provider credentials removed. Existing account-password prerender logged missing-database configuration twice and was emitted as dynamic; all pages generated.
- CUA: public link, unconfigured state and responsive views checked; no Playwright E2E or real message test.
- Independent review: three Important findings fixed and confirmed; no remaining Critical/Important findings in the bounded review.
- Migration 0036 was subsequently authorized and applied in Neon; its three tables are empty and the 140 previous public tables retained identical content fingerprints. Real contacts, WhatsApp Cloud API activation and a controlled delivery test remain pending. No commit/push.
