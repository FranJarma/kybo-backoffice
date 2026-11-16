# Login y WhatsApp de Kybo

## Estado

- Actualización del 6 de noviembre: el usuario eligió recuperación por correo desde Gmail. WhatsApp queda postergado. La configuración y el circuito actuales están en `../../setup/email-password-recovery.md`.
- Login: refinamiento visual y control de mostrar contraseña implementados localmente.
- Recuperación automática: implementación autorizada posteriormente con WhatsApp Cloud API; ver `2026-11-05-whatsapp-password-recovery-design.md`. La 0036 fue autorizada y aplicada en Neon con sus tres tablas vacías. Falta conectar el proveedor y configurar los contactos. No hay envíos reales habilitados.
- Atención de mensajes y Manychat: quedan para una etapa posterior.
- Commit y push autorizados el 10 de noviembre, con el envío desactivado. La única modificación autorizada en Neon fue la 0036, con tablas vacías; no se cambiaron cuentas, contraseñas, contactos ni variables de entorno.

## Login

Conservar Manrope y los componentes, colores, foco y estados del sistema existente. En escritorio, separar la ilustración aportada por el usuario y un formulario de ancho limitado. En celular, ocultar la imagen y presentar el formulario debajo del logo, con desplazamiento natural cuando aparezca el teclado.

El botón del ojo permite mostrar y ocultar la contraseña, tiene nombre accesible y área táctil de 44 px. No envía el formulario. El acceso conserva los estados Verificando acceso y Abriendo Kybo, los destinos seguros, las invitaciones y la política de contraseñas temporales.

### Verificación realizada

- Vistas de 1440 × 900 y 390 × 844 en la copia aislada de pruebas; corrección de espacio superior en celular y una confirmación visual.
- Control del ojo con un texto ficticio, sin enviar el formulario. Comprobados el cambio de estado accesible y el retorno al estado oculto al recargar.
- TypeScript para el código de la aplicación, ESLint sobre los dos archivos modificados y detector de layout de Impeccable sin errores.
- No se ejecutaron pruebas E2E con Playwright ni se certificó un nuevo circuito de autenticación.

La copia de la jornada manual conserva sus datos. Solo recibió las dos vistas de login modificadas y el nuevo recurso visual como cambios locales sobre su revisión base.

## Propuesta de integración

El negocio ya usa WhatsApp Business y todavía no tiene cuenta de Manychat.

### Atención de clientes

Recomendación: Manychat para automatizaciones de WhatsApp e Instagram, respuestas manuales y derivación a una persona. Empezar con consultas sobre horarios, dirección y carta, usando información aprobada del negocio. No convertir automáticamente una conversación en una venta o movimiento de inventario.

La primera etapa usaría la bandeja de Manychat. Un enlace desde Kybo requerirá la URL de la cuenta configurada. No se incluye todavía una bandeja de conversaciones nativa en Kybo: necesitaría validar las API de sincronización, envío, permisos y webhooks, además de un diseño independiente.

Evaluar coexistencia para mantener la aplicación WhatsApp Business. Su disponibilidad depende de los requisitos de la cuenta; no migrar ni desconectar el número durante esta evaluación. Requiere una suscripción compatible y costos de mensajes según el proveedor. No se contrató ningún servicio.

### Recuperación automática de contraseñas

El usuario eligió un código enviado automáticamente al WhatsApp personal asociado a su cuenta. Kybo debe generar y validar el código; la automatización de atención no puede decidir cambios de contraseña.

Circuito propuesto:

1. Ingresar usuario o correo desde Recuperar contraseña.
2. Responder de manera uniforme, sin confirmar si existe la cuenta ni mostrar un directorio de teléfonos.
3. Enviar el código exclusivamente al teléfono registrado y verificado de una cuenta habilitada, mediante un transporte que admita autenticación.
4. Validar un código aleatorio de un solo uso, con vencimiento, límites de intentos y de reenvíos; guardar un resumen protegido, sin registrar el código en logs.
5. Permitir elegir y confirmar una contraseña nueva con la política existente; invalidar los códigos y sesiones anteriores y volver al ingreso normal.

No se deben pedir números arbitrarios para elegir el destino desde el login. Los contactos del personal no se incorporan al código, fixtures ni base de pruebas. Su carga y verificación se resolverán como configuración privada, después de definir el transporte. La cuenta compartida del local requiere un tratamiento administrativo separado.

### Decisión posterior sobre el transporte

La documentación pública revisada de Manychat ofrece creación de plantillas Marketing y Utility y no confirma creación/envío de plantillas de Authentication. Por eso **no se considera validado Manychat como proveedor de códigos**. No usar una plantilla comercial para simular recuperación de acceso.

El usuario eligió implementar la recuperación sin depender de Manychat. Se preparó un adaptador para WhatsApp Cloud API de Meta con plantilla de Authentication de copiar código. Falta conectar el recurso del número del negocio y verificar la compatibilidad con coexistencia antes de activarlo. No prometer que el mismo número podrá conectarse a dos proveedores simultáneamente sin comprobarlo.

Faltan la cuenta/configuración del proveedor, acceso administrativo a Meta y aprobación de la plantilla de autenticación que corresponda. Las credenciales deben cargarse por un canal privado, no en el chat ni en el repositorio. Cualquier migración futura de este circuito en Neon requiere autorización específica. El desarrollo y pruebas deben usar destinatarios ficticios y un transporte simulado hasta autorizar una prueba de envío concreta.

## Fuentes revisadas

- [Manychat Inbox](https://help.manychat.com/en/articles/17742012-manychat-inbox): bandeja para los canales conectados.
- [Conexión de un número existente](https://help.manychat.com/en/articles/17742095-how-to-transfer-your-own-whatsapp-number-to-manychat): coexistencia y requisitos de conexión.
- [Plantillas de Manychat](https://help.manychat.com/en/articles/17742149-how-to-use-whatsapp-messages-templates-in-manychat): categorías documentadas y suscripción requerida.
- [External request](https://help.manychat.com/en/articles/17742126-dev-tools-external-request): integración HTTP disponible en determinados planes; no demuestra por sí sola soporte de OTP salientes.
- [OWASP Forgot Password](https://cheatsheetseries.owasp.org/cheatsheets/Forgot_Password_Cheat_Sheet.html): respuestas uniformes, códigos de un solo uso, vencimiento y límites de solicitudes.

## Recurso visual

`public/assets/login-kybo-artwork.webp`: ilustración aportada por el usuario el 5 de noviembre de 2026. Sustituye la imagen preliminar generada. Se convirtió a WebP manteniendo las dimensiones, la composición y el perfil de color sRGB. No se usaron las imágenes de `.tmp`.
