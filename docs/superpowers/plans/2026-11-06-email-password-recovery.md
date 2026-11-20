# Email Password Recovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan inline. La restricción inicial de commit/push fue levantada por el usuario el 10 de noviembre; el envío debe permanecer desactivado.

**Goal:** Cambiar el canal público de recuperación a correo y dejar WhatsApp para después.

**Architecture:** Reutilizar desafíos, límites y canje transaccional de la 0036. El correo registrado en `user.email` y su confirmación administrativa existente (`emailVerified`) definen el destinatario; nunca aceptar un destinatario desde el login. Generalizar el transporte a `recipient`, mantener el adaptador WhatsApp sin activarlo y conectar solo correo desde el route handler público. Sin nueva migración y sin tocar datos reales.

**Tech Stack:** Next/React, Drizzle/PostgreSQL, crypto de Node, Vitest/PGlite en memoria y Nodemailer para SMTP cifrado con Gmail. El usuario confirmó `kybo.arg@gmail.com`; los correos personales se cargarán después desde Usuarios.

**Spec:** Cambio explícitamente pedido por el usuario el 6 de noviembre de 2026. Se conserva el diseño de seguridad de `../specs/2026-11-05-whatsapp-password-recovery-design.md`: códigos 6 dígitos/5 minutos/5 intentos, permisos 256 bits/5 minutos/un uso, mismos límites, no enumeración y revocación de sesiones.

## Constraints and review focus

- No WhatsApp/Meta/Manychat ni notificaciones push para recuperar acceso en esta etapa.
- La app pública solo selecciona el transporte de correo; configuración ausente devuelve indisponibilidad real.
- Excluir correos de marcador `@users.invalid`, no confirmados, cuentas compartidas, deshabilitadas y pendientes de activación.
- Mantener confirmación del correo y versión de acceso en servidor; cambiar o deshabilitar el correo invalida pruebas emitidas.
- No agregar tablas ni cargar direcciones reales; preservar la jornada manual y el trabajo pendiente.
- La activación depende de la contraseña de aplicación de Gmail y las direcciones personales todavía no suministradas. No hace falta un dominio propio.

## Tasks

- [x] RED/GREEN: recuperación con correo confirmado y sin contacto telefónico; destinatarios privados, correos reservados/no confirmados, cambio y revocación de correo, un solo canje y auditoría del canal.
- [x] Generalizar `CodeSender`/configuración del núcleo, enlazar el correo a una revisión derivada y preservar pruebas de WhatsApp como compatibilidad no activada.
- [x] Agregar control de confirmación/recuperación del correo al perfil administrativo existente, con validación y revisión monotónica. Quitar el panel telefónico del formulario actual.
- [x] Implementar y probar Gmail con transporte simulado: TLS, destinatario único, aceptación SMTP, límites de espera y errores sin credenciales/destinatarios/códigos.
- [x] Cambiar textos y route handler público a correo; documentar activación.
- [x] Verificar pruebas afectadas, TypeScript/lint, build aislado y revisión independiente de los cambios de seguridad; revisión visual acotada. Sin Playwright E2E.

## Verificación final (6 de noviembre)

- 77 pruebas en 10 archivos, con PGlite descartable y transporte simulado; todas pasaron. Incluyen revocación por cambios de acceso, correo y confirmación, comprobaciones HTTP y compatibilidad del núcleo de WhatsApp sin activarlo.
- TypeScript de la aplicación y lint del alcance afectado: sin errores.
- Compilación de producción en copia aislada, sin base ni credenciales reales: salida 0.
- Revisión independiente del núcleo, permisos y adaptador Gmail: sin hallazgos pendientes. Se reprodujo con una prueba fallida y corrigió la confirmación implícita de correos al crear una cuenta mediante clientes antiguos: ahora exige confirmación explícita.
- Revisión visual de la pantalla de recuperación en 1440×900 y 390×844. Estado de envío deshabilitado y regreso al ingreso visibles, sin desbordes; código actualizado en el ensayo existente sin reinicializar su base.
- Pendiente de activación: verificación en dos pasos y contraseña de aplicación privada para Gmail, carga posterior de correos personales confirmados y prueba real controlada. No hubo envíos reales, cambios de cuentas ni otra migración. Sin commit ni push.

## Verificación para publicación (10 de noviembre)

- Publicación de login, recuperación por correo y entorno manual autorizada por el usuario; el merge queda a su cargo. No se habilita el envío.
- 83 pruebas enfocadas en 12 archivos aprobadas, además de las comprobaciones PowerShell con procesos simulados. TypeScript, lint del alcance y compilación de producción aislada aprobados.
- La suite general detectó problemas anteriores al cambio. Se reprodujeron en una instantánea intacta de `main` (`c7551a8`): ocho suites antiguas bloqueadas por la transición explícita de inventario, el límite de consultas del checkout (52 frente a 50), una expectativa de validación que omite `stockTracked` y una suite que requiere una base PostgreSQL de pruebas no configurada. No se modifican esas pruebas ni se conecta una base remota para publicarlo.
- El índice de Git se revisó para excluir `.tmp`, `.local`, datos de ensayo, credenciales y la modificación local autogenerada de `next-env.d.ts`. El correo permanece deshabilitado por defecto y en `.env.example`; no se modifica `.env` ni la configuración de Vercel.
