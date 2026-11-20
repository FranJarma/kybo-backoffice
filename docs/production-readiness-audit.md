# Auditoría de preparación para producción de Kybo

Fecha: 12 de noviembre de 2026, Argentina. Repositorio: `kybo-operations-next`, rama del checkout `codex/temporary-passwords`, versión `0.6.0-rc.1`, commit `2b283401c7b9ce515c9a278ed5fb795010d8a0e8`, con los cambios locales previos incluidos en la inspección. Alcance: diagnóstico y planificación; una sucursal en Salta, tablets y terminales táctiles, crecimiento posterior a varias sucursales.

## 1. Dictamen y confianza

**Lanzamiento condicionado: todavía no hay evidencia suficiente para aprobar que el sistema opere como único registro del local.** Hay buenas garantías transaccionales e idempotencia, pero faltan verificar un despliegue reproducible, recuperación ensayada, observabilidad y concurrencia real de los circuitos actuales de venta/caja. El resultado no significa que se hayan demostrado pérdidas de ventas o corrupción de stock.

La recomendación inicial es conservar PostgreSQL en Neon São Paulo, evaluar Vercel Pro con funciones en `gru1` y Neon Launch siempre activo, y corregir primero las solicitudes duplicadas y los viajes innecesarios a la base. **No se demostró que migrar a otro proveedor mejore la velocidad.** La base actual es pequeña; la multiplicación de consultas y la serialización de operaciones merecen más atención inmediata que agregar índices indiscriminadamente o servidores.

Confianza alta en los hechos de código, índices y configuración de Neon inspeccionados, y conteos SQL sintéticos. Confianza media en riesgos inferidos de orden de locks y de navegación entre pestañas, todavía sin reproducción concurrente. No se dispone de una línea base HTTP autenticada desde Salta, tablet real ni métricas históricas de producción. Los objetivos y costos de este documento son propuestas, no garantías alcanzadas.

### Evidencia utilizada y límites

- Se leyeron `AGENTS.md`, dependencias, código, migraciones, pruebas y verificaciones previas. Se consultaron las guías **instaladas** de Next 16.3.6: producción, autoalojamiento, instrumentación, componentes cliente, obtención de datos y Route Handlers.
- Se vinculó exactamente el hostname de `DATABASE_URL` local con el endpoint de la rama `main` de `kybo-backoffice` en Neon, identificada por la integración como productiva. No se asumió que cualquier proyecto de la cuenta correspondiera a este repositorio.
- En esa base solo se efectuaron diagnósticos de lectura, agregaciones pequeñas de conteos, consulta de catálogos y dos `EXPLAIN (FORMAT JSON)` **sin `ANALYZE`**. No se crearon extensiones, índices o ramas; no se aplicaron migraciones, reinicios, resets de estadísticas ni pruebas de carga.
- Las mediciones de servicios usan PGlite aislado en memoria y datos sintéticos. Las pruebas generales se aíslan con `DATABASE_URL`, `KYBO_LOCAL_DB` y `KYBO_TEST_DATABASE_URL` vacíos; el permiso de migraciones de fixture se limita a `disposable-only`.
- No se inspeccionó el panel de Vercel ni una conexión de almacenamiento Blob. La ausencia de archivos de configuración, CI o monitoreo en el repositorio **no prueba su ausencia en el proveedor**.
- No se pudo cotejar el SHA desplegado en Vercel con este checkout. La vinculación exacta de la base no demuestra que el código analizado sea el mismo artefacto actualmente publicado. Los dos pasos adicionales de su historial se identificaron por hash en otros commits del repositorio: impresión de comandas y recuperación de contraseña. El journal del checkout tiene dos entradas menos que la base; debe elegirse una versión de lanzamiento coherente.
- Se preservaron los cambios locales anteriores. Solo se agrega documentación versionada; los registros y scripts de medición temporales quedan bajo `tmp/production-audit-20261112`, ignorado por Git. No se guardaron credenciales ni datos de clientes en el informe.

## 2. Estado real de plataforma y datos

| Elemento | Comprobado | Implicación |
| --- | --- | --- |
| Aplicación | Next 16.3.6 App Router, React 19.3.0, TypeScript 6.0.3, ESM | Usar las guías correspondientes; no trasladar supuestos de caché de otras versiones. |
| Datos y autenticación | Drizzle 0.45.3, `pg` 8.23.0, Better Auth 1.7.6 | Se conserva el stack existente. Better Auth es propio; no depende de migrar a Neon Auth. |
| Runtime de auditoría | Windows x64, Node 24.21.0; `engines.node >=24` | El runtime efectivamente configurado en Vercel sigue sin verificar. |
| Base vinculada | PostgreSQL 18.7, AWS São Paulo `sa-east-1`, hostname de aplicación con `-pooler` | La base ya está cerca geográficamente de Argentina. Verificar la región de las funciones antes de mover datos. |
| Plan y cómputo | Organización Neon `free_v3`; mínimo = máximo = 0,25 CU; endpoint inicialmente inactivo; suspensión con valor de plan por defecto | No hay autoscaling efectivo configurado. El primer acceso puede requerir reactivación. No se modificó nada. |
| Recuperación | `history_retention_seconds=21600`, seis horas; rama principal sin protección de rama, con restricciones de eliminación de la integración | La ventana es corta para descubrir errores al día siguiente. No acredita un backup independiente ni un ensayo de restauración. |
| Límite y tamaño | Límite lógico configurado de rama 1 GiB; tamaño de `neondb` 20.676.608 bytes en el diagnóstico | El tamaño lógico de la rama incluye otro alcance; no confundir sus aproximadamente 44,6 MB con `pg_database_size(neondb)`. |
| Sucursales y ramas | Una sucursal de negocio, activa, zona `America/Argentina/Buenos_Aires`; nueve ramas Neon del proyecto | Las ramas de base para desarrollo/preview son distintas de las sucursales del negocio. |
| Caja | Activada, cero sesiones abiertas en el momento consultado | No demuestra un problema fuera del horario operativo. El control de inicio de atención debe exigir apertura antes de vender. |
| Estado de esquema | `data_model_state=ready`; 37 registros de migración frente a 35 entradas del journal local | Las 35 migraciones locales coinciden por hash/timestamp y las dos restantes también coinciden con fuentes versionadas en otros commits. La base está dos migraciones por delante de este checkout, no tiene pasos huérfanos demostrados. |
| Presupuestos de espera observados en la sesión del conector | `statement_timeout=0`, `lock_timeout=0`, `idle_in_transaction_session_timeout=5min`, `max_connections=112` | Las consultas activas y la espera de locks no tienen límite en esta configuración observada. El timeout de transacción ociosa no limita una consulta activa. Las opciones del rol/URL de aplicación deben contrastarse antes de equiparar ambas sesiones. |
| Estadísticas | Solo extensión `plpgsql`; `pg_stat_statements` no está instalado; reinicio de cómputo observado durante la auditoría | No se pudo obtener ranking histórico de consultas. No se instaló la extensión. Una captura de cero locks no demuestra ausencia de contención en hora pico. |

Conteos exactos de la rama vinculada, solo lectura, durante la auditoría:

| Relación | Filas | Relación | Filas |
| --- | ---: | --- | ---: |
| Sucursales | 1 | Productos | 51 |
| Insumos/artículos | 71 | Productos habilitados en mostrador | 32 |
| Ventas / pedidos / renglones / pagos | 6 cada una | Comandas/tareas de preparación | 6 |
| Movimientos de stock | 92 | Lotes | 48 |
| Saldos lote/ubicación | 56 | Operaciones idempotentes de stock | 546 |
| Tareas diarias | 40 | Recetas actuales configurables / antiguas | 27 / 6 |

Estos datos no representan una jornada real de estrés ni una proyección del volumen futuro. Los índices candidatos no se califican como urgentes por escanear tablas de este tamaño.

Correspondencia adicional verificada: `0035_order_printing`, timestamp `1793664000000`, commit `2a32299`; `0036_whatsapp_password_recovery`, timestamp `1793923200000`, commit `afdf27c`. Ambos SQL coinciden por SHA-256 y timestamp con el historial vivo. Sus funcionalidades pertenecen a otras revisiones; esta auditoría de aplicación no certifica el código completo de esas revisiones. No se modificó el journal ni se reaplicó SQL.

## 3. Arquitectura y flujos críticos

Es un monolito modular: componentes de App Router y cliente llaman Route Handlers; estos resuelven sesión, permisos y sucursal y delegan a servicios Drizzle. Las mutaciones agrupan dominio, auditoría e identidad de operación en transacciones PostgreSQL. Las fotos usan Blob privado, con referencias en PostgreSQL; las pantallas compartidas se actualizan mediante polling.

| Flujo | Recorrido actual | Consultas, cálculo y garantías |
| --- | --- | --- |
| Entrar en `/sales` | Layout de venta → identidad/contexto → página → hidratación de `SalesManager` | Tres resoluciones de identidad y dos de contexto operativo en el recorrido de render, además de lecturas auxiliares. No hay memoización por render explícita. Referencias: `src/app/(selling)/layout.tsx:18`, `src/app/(selling)/sales/page.tsx:8`, `src/modules/branches/page-context.ts:32`. |
| Carta y búsqueda | `/api/sales/lookup?kind=products` por páginas de 30 → filtrado local | La carta espera todas las páginas antes de mostrarse. Los 32 productos habilitados actuales requieren dos páginas. Buscar productos/categorías no llama al servidor por cada tecla. `src/components/sales/cart.tsx:75`, `src/modules/sales/product-lookup.ts:94`. |
| Opciones y combos | Configuración por producto → caché POS → configuración del carrito | Caché de promesas 60 s/100 entradas, claves por sucursal/canal/versiones; calentamiento con dos workers. El diálogo de combo tiene otra caché que no comparte la del POS. |
| Confirmar venta/cobro | POST `/api/sales` o acción de cuenta → permisos vivos → transacción → claim → catálogo/precios → venta/pago/reserva/comanda/caja | Locks de cuenta/revisión, bloqueo global de grafo y cash lock por sucursal. Cantidades e importes exactos. La respuesta nueva aprovecha `INSERT RETURNING`. Los cobros son registros manuales, no verificación de un adquirente. |
| Preparar y entregar | GET `/api/preparation` → POST de acción → consumo/resolución → respuesta confirmada | Lectura paginada y detalles en lotes; actualización nominal cada cinco segundos. Consumo y eventos transaccionales. Se bloquean acciones con información vieja o sin conexión. |
| Localizadores/pantalla pública | GET `/api/pickup` y GET `/api/public/pickup/[key]` | Dos loops independientes del mismo fleet en cada POS; un tercero al abrir administración. La pantalla pública consulta trabajo pendiente, diez órdenes SQL/nueve visibles por página, sin recuperar todo el historial. |
| Inventario y disponibilidad | Route Handler → contexto → `stockByBranch`/lotes → reservas/consumo | Stock usa snapshot repeatable-read; N+1 por artículo. Lotes relee cada entrada fuera de un único snapshot. FEFO, reservas y bloqueo se calculan con cantidades exactas. |
| Caja y jornada | `/api/cash`, estado/configuración y `/api/operations/day` → comando | Advisory lock por sucursal, revisión y unicidad del origen de movimientos. El tablero diario pagina después de traer y procesar el historial de tareas y saldos. |
| Compras y recetas/costos | APIs de compras/procurement y recetas/costos → transacciones y lectores especializados | Procurement agrupa relaciones y limita encabezados. El costeo de catálogo ya fue optimizado; el listado de recetas conserva una multiplicación diferente de consultas. |
| Fotos | API autenticada → autorización → transformación/variante → Blob privado | Miniaturas/ETag/cachés acotadas existentes; DB y almacenamiento deben recuperarse de forma coherente. |

La autenticación y la autorización agregan consultas distintas: `actorFromHeaders` hace dos lecturas propias tras Better Auth (`src/lib/auth.ts:192`, `:245`); `requireOperationalContext` hace otras dos (`src/modules/branches/context.ts:57`, `:119`). Varios servicios vuelven a resolver contexto. No eliminar controles vivos después de esperar un lock ni mantener permisos cacheados entre solicitudes.

### Implementado frente a alcance pendiente

Existen ventas, cobros manuales, caja, reservas/consumo de stock, preparación, compras, fichaje y separación por sucursal en código. Partes del README describen entregas antiguas que todavía dicen que no existe consumo de inventario; ese texto no prevalece sobre los módulos actuales.

No se verificó una integración de procesamiento/verificación de pagos o devoluciones con Mercado Pago, importación operativa Fudo, webhooks fiscales ni operación offline. La aplicación conserva una operación incierta en la pestaña; eso no equivale a una cola offline duradera. Validar aparte qué comprobantes, impresión e integraciones son condiciones operativas para reemplazar el circuito actual del local.

## 4. Línea base y mediciones

### 4.1 Verificaciones del checkout

Tipos y lint cuentan con resultados frescos. La build se ejecutó sin conexión de aplicación a la base y en directorios aislados; las configuraciones generadas se restauraron. La compilación no completó un artefacto productivo en este entorno: los errores de filesystem se separan de errores demostrados del código.

| Comando/ensayo | Resultado observado | Alcance |
| --- | --- | --- |
| `node node_modules/typescript/bin/tsc --noEmit --incremental false` | Correcto, salida 0; 93,3 s | Estado actual del checkout, incluidos cambios locales. Tiempo de herramienta Windows, no latencia de aplicación. |
| `node node_modules/eslint/bin/eslint.js .` | Correcto, salida 0; 145,0 s | Misma salvedad de tiempo de herramienta. |
| `next build` por defecto, Turbopack | No produjo artefacto terminado; se canceló tras aproximadamente nueve minutos sin pasar de creación de build | No se atribuye el bloqueo al código ni al proveedor sin aislar la causa. |
| `next build --webpack` | Salida 1 a los 70,3 s por `EPERM` al crear directorio generado de tipos; repetición con temporales del workspace, salida 1 a los 67,3 s por otro directorio generado del servidor | Un `mkdir` acotado desde el proceso principal sí pudo crear el primer directorio. La hipótesis de temporales compartidos no resolvió la build; hace falta aislar permisos/workers en un entorno de build soportado. No se modifica la configuración del producto ni se certifica compilación correcta. |
| Vitest, selección crítica con `--pool=threads --maxWorkers=1` | **44 pruebas correctas, cero fallidas/omitidas, seis archivos, ocho suites; salida 0**, aproximadamente 52 s | Caja, cobros/ventas, entrada POS, preparación/consumo, tracking de stock y caché. PGlite desechable; no equivale a PostgreSQL multiconexión ni navegador. |
| Vitest, ejecución completa | **No aprobada**: primera corrida con 172 archivos afectados por `ENOENT` del caché temporal SSR, un fixture antiguo con error de transición, 64 aserciones correctas y cinco omitidas. Repetición con temporales de workspace interrumpida tras más de diez minutos sin reporte final | No atribuir todos los fallos de carga a lógica de negocio ni afirmar que la suite completa pasa. El fixture `tests/helpers/database.ts:22` ejecuta el journal directamente y no realiza la transición explícita exigida por 0008; `tests/recipes.test.ts:14` lo utiliza. Adaptación pendiente, sin cambiar pruebas en esta etapa. |
| E2E estándar | No ejecutado: `scripts/e2e-run.ts:42` invoca primero el migrador deshabilitado | El runner actual inicia además `next dev`, no un artefacto de producción. |
| Conexión TCP `pg` de diagnóstico | `ENOTFOUND` en el entorno de ejecución; cero muestras de RTT | No prueba una caída de Neon: el conector sí pudo leer la base. No hay latencia desde Argentina verificada. |

### 4.2 Mediciones sintéticas de servicios

Harness temporal: `tmp/production-audit-20261112/service-profile.mjs`, ejecutado con `node --import tsx`, `NODE_ENV=test`, URLs de bases vacías y `KYBO_ALLOW_TEST_MIGRATIONS=disposable-only`. PGlite en memoria, una sucursal, una ubicación, 71 artículos, 100 lotes, 51 productos habilitados y diez recetas configurables de un ingrediente. Tres repeticiones secuenciales por lectura; preparación del dataset fuera de la medición. Instrumentación mediante logger Drizzle. El fixture y el harness completos se conservan en el apéndice 15 para repetir el ensayo; los IDs se generan aleatoriamente.

| Operación | SELECT instrumentados por repetición | Resultado | Tiempos locales observados, ms |
| --- | ---: | --- | --- |
| Stock, 71 artículos | **73** | 71 filas | 196 / 150 / 142 |
| Lotes de un artículo, 99 entradas | **101** | 99 filas | 283 / 284 / 279 |
| Listado de diez recetas configurables | **87** | Diez filas, incluidos controles de acceso del servicio | 193 / 156 / 159 |
| Carta, primera página de 51 | 5 | 30 filas | 20 / 18 / 17 |
| Carta, segunda página | 5 | 21 filas | 15 / 15 / 14 |
| Fleet sin asignaciones | 4 | Cero ocupados; servicio sin HTTP/auth externos | 8 / 5 / 7 |

Estos tiempos son duraciones locales de pared de ejecución embebida, con posible competencia de la compilación; **no miden consumo de CPU, rendimiento HTTP de producción ni percentiles confiables**. El dato sólido es la multiplicación observada de SELECT. El logger no constituye un contador de todos los mensajes del protocolo ni de comandos de transacción internos del cliente.

No se agregaron retardos artificiales. Multiplicar consultas secuenciales por una RTT hipotética permite estimar sensibilidad, pero no sustituye medir la aplicación y base en la región elegida. No se publican p95/p99 a partir de tres muestras.

### 4.3 Planes y estadísticas de la base real

Los planes de lectura reciente de `sales` y de historial por sucursal/artículo en `stock_movements` muestran `Sort` sobre `Seq Scan`. Son planes estimados, sin tiempos ejecutados; con seis ventas y 92 movimientos eso es esperable. Los índices declarados relevantes se contrastaron con `pg_indexes`: no existe un índice por sucursal/artículo/fecha en movimientos; `sales` tiene fecha comercial/creación pero no sucursal/creación como claves iniciales.

El diagnóstico `outliers` no estuvo disponible por falta de `pg_stat_statements`. El snapshot de locks y el conteo posterior mostraron cero esperas; el cómputo acababa de reactivarse. No se infieren tasas históricas ni saturación a partir de esa captura.

## 5. Hallazgos priorizados

P1: requisito para lanzamiento confiable o continuidad; P2: mejora o defecto a resolver con prioridad según el flujo; P3: crecimiento o mejora que requiere perfilado. **P1 futuro** se exige antes de habilitar una segunda sucursal, no implica que hoy haya escritura entre sucursales.

| ID / prioridad | Flujo y evidencia | Impacto comprobado o riesgo | Propuesta | Esfuerzo orientativo / riesgo del cambio | Validación necesaria |
| --- | --- | --- | --- | --- | --- |
| A01 · P1 | Instalación: `package.json:25`, `:36`, `:50`, `:63`; `package-lock.json:10`; `pnpm-lock.yaml:17`; `README.md:117` | npm lock carece de cuatro dependencias declaradas que sí tiene pnpm; la instalación documentada con `npm ci` no es reproducible por inspección estática. No se reinstalaron dependencias. | Elegir gestor canónico, alinear lock y documentación; fijar Node en despliegue/CI. | Bajo / bajo, pero verificar instalación limpia. | Checkout limpio, instalación inmutable, tipos, lint, build y pruebas con el mismo gestor. |
| A02 · P1 | Esquema: `scripts/migrate.ts:3`, `scripts/e2e-run.ts:42`, `drizzle/meta/_journal.json`; historial vivo y commits `2a32299`/`afdf27c` | Migrador público siempre falla; runners específicos no forman un upgrade único actual. La base está dos pasos por delante de esta rama; sus fuentes ya están identificadas y coinciden. | Alinear release/esquema/journal y publicar un upgrade verificable. No borrar historial ni repetir backfill. | Medio / alto si se toca una base con datos. | Ensayo sobre destino aislado, hashes, integridad, compatibilidad con versión anterior y smoke posterior. |
| A03 · P1 | Diagnóstico: `src/modules/catalog/http.ts:29`, `:40`; `src/modules/sales/http.ts:26` | Errores inesperados se transforman en 503 sin evento técnico ni request ID. La privacidad está protegida, pero no hay causa trazable en este handler. | Logs estructurados redactados, correlación y captura explícita antes del 503; errores de cliente/servidor y alertas. | Medio / bajo con pruebas de redacción y volumen. | Provocar error controlado en staging y encontrar request/release/operación, sin secretos ni datos de clientes. |
| A04 · P1 | Recuperación: configuración Neon, `src/modules/media/service.ts:24`, `src/modules/cash/photos.ts:105` | Ventana PITR seis horas; no hay evidencia de restauración ni de copia independiente y conjunta de DB/fotos. | Ampliar política según plan; copias independientes y runbook ensayado. | Medio / operativo; una restauración incorrecta puede perder ventas posteriores. | Restaurar en destino separado, conciliar ventas/pagos/caja/stock y referencias de fotos; medir pérdida y duración. |
| A05 · P1 | Pool y esperas: `src/db/client.ts:46`, `src/components/inventory/shared.tsx:261`; configuración viva | Pool solo configura URL; espera de checkout sin presupuesto, SQL/locks ilimitados observados y sin listener de error idle. Mutaciones sin deadline de aplicación. | Presupuestos explícitos por capa, listener redactado, métricas de pool y tratamiento de resultado incierto. | Medio / medio: cortar espera no revierte un commit. | DB indisponible, pool agotado, lock retenido y conexión idle terminada; recuperación con misma clave y sin duplicados. |
| A06 · P2 | POS: `sales-manager.tsx:155`, `:855`; `pickup/locator-manager.tsx:74`, `:127`; `pickup/use-locators.ts:12` | Dos loops permanentes del mismo fleet; un tercero en el diálogo. Tráfico repetido aun con herramientas ocultas. | Compartir fleet/carga; montar lector adicional solo si necesario; visibilidad, cancelación y backoff. | Bajo / bajo. | HAR por 60 s con herramientas ocultas/abiertas y reconexión; una sola fuente, misma frescura y permisos. |
| A07 · P2 | Inventario: `src/modules/inventory/scoped-queries.ts:34`, `:54`, `:178`, `:198` | N+1 real: stock 2+N SELECT secuenciales; lotes 2+N con ráfaga `Promise.all`. Medidos 73 y 101. | Leer lotes de todos los artículos de la página en conjunto; completar lotes en la consulta paginada. | Medio / medio por saldos, reservas, vencimientos y snapshot. | Fixtures equivalentes de bloqueados/vencidos/sin fecha y múltiples ubicaciones; conteo SQL acotado e invariantes idénticas. |
| A08 · P2 | Recetas: `src/modules/recipes/service.ts:794`, `:831`; `src/modules/recipes/costing.ts:17` | Se vuelve a construir el contexto global por receta configurable. Diez recetas midieron 87 SELECT. | Un contexto por solicitud y configuración cargada en lotes; reutilizar semántica de `catalog/cost-configurations.ts:35`. | Medio / medio: conservar costos desconocidos, merma, versiones y canales. | 1/10/50 recetas; mismos importes, defaults, alternativas y faltantes; consultas independientes del número de recetas. |
| A09 · P2 | Carga inicial: `src/components/sales/cart.tsx:75`, `:90`; layout/página de venta | Primer producto visible espera todas las páginas; identidad/contexto se resuelven repetidamente antes de hidratar. | Mostrar primera página inmediatamente; memoización por render/solicitud de datos inmutables y deduplicación justificada. | Medio / medio por búsqueda completa y permisos. | Primer producto utilizable, búsqueda de productos no cargados aún, recarga y revocación inmediata de acceso. |
| A10 · P2 actual / crecimiento | Confirmaciones: `src/modules/sales/service.ts:324`, `:644`; `inventory/locking.ts:23`; `cash/integration.ts:35` | Lock exclusivo del grafo global en cada venta y filas globales de artículos; cash lock por sucursal. Serialización estática, espera real no medida. | Reducir trabajo bajo locks y evaluar lectores compartidos/publicadores exclusivos con orden uniforme. Mantener serialización financiera necesaria. | Alto / alto: no quitar locks sin prueba de carreras. | Dos cajas, productos iguales/distintos, publicación simultánea, cierre/cancelación y luego dos sucursales; medir lock waits. |
| A11 · P2 | Publicación: `src/modules/products/fulfillment.ts:54`, `:72`; `src/modules/recipes/service.ts:538`, `:556`; API fulfillment `:44` | Orden P→I frente a I→P permite ciclo de deadlock entre configuraciones administrativas. Inferencia estática; no reproducida. | Un mismo protocolo de locks en todas las entradas de publicación. | Medio / alto por integridad de catálogo. | Dos conexiones coordinadas manteniendo ambos locks; fallo acotado y reintento íntegro. |
| A12 · P1 procedimiento / P2 producto | Resultado incierto: `src/components/inventory/shared.tsx:171`, `:181`, `:340`; `sales-manager.tsx:583` | La pestaña conserva payload/clave, pero al perderla se pierde la identidad de reintento. Una nueva UUID no deduplica la venta anterior. | Procedimiento de consulta/conciliación antes de repetir; luego journal duradero y recuperación autorizada por operación. | Medio / medio por privacidad y no confundir pago real con su registro. | Commit con respuesta perdida: misma pestaña, reload, pestaña cerrada y otro dispositivo. No duplicar venta/caja/stock. |
| A13 · P1 futuro | Sucursal: `src/components/sales/sales-manager.tsx:312`; `src/components/inventory/shared.tsx:170`, `:265`; `branches/selector.tsx:27` | POS recibe branchId pero la operación puede tomar cookie compartida cambiada en otra pestaña. Riesgo de registrar en sucursal distinta de la visible. | Fijar lecturas, escritura, borrador y recuperación a sucursal de página; detectar cambio entre pestañas. | Medio / medio. | Dos pestañas A/B con producto compartido; verificar sucursal efectiva de venta, caja y stock. Bloquea habilitar segunda sucursal. |
| A14 · P2 administrativo | Archivo: `src/modules/branches/service.ts:68`, `:153`; `branches/context.ts:57` | Se controla trabajo/stock pero no sesión de caja abierta o revisión pendiente; podría quedar inaccesible al archivar. | Guardas de caja bajo lock de sucursal y política de reapertura/recuperación. | Bajo–medio / medio. | Sucursal sin stock con caja abierta o revisión pendiente; debe rechazarse el archivo. |
| A15 · P3 / historial | `src/modules/daily-operations/queries.ts:46`, `:161`, `:259`, `:301`; `inventory/reservation-batch.ts:78` | Se traen tareas/dependencias y saldos históricos antes de filtrar/paginar; las reservas incluyen lotes agotados. | Predicados/paginación SQL, dependencias relevantes y agregados; separar disponibilidad de historial. | Medio–alto / medio por dependencias fuera de página y reservas. | Dataset con un año de historial, filas/buffers/payload, misma cola y cantidades. |
| A16 · P3 medible | Imports POS `sales-manager.tsx:5`, `:58`; `workplace/actions.tsx:11`; `sales/history.tsx:56` | Pantallas secundarias se importan estáticamente; historial usado queda montado y se refresca oculto. No hay bytes/tiempos de parsing medidos. | Lazy loading selectivo e invalidación solo cuando corresponda; conservar respuesta rápida al primer toque. | Bajo–medio / bajo. | Bundle del artefacto, perfil tablet y primera apertura fría/caliente; verificar que diferir no empeore opciones frecuentes. |

Las referencias abreviadas de componentes A06/A09/A12/A13/A16 están bajo `src/components/`; los números indican líneas de este checkout, no rangos de una futura implementación.

### Protecciones existentes que deben conservarse

- Un `getDb` global por proceso reutiliza la promesa/pool; no se crea un pool por request (`src/db/client.ts:14`).
- Claim idempotente, fingerprint, resultado y cambios se confirman en una transacción (`src/modules/operations/command.ts:52`, `:123`, `:191`). El replay comprueba actor, payload, sucursal y permisos vigentes. Ventas conserva también su mecanismo de claim y revisión.
- Locks de venta, revisiones y pagos/devoluciones compensatorias; cash lock PostgreSQL por sucursal y unicidad de origen. Estas protecciones funcionan entre instancias de aplicación y no deben reemplazarse por locks en memoria.
- BigInt/decimales, constraints y reservas evitan redondeo flotante y carreras obvias de saldo. Cancelación libera lo no consumido y deja consumos inciertos para resolución explícita.
- Sesión privada, alta pública deshabilitada, cookies seguras en producción, límites de ingreso persistidos en DB y permisos de servidor. No se encontró un bypass directo por elegir otro header de sucursal en los caminos revisados.
- Ventas/preparación/procurement ya agrupan relaciones por página; no todo el código tiene N+1. El resumen de costos de catálogo tiene optimizaciones previas que no se deben deshacer.

## 6. SQL e índices candidatos

**Propuestos, no aplicados.** Primero corregir forma de consultas y medir. La base de una sucursal no necesita particionado, sharding, una base por sucursal ni réplicas de lectura solo por anticipar crecimiento.

```sql
CREATE INDEX sales_branch_recent
  ON sales (branch_id, created_at DESC, number DESC);

CREATE INDEX stock_movements_branch_item_recent
  ON stock_movements (branch_id, item_id, created_at DESC, id DESC);

CREATE INDEX stock_movements_document_lot
  ON stock_movements (document_id, lot_id);

CREATE INDEX lot_balances_branch_location_lot
  ON lot_location_balances (branch_id, location_id, lot_id);

CREATE INDEX reservation_allocations_active_lot_location
  ON reservation_allocations (lot_id, location_id)
  WHERE allocated > consumed + released;
```

| Candidato y consulta beneficiada | Índices existentes y decisión | Costo y validación |
| --- | --- | --- |
| Ventas recientes, `sales/service.ts:1003` | `sale_date(business_date,created_at)` y `sale_branch_identity(id,branch_id)` no equivalen al orden reciente por sucursal. Índices vivos confirmados. | Un índice más por venta; comparar también consulta por fecha comercial antes de elegir diseño final. Validar plan/latencia con historial representativo. |
| Movimientos por artículo/sucursal, `inventory/scoped-queries.ts:211` | Solo PK y `sequence` unique en `stock_movements`, confirmado en vivo. El historial legado tiene su propio índice y no requiere duplicarlo. | Mayor WAL/espacio por cada movimiento; probar consulta completa con su UNION/contador, no solo una rama simplificada. |
| Movimientos por documento, `fulfillment/returns.ts:61`, `production/review-result.ts:103` | Ningún índice vivo empieza con `document_id`. | Segundo índice de movimientos: incorporarlo solo si las lecturas y crecimiento lo justifican. No evita todos los sorts internos. |
| Saldos por sucursal/ubicación, `daily-operations/queries.ts:46`, `inventory/reservation-batch.ts:86` | PK `(lot_id,location_id)` y unique `(lot_id,location_id,branch_id)` comienzan por lote. Confirmados en vivo. | Una sucursal ofrece poca selectividad; priorizar excluir/agregar histórico y medir. Mantenimiento de inserciones/vacuum. |
| Reservas activas por lote/ubicación, `inventory/scoped-adjustments.ts:163` | Unique declarada empieza por `reservation_id`; inventario vivo detallado de este índice aún pendiente. | Predicado cambia al consumir/liberar: mantenimiento extra y posible pérdida de HOT. Baja prioridad hasta medir esta operación infrecuente. |

No agregar índices redundantes de `sale_orders.sale_id` o `sale_lines.order_id`: las unicidades de secuencia/posición ya comienzan por esas claves y se comprobaron en vivo. Tampoco agregar trigram por defecto a un catálogo de 32 productos: `ILIKE '%texto%'` debe evaluarse con cardinalidad y uso. El índice convencional de nombre no soluciona automáticamente esa búsqueda.

La selección final exige `EXPLAIN (ANALYZE, BUFFERS)` en staging con datos representativos, comparación de escritura/WAL/espacio y observación de uso. No se justifican eliminaciones por estadísticas recién reiniciadas ni `VACUUM FULL`/`REINDEX` sin un problema demostrado. Migraciones mediante el mecanismo versionado, con conexión directa cuando lo requiera la herramienta, no SQL ad hoc en producción.

### Pool y límites de espera

El `pg-pool` instalado usa un máximo predeterminado de diez conexiones por instancia; sin `connectionTimeoutMillis`, el checkout pendiente no tiene un deadline propio. Esto no demuestra saturación actual. Presupuestar clientes como `instancias × max_por_pool`, sumando procesos de trabajo y mantenimiento, y medir espera, `totalCount`, `idleCount` y `waitingCount`. El endpoint de aplicación es pooleado: el límite de clientes PgBouncer y las 112 conexiones backend PostgreSQL son cantidades distintas; no deducir capacidad ni agotamiento solo del producto anterior.

Probar en staging, como punto de partida y no como configuración validada: adquisición de conexión ≤2 s, `lock_timeout` de 1 s, límite por sentencia de 3 s y deadline HTTP operativo de 8 s. Ajustar por flujo, datos y duración transaccional real; los informes pueden tener otro presupuesto. Un límite por sentencia no es un límite de transacción completa. Agregar listener redactado de errores idle y verificar integración del pool con suspensión de instancias/Fluid según la documentación vigente, sin cambiar de driver por intuición. El frontend debe conservar identidad y mostrar resultado incierto si vence su espera.

## 7. Frontend, caché y costo del polling

### Multiplicación de solicitudes

Modelo nominal derivado del código: respuestas rápidas, una página visible por superficie, sin inicio, cambios de foco, reintentos o acciones. Los loops que esperan cinco segundos **después** de la respuesta hacen `60/(5 + segundos_de_respuesta)` solicitudes por minuto; 12/min es aproximación. Los intervalos y eventos pueden variar el total.

| Superficie | Requests/min nominales | Composición |
| --- | ---: | --- |
| POS cuenta del local | 26 | Dos fleets = 24; resumen del puesto = 2. |
| POS cuenta personal | 27 | Dos fleets = 24; cabecera de caja = 2; reposición = 1. |
| Cocina personal | 14 | Preparación = 12; cabecera de caja = 2. |
| Detalle de preparación abierto | +12 | Lector independiente. |
| Administración de localizadores abierta | +12 | Tercer lector. |
| Pantalla pública de retiro | 12 | Lector con timeout y rotación de páginas. |
| Aviso de contraseña temporal | +3 mientras requerido | Se detiene cuando una lectura confirma que ya no se requiere. |

Un POS del local + una cocina personal + una pantalla pública: aproximadamente **52 requests/min, 3.120/h sin vender**. Deduplicar únicamente el fleet del POS lleva el modelo a 40/min: 720 requests/h menos. Con header de sucursal, cada `/api/pickup` ejecuta ocho SELECT propios más el trabajo de sesión de Better Auth; son aproximadamente **5.760 SELECT/h evitables por POS** al quitar una copia. Es un cálculo estático, no una traza de producción.

`useLocators` no pausa por visibilidad ni aplica timeout/backoff; los navegadores pueden además limitar timers ocultos. Preparación sí pausa oculta, cancela, usa timeout de nueve segundos y exige frescura de hasta 15 segundos. Caja y reposición también tienen controles de visibilidad. `CashStatusGate` no tiene un intervalo periódico: no atribuirle tráfico que no genera.

Las primeras lecturas JSON del POS, excluyendo navegación/activos, se modelan como `6 + L + C` para cuenta local y `8 + L + C` para personal: `L` páginas de carta y `C` configuraciones calentadas. Hoy `L=2` para mostrador, no 51 requests por los 51 productos totales. La cantidad real `C` necesita traza de los productos elegibles y sus cachés.

### Política propuesta de caché

| Dato | Alcance/tolerancia propuesta | Invalidación y validación |
| --- | --- | --- |
| Identidad/contexto del render | Solo la misma solicitud o render; sin reutilizar entre usuarios | Cambia en cada request; mantener chequeos tras esperas de locks y en replay. |
| Carta/configuración | Conservar caché POS acotada y sus versiones; no compartir entre sucursales/canales | Cambio guardado de catálogo, refresco, versión/precio y sucursal; revalidación autoritativa al confirmar. |
| Costos de recetas | Reutilizar contexto dentro de una lectura; caché transversal solo con política explícita | Cambio de costo, receta, modificador y sucursal. Un costo desconocido sigue siendo `null`. |
| Stock/caja/estado de pedido | Snapshot con antigüedad visible; no usar caché como autoridad de escritura | Respuesta de mutación, foco/reconexión y polling; confirmación siempre transaccional. |
| Fotos | Preservar miniaturas 128/384 px, ETag, caché de bytes limitada y autorización previa | Clave de asset/variante; archivo/reemplazo y permisos. |

Las fotos ya usan variantes y caché privada; `unoptimized` en el componente no demuestra que se sirva el original completo. Caja reduce fotos antes de enviarlas a un máximo de 3 MiB en el cliente; el límite mayor del API no demuestra que el flujo normal exceda Vercel.

### Polling frente a SSE/WebSockets

Para una sucursal, compartir lectores, pausar pestañas ocultas y reducir consultas por request ofrece menor complejidad. SSE se justifica si mediciones muestran demasiados lectores activos o se necesita notificación entre dispositivos más rápida que el intervalo aceptado. Un loop de DB por conexión SSE solo traslada el problema.

Una solución de eventos requiere publicar después del commit, fanout compartido entre instancias, scopes de sucursal/usuario/público, invalidación de acceso, reconexión con snapshot o replay, heartbeat y límites de conexiones del alojamiento. No hace falta adoptarla como requisito inicial. Mantener controles en línea, pocas interacciones y `search-combobox.tsx` al mejorar las pantallas.

## 8. Integridad y recuperación de operaciones

| Escenario | Comportamiento actual/evidencia | Condición de aceptación |
| --- | --- | --- |
| Doble clic/reintento con misma clave | Claim, fingerprint y resultado transaccionales; revisión de cuenta | Dos conexiones deben producir un único efecto y devolver resultado coherente al replay. |
| Commit con respuesta perdida | Hook conserva payload exacto y requestId en `sessionStorage` | UI debe indicar resultado incierto y reintentar misma operación; abortar HTTP no debe decir que se revirtió. |
| Pérdida de pestaña/dispositivo | La identidad puede perderse; una UUID nueva no tiene deduplicación semántica | Consultar historial/estado antes de repetir. Definir journal duradero y recuperación autorizada como mejora. |
| Dos cobros/cierre concurrentes | Hay locks/revisión y cash advisory lock; no se ejecutó aceptación multiconexión del circuito vigente | Verificar cobro/cierre, devolución/cierre y pago simultáneo en PostgreSQL real desechable. |
| Cancelar mientras cocina consume | Reserva/liberación/consumo y resoluciones explícitas están modelados | Probar ambos órdenes, rollback completo y ausencia de stock/caja duplicados. |
| Caída DB/pool saturado | Esperas sin presupuestos observados; hook de escritura sin deadline | Fallar dentro del presupuesto, reconectar y conservar misma identidad; no caída de worker por error idle. |
| Caída de instancia de aplicación | Los datos confirmados están en PostgreSQL; cachés/pending del navegador tienen alcances distintos | Reinicio y reenvío no duplican; logs permiten localizar el resultado; drenar requests al autoalojar. |
| Corte de internet del local | No hay operación offline validada | Usar procedimiento manual numerado; reconciliar con responsable antes de reingresar ventas/cobros. Una nube distinta no resuelve el enlace local. |
| Segunda sucursal | Modelo de datos y permisos existen; cookie/pestaña aún puede desalinear intención | Fijar scope en toda la UI antes de habilitarla, sin base separada obligatoria. |

No usar nombres de pruebas como evidencia de intercalado real: la prueba de Caja que simula un cambio de permiso dentro de una transacción no crea dos conexiones esperando un lock. La cobertura real de dos conexiones disponible hoy se concentra en transferencias/última unidad (`tests/data-model.concurrency.test.ts:81`, `tests/helpers/postgres-data-model.ts:23`). Su fixture no cubre el esquema completo actual de POS/caja. La suite antigua de modificadores debe adaptar su manejo de esquemas y guardas antes de usar una URL de prueba; no ejecutarla contra una base compartida.

## 9. Infraestructura y presupuesto

Precios/documentación consultados el 12/11/2026. USD/mes antes de impuestos argentinos y conversión cambiaria. Supuestos de planificación, **no volumen medido**: 730 h, una persona que despliega, 3–5 dispositivos, 300 ventas/día × 26 días, 3–5 GB DB a futuro, 5 GB fotos, 20–50 GB de salida y 0,5–1,5 millones de solicitudes dinámicas. Los empleados/dispositivos de Kybo no son seats de Vercel.

| Arquitectura | Región, arranque y disponibilidad | Logs/backup y operación | Presupuesto mensual estimado |
| --- | --- | --- | ---: |
| **Vercel Pro + Neon Launch** | Funciones `gru1` y DB `aws-sa-east-1`; desactivar suspensión DB. Fluid reduce cold starts, no garantiza cero. Almacenamiento resiliente de Neon no es un standby dedicado de cómputo. | Menor cambio; DB y Blob existentes. Configurar retención y observabilidad. Launch/Pro no equivalen a SLA contractual de disponibilidad del conjunto. | **US$50–85** |
| **Cloud Run + Cloud SQL zona única** | Ambos São Paulo; mínimo una instancia caliente de app. Reinicios posibles; DB de zona única sigue expuesta a falla zonal. | Logs administrados; backups/PITR configurados y copia externa. Dominio propio en São Paulo presupuestado con HTTPS LB. | **US$170–300** |
| **Cloud Run + Cloud SQL regional HA** | App con mínimo tres propuesto según recomendación oficial; piso best-effort. DB con standby zonal. | Alternativa administrada para un requisito mayor de failover; contenedores/cache/release requieren ensayo. | **US$310–600** |
| **ECS/Fargate + RDS PostgreSQL Multi-AZ** | São Paulo; dos tareas en dos AZ y ALB; DB con standby síncrono. Failover no instantáneo y no resuelve caída regional completa. | Más componentes y responsabilidad operativa. Presupuestar CloudWatch/retención, redes, secretos, registry y backups. | **US$370–600 con NAT en dos AZ; US$230–430 sin NAT, con diseño de red explícito** |
| **VPS Docker app + PostgreSQL** | São Paulo; proceso activo. Un host/disco es punto único de falla de aplicación y DB. | Parches, capacidad, backups externos y restauración a cargo del equipo; snapshots/reinicio no son HA. | **US$65–100**, sin costo humano |

Los rangos GCP/AWS/VPS son estimaciones de planificación: no se pudo completar una cotización regional de calculadora. No son tarifas exactas verificadas de São Paulo. La alternativa sin NAT requiere tareas con salida pública y reglas de entrada limitadas al ALB; PostgreSQL permanece privado. Un NAT único reduce precio a costa de una dependencia zonal.

### Cálculo verificable de la opción inicial

- Vercel Pro: US$20/mes, incluye una persona con despliegue y US$20 de crédito elegible. Factura = `20 + max(0, consumo elegible - 20) + cargos no cubiertos`.
- Neon Launch siempre activo: `730 × 0,25 × 0,106 = US$19,35` de compute; a 0,5 CU, US$38,69. Se factura capacidad real; no hay que empezar en 0,5 si 0,25 cumple y hay límites apropiados.
- Datos 3–5 GB × US$0,35/GB-mes = US$1,05–1,75. Es presupuesto de crecimiento; el dataset actual es mucho menor.
- Reservar US$1–3 para historial PITR y US$1–3 para snapshots según cambios; US$5–15 para copia independiente/job/alertas/DNS; US$0–5 de excedente de cómputo/Blob/eventos bajo estos supuestos. Son partidas, no consumo ya observado.
- Tarifas Fluid `gru1`: CPU activa US$0,221/h y memoria aprovisionada US$0,0183/GB-h. Fórmula: CPU-h × tarifa + GB-h con trabajo en vuelo × tarifa + invocaciones/otros servicios. La espera de DB consume memoria provisionada; no asumir CPU activa durante toda la espera.

Así, los planes de app y DB, con DB sin suspensión, tienen un piso cercano a US$41 con almacenamiento presupuestado, antes de los complementos. No se presupone una instancia Vercel permanentemente caliente. El presupuesto de US$50–85 incluye margen para estos últimos; no es “US$20 por todo”. El plan gratuito ofrece 100 CU-h por proyecto: a 0,25 CU son 400 horas de cómputo, no 730 h continuas. No se comprobó que hoy se haya agotado la cuota.

### Costos que deben conservarse al comparar

| Partida de planificación | GCP zona única / HA | AWS dos AZ con NAT |
| --- | --- | --- |
| Aplicación | US$15–35 / US$45–90 | US$55–80 |
| PostgreSQL | US$100–160 / US$200–320 | US$90–130 |
| Disco/backups nativos | US$5–15 / US$10–25 | US$8–20 |
| Balanceo y HTTPS | US$25–45 | US$25–40 |
| NAT | US$0 en diseño privado con salida pública normal | US$130–170 para dos zonas; además procesamiento |
| IPv4, salida, logs, registry/builds, secretos, alertas, DNS y respaldo externo | Incluir US$10–25 / US$15–45 más recursos de red exigidos | IPv4 y resto, aproximadamente US$45–75; revisar cantidad real de IP/horas |
| Conservar Vercel Blob comercial | Presupuestar US$20 de Vercel Pro | Presupuestar US$20 de Vercel Pro |

Mover compute no elimina la dependencia de Blob. Su SDK funciona fuera de Vercel; para eliminar ese proveedor hay que planificar migración de objetos/referencias, credenciales, URLs, permisos y caché. La disponibilidad actual de Render/Railway no incluye una región brasileña en sus listas oficiales: no se los presenta como sustitutos regionales equivalentes.

### Decisión recomendada

1. **Una sucursal:** mantener Neon São Paulo, verificar Vercel `gru1`, contratar capacidad/retención de producción apropiadas y corregir A01–A12 según criticidad. Autoscaling acotado solo si la carga lo requiere; aumentar pool/CPU no elimina locks globales.
2. **Varias sucursales:** compartir aplicación y DB conservando scope de negocio; resolver A13 y contención global antes de habilitar otra. Medir CPU/memoria/conexiones y latencia, sin multiplicar bases/proyectos por sucursal automáticamente.
3. **Mayor disponibilidad:** Cloud Run con Cloud SQL regional resulta una alternativa administrada razonable; Fargate/RDS también si existe capacidad operativa para AWS. Escoger después de un benchmark y un simulacro comparables; no se afirma que sean más rápidos.
4. Reabrir la decisión si, después de corregir consultas, los picos incumplen presupuestos; si conexiones/CPU permanecen cerca de sus límites, si recuperación incumple RTO o si un costo estable justifica migrar incluyendo horas humanas. El número de sucursales por sí solo no determina la arquitectura.

## 10. Observabilidad propuesta y presupuesto de servicio

### Mínimo para el lanzamiento

Inventario de implementación: no se encontraron `error.tsx`, `global-error.tsx` ni instrumentation propios; Next conserva su fallback predeterminado. `privateJson` agrega `no-store` y `nosniff` (`src/modules/catalog/http.ts:19`). Hay CSP restrictiva para comprobantes de Caja (`src/app/api/cash/photos/[id]/route.ts:29`), sin CSP global encontrada. Existen limitadores persistidos de autenticación (`src/lib/auth.ts:49`) y específicos de identidad/fichaje/contraseñas; no se afirma que falten todos los límites. La configuración adicional del proveedor sigue sin verificar.

- Logger JSON en el alojamiento y un servicio de errores de navegador/servidor. Campos: fecha, release SHA, entorno, ruta normalizada, estado, duración, request ID, categoría de error y operación cuando corresponda. Identificadores internos solo bajo acceso autorizado; nunca cookies, tokens, contraseñas, datos personales, payload financiero completo ni SQL crudo con parámetros.
- Capturar explícitamente el error que hoy termina en 503; mapear categorías DB/Blob/validación/permiso/infra. Separar auditoría de negocio persistida de logs técnicos y evitar duplicar cada consulta completa en producción.
- Instrumentación Next/OpenTelemetry acotada a solicitud, consultas/pool y Blob, con muestreo y límites de volumen. Medir checkout SQL total, número de consultas, espera de conexión y transacción/locks por separado.
- Liveness de proceso y readiness DB con timeout corto y datos mínimos; monitor externo. `/login` puede responder sin consultar DB: no sirve como única prueba de que el local puede vender. Verificación de Blob separada para no impedir ventas por una foto.
- Panel: tasa de 5xx, p95/p99 por flujo, timeouts, requests por superficie, espera/pool/conexiones, CPU/RAM DB, consumo de cuota y almacenamiento, y edad del último feed. Alertas con responsable principal y reemplazo.

Composición concreta propuesta para el primer local: Pino a stdout para JSON redactado, Vercel Observability Plus como retención y consulta inicial, e instrumentación Next/OpenTelemetry acotada. Para errores del navegador, un colector autenticado y limitado puede enviar eventos mínimos al mismo backend; evaluar un servicio dedicado si el volumen o la investigación lo requieren. Esto es diseño posterior, no una integración ya instalada. No hace falta administrar un clúster de monitoreo propio.

Umbrales iniciales propuestos para calibrar con tráfico real: tres fallas consecutivas de readiness en un minuto; 5xx ≥1% y al menos cinco fallos en cinco minutos; p95 de confirmación >1,5 s durante diez minutos con muestra suficiente; pool con espera p95 >100 ms sostenida; conexiones DB >70% del límite durante diez minutos; avisos de cuota/almacenamiento al 70% y 90%. Con muy poco tráfico, usar fallas absolutas y probes en lugar de porcentajes inestables. Cada alerta debe enlazar el procedimiento correspondiente y aplicar deduplicación.

Retención propuesta: 30 días de logs operativos redactados, con acceso limitado y presupuesto de eventos; trazas muestreadas según costo y necesidad. La conservación de auditoría comercial debe definirse aparte según negocio; este documento no fija una política legal.

Vercel Pro básico publica un día de runtime logs; Observability Plus ofrece 30 días y tarifa de US$1,20 por millón de eventos. Configurar y verificar qué eventos consume cada función; no asumir que reemplaza errores capturados, backup o métricas de PostgreSQL. Neon Launch publica tres días de métricas/logs UI; la exportación y retención necesarias deben revisarse por plan. GCP/AWS permiten logging administrado con presupuesto y retención explícita; no almacenar indefinidamente por un default.

### Objetivos propuestos, todavía no alcanzados

Medir desde la conexión real de Salta con 3–5 superficies simultáneas; usar días/horarios de atención confirmados, no horarios supuestos del README. Separar primera carga, primera operación tras inactividad y operación caliente.

| Indicador | Presupuesto inicial propuesto | Cómo verificar |
| --- | --- | --- |
| Feedback local al agregar producto ya configurado | ≤100 ms habitual; interacción fluida en tablet real | Perfil de eventos y medición de primera interacción fría/caliente. |
| Lecturas operativas calientes | p95 ≤500 ms HTTP desde el local | Muestras reales suficientes por endpoint/carga; informar tamaño de muestra. |
| Venta/cobro confirmado | p95 ≤1,5 s y p99 ≤3 s punta a punta | Click hasta respuesta confirmada; nunca incluir solo spinner/optimismo como éxito. |
| Primer producto utilizable | p95 ≤2 s en dispositivo/red definidos | Build productiva, carga fría y caliente y red local conocida. |
| Frescura entre terminales | ≤10 s objetivo normal, bloqueo visible si lectura supera su presupuesto | Medir commit → visible en otra superficie y reconexión. |
| Disponibilidad | SLO interno 99,9% durante atención, ventana móvil de 30 días | Probe externo más solicitudes reales de flujo crítico. No multiplicar ni confundir SLA de proveedores con este objetivo. |
| Detección | ≤5 min para caída sostenida o aumento material de 5xx | Inyección de falla en staging y entrega comprobada de alerta. |

Para validar p95 usar al menos cientos de muestras representativas y publicar la incertidumbre; para p99 hace falta una población mayor. Un puñado de requests diagnósticos o pruebas embebidas no acredita estos presupuestos.

## 11. Backup, incidentes y rollback

La ventana PITR describe hasta qué pasado se puede volver; **seis horas de retención no significa RPO de seis horas**. La pérdida y el tiempo de restauración siguen sin medirse. Tampoco se equipara SLA (condiciones contractuales), HA (continuidad ante fallas) y backup (recuperación de datos).

| Incidente | Política propuesta | RPO/RTO objetivo a ensayar |
| --- | --- | --- |
| Error humano/migración | Launch con PITR explícito de siete días; snapshot previo y diario hasta 35 días | RPO ≤5 min / RTO ≤30–60 min con conciliación, pendientes de ensayo. |
| Falla de instancia/AZ con HA futura | Standby y reconexión/reintentos compatibles | Proteger commits confirmados; objetivo RTO ≤5 min sujeto al diseño y simulacro. |
| Pérdida de cuenta/proveedor/región | Dump cifrado independiente diario, objetos e inventario de medios, credenciales de recuperación separadas | RPO ≤24 h / RTO ≤4 h como política inicial. Para menor pérdida hace falta mayor frecuencia o WAL externo compatible. |
| Corte de enlace local | Conectividad alternativa o registro manual numerado y conciliación | Recuperación operativa definida por el local; no se promete sincronización offline inexistente. |

Neon publica PITR Launch de hasta siete días; el default pago debe revisarse y configurarse explícitamente. Los snapshots programados tienen retención máxima publicada de 35 días. Ambos permanecen en el proveedor; no reemplazan la copia independiente. Para medios, conservar objetos y una exportación de referencias/estado coherente con el punto recuperado de DB; validar fotos faltantes y huérfanas.

Runbook mínimo:

1. Detectar por monitor y guardar release/request/operation IDs; comparar conexión local con proveedor y DB. Dar un responsable único a la decisión de seguir operando manualmente.
2. Ante respuesta incierta, conservar clave/payload y consultar el registro antes de repetir un cobro o registrar otra venta. La cancelación de una petición no acredita rollback.
3. Si hay corrupción o migración fallida, detener o limitar escrituras según alcance, conservar evidencia y restaurar en un destino separado; evitar sobrescribir primero el único origen.
4. Comparar versión/hash de esquema, conteos, totales financieros, devoluciones, reservas, movimientos y referencias Blob. Preservar/conciliar operaciones posteriores al punto recuperado.
5. Cambiar destino solo después de esa verificación; registrar RPO/RTO reales y probar login/venta/caja/preparación/stock. Mantener comunicación al operador durante la contingencia.
6. Rollback de aplicación usando artefacto anterior solo si el esquema sigue siendo compatible. Para cambios incompatibles, plan explícito de corrección hacia adelante o recuperación; no prometer reversión automática de SQL ya confirmado.

## 12. Checklist de lanzamiento

| Control | Estado de esta auditoría | Evidencia o pendiente |
| --- | --- | --- |
| Alcance una sucursal, zona horaria y datos de negocio | Cumplido en la configuración leída | Una sucursal activa, zona argentina. Validar configuración operativa con responsable. |
| Autorización/aislamiento/decimales/idempotencia | Implementado; aceptación concurrente pendiente | Buenas protecciones de código y pruebas embebidas; falta intercalado real de POS/caja actual. |
| Tipos y lint | Cumplido | Comandos frescos con salida 0. |
| Gestor/lock e instalación limpia | Pendiente | A01; elegir gestor y verificar clean checkout. |
| Build productiva y smoke del mismo artefacto | Pendiente de cierre de verificación | No acreditar Next dev como producción. |
| Esquema reproducible y upgrade | Pendiente de release/procedimiento | A02: las 37 fuentes están identificadas en Git, pero solo 35 pertenecen a este journal; alinear el checkout elegido con despliegue/esquema y ensayar actualización. |
| Región/Node/plan/Fluid/límites Vercel | No verificado | Debe comprobarse en configuración efectiva de despliegue. No hay `vercel.json` ni `.vercel/project.json` en el checkout inspeccionado. |
| Neon producción, timeout/pool y cuotas | Parcial | Región/plan/tamaño/timeout leídos; A05 y política productiva pendientes. |
| Secretos, dominio y orígenes por entorno | Implementación parcial / despliegue no verificado | Validación en auth y cookies seguras existen. `.env` local no acredita valores de Vercel. |
| Separación DB/Blob dev-preview-prod | No verificado por completo | Ramas Neon diferenciadas existen; almacenes/credenciales y flujo de promoción requieren comprobación. |
| Caja activada y abierta antes de vender | Activación cumplida; apertura operativa pendiente | Snapshot sin caja abierta; es requisito de inicio de jornada, no error demostrado. |
| Inventario y recetas aptos para primer día | Pendiente operativo | Conciliar saldos, vencimientos, costos pendientes, precios/canales y producción con el negocio. |
| Cobros verificados por proveedor/alcance manual entendido | Registro manual implementado | Definir y ensayar comprobación externa/conciliación del dinero. |
| Health/readiness/alertas/logs/trazas | Pendiente en repositorio; proveedor no verificado | A03 y sección 10. Métricas de comandas no son métricas técnicas. |
| Backups y restauración independiente DB+Blob | No verificado | A04 y sección 11; demostrar recuperación, no solo creación de backup. |
| CI y promoción/rollback | No encontrado en archivos versionados; proveedor no verificado | Añadir control reproducible y documentar responsables/rollback compatible. |
| Navegador/tablet/red de Salta | No verificado | Medir sobre build productiva y dispositivos reales. |
| Contingencia de internet y operación incierta | Parcial | Existe recuperación en pestaña; falta procedimiento ensayado ante pérdida del dispositivo. |
| Varias sucursales | Fuera del lanzamiento inicial | Resolver A13 y medir locks antes de habilitar segunda. |

## 13. Plan de ejecución posterior

Los esfuerzos son orientativos para alguien que conoce el repositorio; no son un compromiso de plazo. Cada fase requiere su validación y revisión antes de modificar producción.

### Bloqueantes y continuidad: antes de operar como registro único

1. Elegir gestor, instalación limpia y pipeline de build/smoke; alinear la release elegida con los 37 pasos identificados y publicar upgrade/rollback. Entregable: checkout/artefacto/esquema trazables. Esfuerzo medio; riesgo alto en migraciones.
2. Validar concurrencia en PostgreSQL desechable con esquema actual: venta/cobro/cierre, última unidad, cancelación/preparación, misma clave y respuesta perdida. Resolver defects demostrados. Esfuerzo medio–alto.
3. Configurar presupuestos de espera y observabilidad mínima; probar fallo DB/pool y alertas. Esfuerzo medio, manteniendo reintentos idempotentes.
4. Definir plan/retención de producción y restaurar DB+medios en destino aislado. Acordar RPO/RTO y contingencia manual. Esfuerzo medio operativo.
5. Validar apertura de caja, datos iniciales, permisos y aceptación en tablet del local. Registrar explícitamente las integraciones que siguen siendo manuales.

### Velocidad: antes del lanzamiento si afectan la aceptación

6. Deduplicar fleet POS y lecturas ocultas, con visibilidad/cancelación/backoff. Esfuerzo bajo; medir ahorro en HAR y SQL.
7. Corregir N+1 de stock/lotes y compartir contexto/configuración de recetas. Esfuerzo medio; la prioridad de cada pantalla depende del uso en atención.
8. Mostrar primera página de carta y medir identidad/contexto de render; luego lazy loading selectivo según bundle y tablet. Esfuerzo medio.
9. Medir transacciones/locks con las cajas reales. Optimizar el tramo serializado con protocolo de locks preservado; incorporar índices solo cuando datos/planes lo justifiquen.

### Al crecer o al exigir disponibilidad superior

10. Antes de segunda sucursal: fijar scope de UI/operaciones y comprobar dos pestañas; estandarizar locks de publicación y guardas de archivo/caja. Mantener catálogo compartido y datos operativos aislados.
11. Con historial creciente: predicados y paginación real de tareas/saldos, retención de auditoría y selección de índices medida. No esperar a que una respuesta supere límites para acotar históricos.
12. Con evidencia de exceso de polling o necesidad de frescura: evaluar fanout de eventos/SSE. Con un RTO más exigente o simulacro fallido: cotizar y ensayar GCP HA/AWS; comparar costo humano y latencia real antes de migrar.

### Criterios de habilitación

Autorizar el lanzamiento cuando se pueda instalar, construir y desplegar el mismo artefacto; el esquema esté conciliado y tenga un upgrade reproducible; las pruebas críticas reales no dupliquen efectos; las esperas sean acotadas y recuperables; una alerta y una restauración se hayan ensayado; y la tablet/red del local cumpla los presupuestos acordados. Documentar cualquier excepción con responsable y contingencia. Una suite embebida verde, por sí sola, no satisface estos criterios.

### Cinco acciones con mayor valor según la evidencia

1. **Hacer reproducible el lanzamiento y alinear la release con el esquema vivo:** hay un migrador deshabilitado, lockfiles de paquetes divergentes y un checkout dos pasos por detrás de la base; las fuentes de esos pasos ya se identificaron y verificaron.
2. **Reducir viajes reales a PostgreSQL:** deduplicar fleet y agrupar stock/lotes/recetas; los conteos de 73/101/87 SELECT se reprodujeron con fixtures.
3. **Acotar y observar las fallas:** pool/locks/HTTP con presupuestos, errores redactados y correlación; conservar la misma identidad cuando el resultado sea incierto.
4. **Demostrar integridad bajo concurrencia y contingencia:** POS/caja/preparación en PostgreSQL real y respuesta perdida, incluyendo pérdida de pestaña/dispositivo.
5. **Conservar la infraestructura regional y probar recuperación:** verificar Vercel São Paulo, elegir capacidad/retención apropiadas para Neon y ensayar DB+Blob; migrar solo si una medición o requisito de disponibilidad lo justifica.

## 14. Fuentes externas y reproducción

Fuentes primarias consultadas al 12/11/2026; precios y términos pueden cambiar. Los enlaces acompañan las afirmaciones de plataforma y los supuestos de presupuesto, no reemplazan la cotización final de la cuenta.

- [Neon: precios](https://neon.com/pricing), [planes y cuotas](https://neon.com/docs/introduction/plans), [regiones](https://neon.com/docs/introduction/regions), [suspensión](https://neon.com/docs/introduction/scale-to-zero), [backup/restauración](https://neon.com/docs/guides/backup-restore), [alta disponibilidad](https://neon.com/docs/introduction/high-availability), [SLA](https://neon.com/docs/legal/sla).
- [Vercel: Pro](https://vercel.com/docs/plans/pro-plan), [región de funciones](https://vercel.com/docs/functions/configuring-functions/region), [tarifas São Paulo](https://vercel.com/docs/pricing/regional-pricing/gru1), [uso y precios de funciones](https://vercel.com/docs/functions/usage-and-pricing), [Observability Plus](https://vercel.com/docs/observability/observability-plus), [Blob SDK](https://vercel.com/docs/vercel-blob/using-blob-sdk), [uso comercial](https://vercel.com/docs/limits/fair-use-guidelines).
- [Google Cloud: regiones Cloud Run](https://docs.cloud.google.com/run/docs/locations), [instancias mínimas](https://docs.cloud.google.com/run/docs/configuring/min-instances), [Cloud Run precios](https://cloud.google.com/run/pricing), [Cloud SQL precios](https://cloud.google.com/sql/pricing), [Cloud SQL HA](https://docs.cloud.google.com/sql/docs/postgres/high-availability), [Load Balancing precios](https://cloud.google.com/load-balancing/pricing).
- [AWS: Fargate regiones](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/AWS_Fargate-Regions.html), [balance entre AZ](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/service-rebalancing.html), [RDS Multi-AZ](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/Concepts.MultiAZSingleStandby.html), [Fargate precios](https://aws.amazon.com/fargate/pricing/), [RDS precios](https://aws.amazon.com/rds/postgresql/pricing/), [ALB precios](https://aws.amazon.com/elasticloadbalancing/pricing/), [VPC/NAT/IP precios](https://aws.amazon.com/vpc/pricing/).
- [Render regiones](https://render.com/docs/regions), [Railway regiones](https://docs.railway.com/deployments/regions), [Vultr São Paulo](https://blogs.vultr.com/Ol-Brasil-Vultrs-20th-Cloud-Location-is-in-So-Paulo), [costo de backups automáticos](https://docs.vultr.com/support/platform/billing/how-much-does-it-cost-to-enable-automatic-backups).

Reproducción mínima de lecturas de código/mediciones locales:

```powershell
# No usar la URL productiva para pruebas o fixtures.
$env:DATABASE_URL = ''
$env:KYBO_LOCAL_DB = ''
$env:KYBO_TEST_DATABASE_URL = ''
$env:KYBO_ALLOW_TEST_MIGRATIONS = 'disposable-only'
$env:NODE_ENV = 'test'
node node_modules/typescript/bin/tsc --noEmit --incremental false
node node_modules/eslint/bin/eslint.js .
node node_modules/vitest/vitest.mjs run
# Selección crítica aprobada en esta auditoría (44 pruebas en seis archivos):
node node_modules/vitest/vitest.mjs run tests/cash-register.integration.test.ts tests/cash-sales.integration.test.ts tests/preparation-performance.integration.test.ts tests/pos-order-entry.integration.test.ts tests/stock-tracking.integration.test.ts tests/pos-request-cache.test.ts --pool=threads --maxWorkers=1
# Crear el harness del apéndice 15 en esta ruta temporal antes de ejecutarlo:
node --import tsx tmp/production-audit-20261112/service-profile.mjs
```

Los diagnósticos Neon se realizaron mediante el conector autenticado y el endpoint vinculado: configuración, `table-sizes`, `locks`, intento de `outliers`, conteos, migraciones/índices y planes estimados. Su duración incluye transporte del conector y no se usó como RTT de aplicación. No se alcanzó acceso TCP desde el executor; queda pendiente una prueba desde la misma región de cómputo y desde la red real de Salta.


## 15. Harness de medición conservado para reproducción

Copiar este bloque a `tmp/production-audit-20261112/service-profile.mjs` y ejecutar con las variables aisladas indicadas en la sección 14. No requiere datos ni credenciales del local. Crea y destruye únicamente un PGlite en memoria; el JSON de resultados se escribe en `tmp/`. Mantener el mismo commit y dependencias para comparar conteos.

```javascript
import fs from 'node:fs';
import path from 'node:path';
import { drizzle } from 'drizzle-orm/pglite';
import { createDataModelTestContext } from '../../tests/helpers/data-model-database.ts';
import * as s from '../../src/db/schema.ts';
import { stockByBranch, lotsByBranch } from '../../src/modules/inventory/scoped-queries.ts';
import { createRecipeService } from '../../src/modules/recipes/service.ts';
import { createSalesService } from '../../src/modules/sales/service.ts';
import { createPickupService } from '../../src/modules/pickup/service.ts';
const directory=path.dirname(new URL(import.meta.url).pathname.replace(/^\/(\w:)/,'$1'));
const results={observedAt:new Date().toISOString(),environment:'PGlite synthetic in-memory; source services; no HTTP/auth/browser; concurrent build may affect wall time',measurements:[]};
let c;
try{
 c=await createDataModelTestContext({attendanceAccess:true,passwordPolicy:true});
 const actor={id:'audit-synthetic',role:'admin',catalogManager:true,branchId:c.mapping.initialBranch.id,accountKind:'personal'};
 await c.db.insert(s.user).values({id:actor.id,name:'Audit fixture',email:'audit@example.invalid'});
 await c.db.insert(s.operationalUsers).values({userId:actor.id,role:'admin',catalogManager:true});
 const items=await c.db.insert(s.items).values(Array.from({length:70},(_,i)=>({code:'AUDIT-'+i,name:'Audit item '+String(i).padStart(3,'0'),class:'food',baseUnit:'unit',purchasable:true,recipeUsable:true,unitCost:'10'}))).returning();
 const lots=await c.db.insert(s.inventoryLots).values(Array.from({length:99},()=>({itemId:items[0].id,receivedOn:'2026-11-01',initialQuantity:'1',remainingQuantity:'1'}))).returning();
 await c.db.insert(s.lotLocationBalances).values(lots.map(l=>({lotId:l.id,locationId:c.mapping.initialLocation.id,branchId:actor.branchId,quantity:'1'})));
 const products=await c.db.insert(s.products).values(Array.from({length:51},(_,i)=>({name:'Audit product '+String(i).padStart(3,'0'),vatRate:'0'}))).returning();
 await c.db.insert(s.branchProducts).values(products.map(p=>({branchId:actor.branchId,productId:p.id,enabled:true})));
 await c.db.insert(s.productPrices).values(products.map(p=>({productId:p.id,channel:'counter',amount:'100'})));
 for(const p of products.slice(0,10)){
  const[r]=await c.db.insert(s.recipes).values({kind:'product',productId:p.id}).returning();
  const[v]=await c.db.insert(s.recipeVersions).values({recipeId:r.id,version:1,compositionModel:'configurable',outputName:p.name,outputUnit:'unit',yieldQuantity:'1',actorId:actor.id}).returning();
  const[line]=await c.db.insert(s.recipeLines).values({versionId:v.id,position:0}).returning();
  await c.db.insert(s.recipeOptions).values({lineId:line.id,position:0,itemId:items[0].id,itemName:items[0].name,baseUnit:'unit',quantity:'1'});
 }
 const queries=[];const db=drizzle({client:c.client,schema:s,logger:{logQuery(q){queries.push(q);}}});
 const ctx={actorId:actor.id,role:'admin',branchId:actor.branchId,timeZone:'America/Argentina/Salta',accountKind:'personal'};
 async function measure(name,run,n=3){const samples=[];for(let i=0;i<n;i++){queries.length=0;const t=performance.now();const result=await run();samples.push({ms:Math.round(performance.now()-t),statements:queries.length,selects:queries.filter(q=>/^\s*(select|with)\b/i.test(q)).length,rows:result.rows?.length??result.occupied?.length??null,total:result.total??null});}results.measurements.push({name,samples});console.log('MEASURED '+name+' '+JSON.stringify(samples));}
 await measure('stock_71_items',()=>stockByBranch(db,ctx,'',new Date('2026-11-12T15:00:00Z')));
 await measure('lots_99_entries',()=>lotsByBranch(db,ctx,items[0].id,0,new Date('2026-11-12T15:00:00Z')));
 await measure('recipe_list_10_configurable',()=>createRecipeService(db).list(actor,'product'));
 await measure('products_page_30_of_51',()=>createSalesService(db).lookup(actor,'products','','counter','',0));
 await measure('products_page_21_of_51',()=>createSalesService(db).lookup(actor,'products','','counter','',30));
 await measure('locator_fleet_empty',()=>createPickupService(db).fleet(actor));
 results.dataset={items:71,products:51,configurableRecipes:10,lots:100,locations:1,branches:1};
}catch(e){results.error={name:e.name,code:e.cause?.code??e.code,message:String(e.message).slice(0,700)};console.log('PROFILE_ERROR '+JSON.stringify(results.error));process.exitCode=1;}finally{await c?.close();fs.writeFileSync(path.join(process.cwd(),'tmp/production-audit-20261112/service-profile.json'),JSON.stringify(results,null,2));console.log('PROFILE_COMPLETE');}

```
