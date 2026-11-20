# Alternativas de despliegue para Kybo

Fecha: 2026-11-19. Etapa posterior al trabajo activo de rendimiento. Alcance: análisis de alternativas de alojamiento, preparación de contenedores y requisitos de operación; no se desplegó ni migró una base. Las mejoras de velocidad y su validación están en [speed-improvements.md](speed-improvements.md). Diagnóstico general: `production-readiness-audit.md`.

## Orden de trabajo

Primero validar las mejoras de aplicación de `speed-improvements.md` sobre la arquitectura actual. Después comparar alternativas con la misma release, dataset y carga desde Salta. La decisión de hosting no es un requisito para implementar las optimizaciones de consultas y POS.

Los archivos de contenedores ya preparados son un laboratorio revisable. Su existencia no significa que se haya elegido Dokploy para producción ni que una imagen haya sido construida o probada en Linux.

## Recomendación

Dockerizar Next.js es razonable: permite ejecutar la misma imagen en un contenedor administrado o en Dokploy y conservar una ruta de salida de Vercel. Docker por sí solo no demuestra una mejora de latencia.

Para una sucursal y un equipo pequeño, probaría primero **Next.js en un contenedor cercano a Neon, conservando la base administrada**, frente a Vercel + Neon con las mejoras de consultas. La base vinculada durante la auditoría estaba en São Paulo; esto debe comprobarse de nuevo antes de elegir la ubicación de la aplicación. Dokploy no determina una región: depende del servidor contratado. Las mediciones desde la conexión real de Salta deciden la elección.

PostgreSQL dentro de Docker en Dokploy también es viable, pero requiere asumir parches del sistema y de PostgreSQL, capacidad, almacenamiento, seguridad, backups y recuperación. Una aplicación y una base en el mismo VPS comparten la falla del servidor o de su disco. Reiniciar contenedores no aporta redundancia. No aconsejo migrar la base solamente por una expectativa de velocidad aún sin medir.

| Alternativa | Qué permite evaluar | Responsabilidad y condición para elegirla |
| --- | --- | --- |
| Vercel + Neon con las consultas optimizadas | Mantener operación conocida; medir solicitudes frías y calientes y distancia app/base | Verificar región efectiva, plan, timeouts, backups, alertas y restauración. Comparar contra una línea base equivalente. |
| Next.js Docker en Dokploy + Neon | Proceso activo y control del despliegue; cambiar una variable de infraestructura por vez | Mantener servidor/proxy y asegurar TLS a Neon. Un VPS sigue siendo un punto único de falla de la aplicación. Elegir si mejora la experiencia medida o simplifica costos/operación. |
| Next.js + PostgreSQL Docker en el mismo servidor | Eliminar el tramo de red externo entre app y base | Operar también PostgreSQL; verificar restauración fuera del host y aceptar el tiempo de recuperación. Puede tener menor latencia entre app/base, pero no hay benchmark que pruebe que la experiencia completa sea mejor. |
| Aplicación redundante + PostgreSQL administrado con failover | Continuidad durante la falla de una instancia | Aumenta costo y operación; justificar por el tiempo de caída aceptable, incidentes o nuevas sucursales. Un backup no reemplaza failover. |

No hay un presupuesto del proveedor ni benchmarks comparables para el servidor candidato; no se estiman ahorros o tiempos de respuesta. Comparar costo completo: VPS, disco y expansión, backups externos, red, almacenamiento Blob, logs/alertas, dominio y horas de mantenimiento. Evitar que builds compitan con PostgreSQL durante el horario del local; preferir construir en CI y promover una imagen inmutable.

## Archivos preparados

- `Dockerfile`: Node 24 Debian slim; pnpm 10.33.2 y lockfile congelado; build separado del runtime; servidor standalone con usuario `node`, puerto 3000 y assets copiados. No ejecuta migraciones ni recibe credenciales de aplicación durante la build.
- `next.config.ts`: `KYBO_STANDALONE=1` activa standalone solamente para esa build. La build normal conserva el comportamiento de Vercel.
- `.dockerignore`: excluye secretos, bases locales, dependencias de Windows, Git, pruebas y temporales. El Dockerfile además copia explícitamente fuentes y configuración necesarias.
- `compose.lab.yaml`: laboratorio aislado; PostgreSQL 18, volumen nombrado, red de base interna, sin publicar 5432, aplicación publicada únicamente en `127.0.0.1:3000`, rotación limitada de stdout/stderr. No configura HA, backups, TLS ni alertas.
- `docker.env.example`: variables exclusivas del laboratorio. `docker.env.local` está ignorado por Git y por el contexto Docker. La composición no toma `DATABASE_URL` ni secretos de autenticación del `.env` existente.

La imagen usa tags de major para mantenimiento inicial; antes de promover a producción, registrar y fijar digest probado de Node/PostgreSQL y del artefacto de Kybo. Actualizar minor/parches con pruebas. No cambiar de major de PostgreSQL reemplazando solamente el tag de un volumen existente.

## Laboratorio local

Requiere Docker con motor Linux en ejecución y red para descargar imágenes/dependencias. No conectar la base del laboratorio a producción.

```powershell
Copy-Item docker.env.example docker.env.local
# Editar docker.env.local: dos secretos distintos generados aleatoriamente.
# Para la contraseña de PostgreSQL usar hexadecimal (seguro dentro de la URL).
docker compose --env-file docker.env.local -f compose.lab.yaml config --quiet
docker compose --env-file docker.env.local -f compose.lab.yaml build app
docker compose --env-file docker.env.local -f compose.lab.yaml up -d postgres
```

El usuario `kybo_lab` es el propietario inicial del laboratorio, no el rol limitado recomendado para la aplicación en producción. Cambiar la variable de contraseña no modifica un rol ya creado en el volumen.

**Una base vacía no permite operar esta versión.** `src/db/client.ts` comprueba `data_model_state.status = 'ready'` y `scripts/migrate.ts` deshabilita intencionalmente la migración genérica. Antes de arrancar la app, restaurar una fixture sanitizada, revisada y compatible con esta release, o utilizar el procedimiento explícito de transición. No agregar una migración automática al `CMD` de Docker. La auditoría identificó además diferencias entre el historial de migraciones de este checkout y otra release; reconciliar código/esquema antes de cualquier cambio de alojamiento.

Tras restaurar y verificar la fixture por un procedimiento independiente:

```powershell
docker compose --env-file docker.env.local -f compose.lab.yaml up -d app
docker compose --env-file docker.env.local -f compose.lab.yaml logs --tail 100 app
docker compose --env-file docker.env.local -f compose.lab.yaml stop
```

`pg_isready` sólo verifica que PostgreSQL acepte conexiones; no valida el esquema, credenciales de aplicación ni que una venta pueda confirmarse. Una respuesta de `/login` tampoco demuestra disponibilidad de la base. No hay un endpoint nuevo de readiness en esta entrega.

En producción Better Auth usa cookies seguras. Usar HTTPS en staging/Dokploy y probar ingreso y permanencia de sesión; el HTTP de localhost es sólo para diagnóstico local. No publicar este Compose como plantilla final de producción. Detenerlo conserva el volumen; cualquier borrado del volumen elimina sus datos y debe ser explícito.

## Despliegue propuesto en Dokploy

1. Crear un entorno de staging separado. Elegir servidor/región con una prueba desde Salta; una ubicación cercana a la base es candidata, no garantía de mejor latencia al usuario.
2. Crear una aplicación con build type **Dockerfile**, archivo `Dockerfile`, contexto `.`, stage `runner`, puerto interno 3000. Preferir imagen construida en CI si el host comparte recursos con una base. Registrar digest/release para rollback.
3. Configurar dominio HTTPS mediante el proxy de Dokploy; comprobar forwarding de host/protocolo, cookies, límites de carga, streaming y tiempos de espera. No exponer el puerto interno públicamente ni cachear APIs privadas o respuestas por usuario/sucursal en el proxy.
4. Configurar en runtime `DATABASE_URL`, `BETTER_AUTH_SECRET` (aleatorio, al menos 32 caracteres) y `BETTER_AUTH_URL` (origen canónico HTTPS). Agregar `BETTER_AUTH_TRUSTED_ORIGINS` solamente para orígenes exactos necesarios. No usar `NEXT_PUBLIC_` ni argumentos de build para estos secretos. Mantener el mismo secreto entre réplicas y despliegues del mismo ambiente.
5. Para el experimento inicial conservar Neon con su TLS y una URL de staging. Para PostgreSQL de Dokploy, usar su dirección interna y un rol de aplicación limitado, distinto del propietario/migrador, credenciales propias por entorno y sin publicar 5432. No desactivar TLS de una conexión externa para resolver errores.
6. Las fotos siguen usando Vercel Blob. Fuera de Vercel configurar un `BLOB_READ_WRITE_TOKEN` del store privado apropiado; no asumir que `BLOB_STORE_ID` por sí solo provea identidad OIDC en un VPS. Probar upload, lectura privada, miniaturas y borrado con datos de staging. Copiar la base no copia los objetos.
7. Verificar reinicio, sesión, páginas y assets, venta/cobro/comanda/caja, desconexiones y reintentos idempotentes en staging. Comprobar qué ocurre al retirar la base temporalmente. Registrar CPU, memoria, pool y conexiones; dimensionar con tráfico representativo, no con el tamaño actual de la base solamente.
8. Enviar logs fuera del host, alertas de error/latencia/recursos y comprobación externa de disponibilidad. La rotación local del laboratorio limita disco; no implementa logs estructurados, trazas ni retención externa. Estas tareas operativas de la auditoría siguen pendientes.

Para una instancia no se incorpora Redis ni otro backend de caché. Si más adelante se habilitan cachés de servidor o varias réplicas, revisar su invalidación/coordinación y promover exactamente el mismo artefacto a las réplicas. No cachear confirmaciones de ventas, permisos, stock o caja para evitar validaciones en servidor.

## PostgreSQL y recuperación

El volumen de la imagen oficial PostgreSQL 18 se monta en `/var/lib/postgresql`; su `PGDATA` por defecto es `/var/lib/postgresql/18/docker`. No aplicar automáticamente la ruta usada por imágenes 17 o anteriores. Dejar `fsync`, `full_page_writes` y confirmación durable habilitados; reducir garantías de escritura no es una optimización aceptable para ventas/caja.

Dokploy permite programar backups de bases y de servicios Compose hacia un destino S3. Configurar credenciales restringidas, cifrado, retención fuera del servidor y alertas por ausencia/error. Documentar formato y procedimiento exacto: la restauración de Dokploy está orientada a sus propios backups; un dump externo debe ensayarse con el cliente/formato correspondiente.

Un `pg_dump` periódico no proporciona recuperación a un punto arbitrario. Para un **RPO propuesto de 5 minutos o menos** ante pérdida del servidor hace falta una solución comprobada de backup base + archivado continuo de WAL (o base administrada con esa capacidad). Un dump diario sólo limita la pérdida al intervalo entre dumps exitosos. **RTO propuesto de 30 minutos**: aceptarlo únicamente tras restaurar en un host/base nuevos y medir el tiempo completo, incluidos aplicación, secretos, DNS y conciliación operativa. Son objetivos por confirmar con el negocio, no resultados alcanzados.

No promover una base autoalojada hasta haber ensayado: restauración desde almacenamiento externo sin depender del host perdido, coherencia de saldos/cobros/stock y sucursales, procedimiento ante disco lleno, prueba de reinicio y alertas. Mantener una base administrada es preferible si el equipo no puede sostener esas responsabilidades.

## Comparación y migración, sin ejecutar

Preparar staging con la misma release, dataset sanitizado y carga para cada alternativa. Como supuesto inicial de comparación, usar 4 dispositivos/pestañas activas y 2 pedidos/min durante 30 minutos, más un escenario de 8 dispositivos y 6 pedidos/min durante 15 minutos; reemplazar por los datos reales del local. Incluir POS táctil/tablet y comandas; no hacer cargas contra producción. Medir desde Salta sobre la conexión del local: pantalla operable, búsqueda y primer agregado, confirmación de venta/cobro, actualización de comanda, errores, p50/p95 y cantidad de muestras; reservar p99 para muestras suficientes. Separar primer acceso después de inactividad y estado caliente.

Si la comparación justifica cambiar la base:

1. Inventariar versión, extensiones, roles, restricciones, índices e historial de migraciones. Preparar una release compatible y copia consistente en un destino nuevo; nunca usar el volumen de producción para ensayos.
2. Ensayar exportación/restauración en staging con credenciales fuera de argumentos/logs, herramienta PostgreSQL compatible y un dump sanitizado. Validar conteos y conciliaciones de ventas/pagos/caja/stock, importes exactos, secuencias, revisiones, idempotencia y aislamiento de dos sucursales sintéticas. Medir duración y probar backup/restauración del nuevo destino.
3. Definir ventana operativa, responsable y un único escritor. Para una sucursal pequeña, una pausa de escrituras acordada permite exportación final consistente, restauración y validación antes de cambiar `DATABASE_URL`; la duración real debe venir del ensayo. No habilitar escritura simultánea en bases divergentes.
4. Probar acceso y operaciones críticas antes de reabrir el local. Conservar origen protegido y sin escrituras durante la retención acordada. Si aún no hubo escrituras en destino, el retorno es directo; si las hubo, detener operaciones y conciliar/reproducirlas mediante un procedimiento revisado antes de volver. Cambiar la URL sin reconciliar perdería ventas nuevas.
5. Registrar RPO/RTO medidos, verificaciones y responsable. No ejecutar esta migración hasta que esa propuesta concreta esté revisada y autorizada.

Al crecer, volver a dimensionar cuando se incumpla el presupuesto de latencia, haya espera sostenida de pool/locks, CPU/memoria/disco saturados o aumenten dispositivos/sucursales. La segunda sucursal exige además validar la operación aislada de ambas y sus permisos; no exige por sí sola microservicios o Kubernetes. La necesidad de seguir operando durante una falla de host, a diferencia de poder restaurar después, sí justifica redundancia/failover.

## Verificación en este entorno

- Leídas las guías incluidas en Next.js 16.3.6 para `output: standalone` y self-hosting.
- `docker compose --env-file docker.env.example -f compose.lab.yaml config --quiet`: correcto el 2026-11-19.
- Configuración Next con/sin `KYBO_STANDALONE=1`: ambas evaluadas; standalone sólo cuando está activado.
- Docker Compose instalado: 2.30.3-desktop.1. `docker info` no encuentra el motor Linux de Docker Desktop. No se construyó ni ejecutó la imagen; compatibilidad Linux, descarga de dependencias y arranque funcional quedan sin verificar. El build y smoke test en Docker Linux son requisitos antes de desplegar.
- El primer intento de build de imagen tampoco podía escribir el lock del CLI. Usar un directorio de configuración temporal aislado evitó ese lock y confirmó que faltaba el daemon; no se presentó como una imagen validada.

## Condiciones antes de elegir o cambiar el despliegue

1. Construir y arrancar la imagen en Docker Linux; verificar assets, fuentes/iconos, cookies HTTPS, sesiones, fotos privadas y funciones críticas con una fixture/release compatibles.
2. Reconciliar release/esquema y resolver los bloqueantes operativos de la auditoría: resultado incierto de operaciones, observabilidad/alertas, límites de pool/HTTP y backups restaurados.
3. Comparar alternativas con la aplicación optimizada y tráfico representativo desde Salta, separando arranques en frío y estado caliente. No atribuir mejoras a un proveedor con datasets o escenarios diferentes.
4. Validar recuperación y continuidad con RPO/RTO medidos y responsables de mantenimiento. Para PostgreSQL autoalojado, ensayar restauración fuera del host antes de tomar la decisión.
5. Si se justifica trasladar la base, preparar un corte de único escritor y una conciliación revisada antes de modificar producción. La preparación de estos archivos no autoriza ejecutar el traslado.

## Fuentes oficiales consultadas (2026-11-19)

- Next.js, guías de la **versión instalada**: `node_modules/next/dist/docs/01-app/02-guides/self-hosting.md` y `01-app/03-api-reference/05-config/01-next-config-js/output.md`. Referencia pública: [Self-hosting](https://nextjs.org/docs/app/guides/self-hosting) y [output](https://nextjs.org/docs/app/api-reference/config/next-config-js/output).
- Dokploy: [Dockerfile build type](https://docs.dokploy.com/docs/core/applications/build-type), [backups](https://docs.dokploy.com/docs/core/databases/backups) y [restauración](https://docs.dokploy.com/docs/core/databases/restore).
- Imagen oficial: [PostgreSQL Docker README](https://github.com/docker-library/docs/blob/master/postgres/README.md).
- Tags comprobados en el manifiesto oficial: [PostgreSQL `18-bookworm`](https://raw.githubusercontent.com/docker-library/official-images/master/library/postgres) y [Node `24-bookworm-slim`](https://raw.githubusercontent.com/docker-library/official-images/master/library/node). El host local usa Node 24.21.0; el tag de contenedor puede resolver otro parche de la misma major. Registrar y probar su digest antes de promoverlo.
- PostgreSQL 18: [Archivado continuo y PITR](https://www.postgresql.org/docs/18/continuous-archiving.html).
