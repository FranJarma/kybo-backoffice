# Cambio de puerto local y consulta de costos — 19/10/2026

El comando de desarrollo pasó a usar 8080, mientras que la configuración canónica conserva http://localhost:3000. La validación compartida rechazaba las solicitudes de la pantalla nueva con 403 antes de consultar los costos; el catálogo mostraba «No disponible».

## Corrección

En desarrollo, si la URL canónica es de loopback (localhost, 127.0.0.1 o ::1), la lista compartida por autenticación y operaciones incorpora su mismo protocolo y host con el puerto efectivo del servidor. Next publica ese puerto en PORT, incluyendo los cambios por CLI. Se valida que sea un puerto numérico válido.

No se infieren direcciones desde cabeceras de la solicitud ni se incorporan otros hosts/protocolos. Producción y URLs canónicas remotas conservan exclusivamente sus orígenes configurados. No se modifican .env, el puerto elegido en package.json ni el resto del trabajo local.

## Evidencia

- Antes de la corrección, la regresión reproduce el mismo error 403 al solicitar costos desde localhost:8080. Tres casos de puerto local fallaban; los demás casos de rechazo eran correctos.
- Después de la corrección, pasan 36 pruebas en 6 archivos: orígenes locales, autenticación/lista compartida, rechazo de puertos ajenos, hosts similares, protocolos distintos, ausencia de Origin y validaciones HTTP operativas.
- La comprobación de navegador usa una base temporal y un origen canónico en 3000 con servidor real en 3017. Verifica ingreso, registro de producto, costo estimado del catálogo, Costeo y rechazo de un origen externo. Flujo correcto: 1/1. Resultado en .local/touch-pos/origin-port-browser.log.
- Tipos, lint, formato y git diff --check correctos, sin errores. Sin cambios en la base de desarrollo ni commits/push.
