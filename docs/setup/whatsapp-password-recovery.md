# Activar la recuperación de contraseña por WhatsApp

**Postergado por decisión del usuario del 6 de noviembre de 2026.** La recuperación actual usa correo; ver `email-password-recovery.md`. El endpoint público ya no selecciona el adaptador de WhatsApp. Estas instrucciones se conservan únicamente como referencia futura.

## Estado y alcance

Código preparado para WhatsApp Cloud API de Meta. Por defecto está deshabilitado. WhatsApp Business instalado en un celular no suministra por sí solo la API que necesita Kybo. No se creó una app de Meta ni se vinculó/migró el número del negocio, y no se enviaron mensajes reales. Manychat, Instagram y atención de conversaciones quedan para otra etapa.

Las pruebas usan teléfonos ficticios y un proveedor simulado inyectado en el servicio; no existe un modo de proveedor simulado activable en producción.

## 1. Conectar el número desde Meta

El administrador del negocio debe preparar la aplicación y los recursos de WhatsApp Cloud API en Meta, usando su portfolio empresarial y el número del negocio. Revisar la elegibilidad de coexistencia antes de conectar el número que ya funciona en WhatsApp Business. No eliminar la cuenta del celular ni migrar el número para probar esta función. Si el alta no permite conservar el funcionamiento acordado, detener esa parte y resolver el método de conexión antes de continuar.

Obtener en Meta el identificador numérico del teléfono emisor, un token de servidor con acceso de envío a ese recurso y una versión soportada de Graph API. El número comercial escrito con +54 no reemplaza al identificador del recurso. No pegar tokens en el chat ni guardarlos en Git; cargarlos en la configuración privada del entorno correspondiente.

## 2. Preparar una plantilla de autenticación

Crear y aprobar una plantilla de categoría **Authentication**, idioma español configurado explícitamente y botón **copiar código**. Activar la recomendación de seguridad y un vencimiento de cinco minutos. Utilizar el formato de autenticación de Meta, no un mensaje comercial o una plantilla Utility que contenga un código.

El adaptador envía el mismo código en el parámetro de cuerpo y en el primer botón de tipo URL que Meta usa para copiar el OTP. No se requieren paquetes de aplicaciones Android ni la opción de autocompletar de un solo toque.

Comprobar nombre, idioma, estado aprobado y compatibilidad del recurso emisor antes de habilitar la variable de activación. La aceptación por la API no confirma entrega en el celular; esta versión no recibe webhooks de entrega y no ejecuta reintentos automáticos de mensajes.

## 3. Configuración privada

Variables de servidor, todas independientes de Manychat:

| Variable | Contenido |
| --- | --- |
| `KYBO_WHATSAPP_RECOVERY_ENABLED` | `false` hasta completar y verificar los pasos; luego `true` |
| `KYBO_PASSWORD_RECOVERY_SECRET` | Secreto aleatorio propio de al menos 32 caracteres, distinto al de autenticación |
| `KYBO_WHATSAPP_ACCESS_TOKEN` | Token de servidor de Meta con permisos de envío |
| `KYBO_WHATSAPP_PHONE_NUMBER_ID` | Identificador numérico del recurso del teléfono emisor |
| `KYBO_WHATSAPP_API_VERSION` | Versión soportada seleccionada en Meta, con formato `vNN.N` |
| `KYBO_WHATSAPP_AUTH_TEMPLATE` | Nombre exacto de la plantilla de Authentication aprobada |
| `KYBO_WHATSAPP_TEMPLATE_LANGUAGE` | Código exacto del idioma aprobado, por ejemplo `es` o `es_AR` si corresponde |

No usar prefijo `NEXT_PUBLIC_`. Reiniciar/republicar el entorno después de cambiar su configuración, mediante una acción autorizada por el usuario. Esta implementación no cambió el `.env` local ni la configuración de Vercel.

## 4. Tablas y teléfonos

La migración **0036_whatsapp_password_recovery.sql** crea contactos de recuperación, desafíos y contadores. Fue autorizada específicamente y aplicada en Neon el 5 de noviembre de 2026. Las tres tablas quedaron vacías; se verificó que el contenido de las 140 tablas públicas anteriores permaneciera intacto. No se cargaron teléfonos ni se cambiaron contraseñas. El historial se validó contra el SQL de origen, admitiendo únicamente diferencias comprobadas de saltos de línea, sin reescribir registros previos.

Después de la migración, un administrador abre **Configuración → Usuarios → Editar → Recuperación por WhatsApp**. Carga el número con + y código de país, confirma directamente con la persona que le pertenece y que acepta recibir códigos, habilita la opción y pulsa **Guardar contacto de recuperación**. Esa confirmación administrativa no se presenta como una verificación automática de la propiedad del teléfono.

Los datos de contacto se guardan separadamente del perfil y tienen revisión de concurrencia propia. Cada cuenta personal debe tener su propio número; no se habilita la cuenta compartida del local. Los números proporcionados en el chat no se incorporaron al código ni a la base de pruebas. Su carga real se realizará como una acción privada de activación, cuando la migración esté autorizada.

## 5. Verificar antes de activar al equipo

1. Confirmar en el entorno de destino la migración aplicada, la plantilla aprobada y el emisor correctos, sin exponer secretos.
2. Autorizar una prueba real concreta con una cuenta y destinatario controlados; no usar a todo el equipo como destinatarios de pruebas.
3. Solicitar el código, comprobar que llega, validarlo y elegir una contraseña diferente.
4. Verificar que el código/permiso no se reutilizan y que las sesiones anteriores ya no acceden. Las cuentas desactivadas y las invitaciones pendientes siguen bloqueadas.
5. Dejar disponible el restablecimiento administrativo con contraseña temporal si falla el canal o la persona pierde acceso al celular.

La respuesta pública de solicitud es deliberadamente uniforme: no confirma que un usuario exista ni revela teléfono o estado. Si el contacto está habilitado, el envío se intenta después de responder usando `after` de Next. Si el proceso termina antes o el proveedor rechaza el mensaje, la persona deberá pedir otro código después de la espera. No se promete una cola durable ni entrega garantizada.

## Verificación local

Ejecutar exclusivamente con autorización para bases descartables y `KYBO_ALLOW_TEST_MIGRATIONS=disposable-only` las suites `password-recovery-provider`, `password-recovery-http` y `password-recovery.integration`. La integración crea PGlite en memoria; nunca llama `getDb()` ni conecta Neon. En Windows, si el ejecutor aislado pierde sus archivos temporales SSR y produce `ENOENT`, repetir el proceso con los permisos del entorno local; no interpretar ese error como una falla funcional ni modificar credenciales para resolverlo.

## Referencias

- [Plantilla Authentication de copiar código, colección oficial de Meta](https://www.postman.com/meta/whatsapp-business-platform/request/6vkv46u/create-authentication-template-w-otp-copy-code-button).
- [Encabezados de Vercel](https://vercel.com/docs/headers/request-headers): solo en Vercel se usa su IP reenviada para el límite por cliente; en otros entornos se comparte un límite conservador.
- [Next: trabajo después de responder](https://nextjs.org/docs/app/api-reference/functions/after).
- [OWASP: recuperación de contraseñas](https://cheatsheetseries.owasp.org/cheatsheets/Forgot_Password_Cheat_Sheet.html).
