# Recuperación de acceso por correo

Canal actual elegido por el usuario el 6 de noviembre de 2026. WhatsApp, Manychat y notificaciones push quedan para después. El route público selecciona exclusivamente correo y no usa WhatsApp como alternativa, aunque queden variables antiguas configuradas.

## Qué está preparado

- Usuario/correo → código de seis dígitos → contraseña nueva y confirmación → ingreso normal.
- Mismos desafíos y contadores de la 0036 ya aplicada. Sin otra migración ni cambios en registros reales.
- Código y permiso de restablecimiento con vencimiento, uso único, límites de intentos/reenvíos y revocación de sesiones al cambiar contraseña.
- Solo correo personal registrado y confirmado en Usuarios. Se excluyen `@users.invalid`, cuentas desactivadas/compartidas e invitaciones pendientes. Ni teléfono ni dirección de destino se solicitan o revelan desde el login.
- Cambiar o deshabilitar el correo invalida las pruebas emitidas. El código no se incluye en el asunto del correo ni en logs.

## Correos del equipo

En **Configuración → Usuarios → Editar**, Administración completa el correo personal y marca que confirmó que pertenece a esa persona. Esta es una confirmación administrativa, no una certificación de verificación automática del buzón. Se guarda con el perfil; no hay otro formulario de contacto telefónico en el flujo actual.

Cambiar el correo desmarca la confirmación en la interfaz. Solicitudes antiguas que no incluyen el nuevo campo no confirman automáticamente un correo nuevo; al editar otra información sin cambiar el correo conservan la confirmación previa. Crear una cuenta desde ese circuito sin confirmación explícita deja la recuperación por correo deshabilitada. Ingresar con usuario sigue funcionando aunque todavía no se haya cargado un correo.

No se recibieron todavía las direcciones personales del equipo ni se cargaron direcciones en Neon.

## Emisor de correo

El usuario confirmó `kybo.arg@gmail.com` como emisor. Se preparó el envío con Gmail por SMTP cifrado, mediante Nodemailer. No hace falta un dominio propio para este circuito. La cuenta debe tener verificación en dos pasos y una contraseña de aplicación creada para Kybo; nunca se usa la contraseña normal de Google. No se modificó la cuenta de Google ni se abrió una conexión real de envío.

Variables privadas de servidor:

| Variable | Valor |
| --- | --- |
| `KYBO_EMAIL_RECOVERY_ENABLED` | `false` hasta completar la configuración y prueba controlada; luego `true` |
| `KYBO_GMAIL_USER` | Correo emisor de Gmail confirmado por el negocio |
| `KYBO_GMAIL_APP_PASSWORD` | Contraseña de aplicación de 16 caracteres, creada en la cuenta de Google; los espacios de presentación se eliminan |
| `KYBO_PASSWORD_RECOVERY_SECRET` | Secreto aleatorio de al menos 32 caracteres, distinto de `BETTER_AUTH_SECRET` |

Nunca usar `NEXT_PUBLIC_` ni pegar claves en el chat/repositorio. No se modificó `.env` ni Vercel. Todas las pruebas utilizaron un transporte simulado, direcciones ficticias y PGlite en memoria. El servidor SMTP está fijado en `smtp.gmail.com:465`, con TLS y validación del certificado; no se aceptan hosts desde el navegador y se deshabilitan los logs de SMTP.

El proveedor debe aceptar el mensaje para habilitar el código. La aceptación no garantiza entrega en la bandeja de entrada; el formulario ofrece reenvío y el restablecimiento administrativo sigue disponible. Se conserva el despacho posterior a la respuesta de Next: no se promete una cola durable ni reintentos automáticos.

## Activación pendiente

1. Ingresar a la cuenta Google de Kybo y habilitar verificación en dos pasos, si todavía falta.
2. Crear una contraseña de aplicación para Kybo Operations y cargarla directamente en las variables privadas del entorno autorizado. La opción puede no estar disponible según las políticas de seguridad de Google; no desactivar la verificación en dos pasos para resolverlo. Si se cambia la contraseña normal de Google, se revocan las contraseñas de aplicación y debe generarse otra.
3. Cargar y confirmar los correos reales desde Usuarios mediante una acción autorizada.
4. Autorizar y ejecutar una prueba real con un destinatario controlado; comprobar spam, vencimiento, reutilización y revocación de sesiones.
5. El usuario autorizó publicar el código el 10 de noviembre, manteniendo el envío desactivado. Configurar y probar el emisor es un paso posterior; este cambio no activa Gmail ni registra direcciones reales.

## Fuentes

- [Google: contraseñas de aplicaciones](https://support.google.com/mail/answer/185833?hl=es).
- [Nodemailer: SMTP y TLS](https://nodemailer.com/smtp).
- [Push API](https://developer.mozilla.org/en-US/docs/Web/API/Push_API): las notificaciones requieren permisos/suscripción del navegador y no reemplazan este canal independiente para recuperar acceso.
