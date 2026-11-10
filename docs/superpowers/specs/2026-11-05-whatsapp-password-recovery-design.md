# Recuperación de contraseña por WhatsApp

> Actualización del 6 de noviembre: el usuario sustituyó el canal público por correo desde Gmail. Este documento conserva el diseño histórico de seguridad y la autorización de la 0036, ya aplicada. La guía vigente es `../../setup/email-password-recovery.md`; WhatsApp queda postergado y no se activa como alternativa.

Autorizado por el usuario el 5 de noviembre de 2026: implementar recuperación automática; conversaciones y Manychat quedan fuera. Sin commit ni push. No aplicar migraciones a Neon ni guardar los teléfonos reales todavía.

## Circuito

Login ofrece «Olvidé mi contraseña». La persona ingresa usuario o correo, recibe un código de seis dígitos, lo valida y elige/confirma una nueva contraseña. El regreso al login conserva un destino interno seguro. El teléfono nunca se escribe ni se descubre desde el formulario público.

Administración configura el teléfono de recuperación desde Usuarios, confirma su pertenencia y puede deshabilitarlo. La cuenta compartida del local queda excluida. Cuentas desactivadas o pendientes de activación no recuperan acceso por este circuito. Las contraseñas temporales vencidas sí pueden recuperarse y quedan resueltas al elegir una nueva contraseña.

## Seguridad y concurrencia

- Código aleatorio de seis dígitos, 5 minutos, máximo 5 intentos. Se conserva únicamente un HMAC ligado al desafío.
- Validarlo genera un permiso aleatorio de 256 bits, por 5 minutos y de un solo uso. No se guarda en URLs, almacenamiento persistente ni logs.
- Reenvío después de 60 segundos; máximo 3 emisiones por cuenta cada 15 minutos. Una nueva emisión invalida códigos y permisos anteriores.
- Límite público por cliente: 10 solicitudes y 30 verificaciones/restablecimientos cada 15 minutos. Identificador: 5 solicitudes cada 15 minutos. Límite global de 100 solicitudes/minuto. Contadores atómicos compartidos en la base.
- Respuesta pública uniforme para usuarios desconocidos, sin contacto, deshabilitados y limitados por cuenta. No devolver teléfono, nombre ni estado de la cuenta.
- Envío mediante `after` de Next: la respuesta no espera al proveedor ni revela por su demora la existencia de una cuenta. No es una cola durable y no promete entrega; si el envío falla, el desafío se invalida y la persona puede reenviar tras la espera. Nunca registrar códigos o respuestas crudas del proveedor.
- Desafíos ligados a la revisión del contacto y a las credenciales/acceso del usuario. Cambiarlos invalida permisos emitidos. Escrituras bajo bloqueos y verificación del estado actual.
- Al restablecer: contraseña distinta de la actual, política de longitud existente, invalidación de todas las sesiones, códigos e invitaciones previas y auditoría sin secretos ni teléfonos completos. No iniciar sesión automáticamente.
- Solo Administración administra contactos; comprobación en servidor y revisión optimista del contacto. Consentimiento/pertenencia confirmados por Administración, no una afirmación de verificación automática del número.
- Origen exacto, JSON y tamaño limitado para solicitudes; respuestas privadas sin caché.

## Proveedor y activación

Adaptador HTTP para WhatsApp Cloud API de Meta, con plantilla de Authentication de copiar código aprobada, token de servidor, identificador del número y versión de API configurables. No depende de Manychat ni instala un SDK. Secretos de servidor, con un secreto independiente para HMAC de recuperación. Endpoint fijo de Meta, tiempo máximo y redirecciones deshabilitadas. Aceptar un mensaje por la API no certifica su entrega.

El número comercial no basta para activar envíos: faltan configuración de Cloud API, credenciales, permisos y plantilla. No desconectar WhatsApp Business ni migrar el número durante el desarrollo. Si no hay configuración o tablas, mostrar indisponibilidad real y remitir a Administración; nunca simular un envío exitoso en la aplicación.

Pruebas exclusivamente con base descartable en memoria y proveedor inyectado ficticio. Preparar la 0036; aplicarla en Neon requiere una autorización específica posterior. No enviar mensajes a los números del equipo durante estas pruebas. No tocar los datos de la jornada manual en 3100; incorporar allí únicamente vistas y código de presentación para revisar el estado no configurado.

## Actualización de activación

Después de completar la implementación y verificaciones, el usuario autorizó expresamente aplicar solo la 0036 en Neon. Se aplicó y se confirmó el historial en una lectura posterior: contactos, desafíos y contadores con cero filas. La comparación transaccional de las 140 tablas públicas previas confirmó que no cambiaron sus datos. No se cargaron teléfonos, no se modificaron contraseñas, no se configuró el proveedor y no se enviaron mensajes. Se mantiene la prohibición de commit/push.
