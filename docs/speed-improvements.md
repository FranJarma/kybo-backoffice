# Mejoras de velocidad de Kybo

Actualizado: 2026-11-20. Base del checkout: `2b283401c7b9ce515c9a278ed5fb795010d8a0e8`. Etapa activa: mejorar el rendimiento de la aplicación y verificar su comportamiento. Este documento continúa `production-readiness-audit.md` y registra los cambios de velocidad ya implementados, sus mediciones y los siguientes pasos. Las alternativas de alojamiento se documentan por separado en [deploy-alternatives.md](deploy-alternatives.md).

## Prioridad y estado

La primera etapa es rendimiento sobre la arquitectura actual. Las optimizaciones de stock, lotes, recetas y POS ya están aplicadas en el código del checkout; todavía requieren validación de build y medición en un entorno remoto representativo antes de promoverlas a producción.

| Trabajo | Estado | Evidencia |
| --- | --- | --- |
| Agrupar consultas de stock y lotes | Implementado | 73 a 3 SELECT para stock y 101 a 2 para lotes en la fixture comparable. |
| Reutilizar configuración y cálculo de costos de recetas | Implementado | 87 a 19 SELECT el 19/11 y a 17 el 20/11 en diez recetas simples; costos y permisos cubiertos por regresiones. |
| Compartir localizadores y evitar polling innecesario | Implementado | Una solicitud inicial por POS, también al abrir el diálogo; pausa oculto/offline y recuperación acotada. |
| Mostrar la primera página de la carta sin esperar las restantes | Implementado | Prueba de Chrome con la segunda página pendiente, uso del producto, error y reintento. |
| Evitar reinicios simultáneos de la lectura de comandas | Implementado el 20/11 | En Chrome, foco + visibilidad + online durante una lectura generan un solo intento de fetch, frente a cuatro intentos y tres aborts antes. |
| Recuperar assertions dependientes del reloj/contrato | Corregido el 20/11 | Los 28 tests de asistencia programada y validación pasan; siguen pendientes las fixtures legacy y PostgreSQL exclusivo. |
| Validar build de producción y respuesta desde Salta | Pendiente | Build local bloqueada por EPERM; no hay medición remota ni percentiles de producción. |

Los cambios de alojamiento y el traslado de PostgreSQL son una etapa posterior. No forman parte del trabajo activo de velocidad.

## Implementación adicional del 20/11

Esta etapa modificó código de aplicación; la separación de informes del 19/11 no se considera una optimización nueva. Se conservaron las mejoras anteriores y todos los cambios locales existentes.

### Recetas: quitar lecturas redundantes

`src/modules/recipes/service.ts:204` conserva la interfaz pública de `costContext(db, branchId?)`. Un cargador interno permite que la lista reutilice el grafo completo ya leído dentro de su transacción read-only/repeatable-read (`:807`), filtrando sólo preparaciones para estimar costos recursivos. Así evita volver a consultar preparaciones, incluso cuando las necesita fuera de la página mostrada. El cálculo de composición usado por esta lista no tiene canal ni utiliza recargos; por eso deja de leer sus precios de modificadores (`:847`). Los endpoints de configuración y confirmación de ventas mantienen sus validaciones y precios.

Cuando la búsqueda o el offset no producen filas, `src/modules/recipes/service.ts:805` devuelve las filas vacías y el total después de autorizar al usuario/sucursal y consultar la página/conteo. No carga ni calcula costos de recetas que no va a mostrar.

| Escenario | Antes del cambio del 20/11 | Después | Evidencia |
| --- | ---: | ---: | --- |
| Lista de 10 recetas simples, fixture original de auditoría | 19 SELECT | 17 SELECT | Tres repeticiones del mismo harness. |
| Lista de 1 / 10 / 40 recetas configurables con modificadores | 20 / 20 / 20 SELECT | 17 / 17 / 17 SELECT | Prueba PGlite con costos literales y recargos no nulos. |
| Búsqueda sin resultados | 14 SELECT | 8 SELECT | RED observado y luego GREEN; respuesta `{ rows: [], total: 0 }`. |
| Offset 100 sobre 40 recetas | No se midió separadamente antes | 8 SELECT | Retorna filas vacías conservando total 40; prueba de permisos también cubre búsqueda vacía. |

Los costos literales siguen siendo 45.000000 para sucursal A, 112.500000 para B y 157.500000 en contexto compartido; también se verifica que cambiar la valuación se refleje en la siguiente solicitud y que un costo pendiente siga siendo `null`. No hay caché global ni cambios de importes, locks o idempotencia.

### Preparación: conservar la solicitud que ya está en curso

`src/components/preparation/use-feed.ts:24` evita que eventos simultáneos de foco, visibilidad y online aborten y reinicien un fetch activo. Al finalizar libera el controlador sólo si todavía es el actual (`:63`). El reemplazo explícito por revisión/URL y la limpieza al desmontar mantienen la cancelación; se conservan el timeout de 9 s, el polling de 5 s y el límite de frescura de 15 s.

La prueba nueva usa React, el hook real y Chrome contra un servidor HTTP de localhost con respuesta retenida. Antes se observaron cuatro intentos de fetch y tres aborts; después, uno que llega a completarse. Tras completar una lectura, un nuevo grupo de eventos puede iniciar la siguiente. Esto mide intentos del navegador, no demuestra que los cuatro intentos anteriores hubieran llegado a PostgreSQL ni cuantifica latencia de producción.

También se verifica cancelación al cambiar revisión, actualización al cambiar URL y rechazo de la respuesta de la lectura cancelada. Cobertura menor pendiente señalada por revisión: mantener una petición retenida durante el cambio de URL y ejercitar offline→online antes de que termine el rechazo anterior. No se presenta la revisión estática de esa carrera como una prueba ejecutada.

### Señal de verificación y límites

Las tres assertions previamente fallidas se reprodujeron antes de corregirlas: dos consultaban eventos del 29/10 con el filtro implícito del día actual; la otra omitía en su expectativa el `stockTracked: true` que ya devuelve el parser. Se agregaron fechas explícitas a esas consultas de prueba y se actualizó la expectativa del contrato, preservando las assertions de eventos inmutables, correcciones y costo desconocido. No se modificó comportamiento de producción de asistencia o validación.

- Pruebas focales iniciales: 35/35 en cuatro archivos, 25.19 s, incluidos los dos casos de Chrome. Las assertions nuevas de presupuestos y la deduplicación se observaron primero fallando.
- ESLint completo, excluyendo temporales ignorados: aprobado.
- Revisión independiente: sin Critical/Important; se conserva la ampliación de cobertura de reconexión indicada arriba como pendiente menor.
- Un nuevo intento de build con `experimental.webpackBuildWorker: false` también falló por `EPERM`, esta vez creando `.next-e2e/speed-20261120/server/app/api/cash`. Se restauraron `next.config.ts`, `next-env.d.ts` y `tsconfig.json` byte por byte. La hipótesis del worker no resolvió el problema; no se validó una build de producción.
- TypeScript completo: aprobado. El primer intento incluyó por error la copia temporal de `next.config.ts`; se cambió sólo la extensión de esa copia a `.txt` y el chequeo completo pasó. La configuración de TypeScript de la aplicación se conserva.
- Suite completa del 20/11: 198 archivos, 188 aprobados, 9 con error de setup y 1 omitido; 1079 pruebas, 994 aprobadas, 85 omitidas y ninguna assertion fallida. Duración 1021.45 s. Los ocho archivos de fixtures legacy conservan el guard de transición; `data-model.concurrency.test.ts` requiere PostgreSQL exclusivo. Las tres pruebas de `modifiers-concurrency.test.ts` se omiten por el mismo acceso faltante. El comando global sigue saliendo con error y no se presenta como una suite verde.

Perfil crudo de servicios: `performance/service-profile-2026-11-20.json`. Resumen de verificación y nombres de todas las pruebas que no se ejecutaron: `performance/verification-2026-11-20.json`. Sigue usando PGlite en memoria y tres muestras por lectura, con otras verificaciones locales en paralelo. El resultado comparable es la cantidad de consultas; sus tiempos no se usan para prometer una mejora remota o publicar percentiles.

## Resultado comprobado del 19/11 (histórico)

Se eliminaron consultas por fila en inventario y recetas. El POS comparte la consulta de localizadores y permite usar la primera página de la carta mientras completa las restantes. Se conservaron cálculos decimales, validaciones y límites por sucursal; no se quitaron locks ni transacciones de escritura y no se agregó una caché financiera.

Se repitió el harness de la sección 15 de la auditoría con el mismo dataset y llamadas a servicios: PGlite en memoria, una sucursal/ubicación, 71 insumos, 100 lotes (99 del insumo consultado), 51 productos y 10 recetas configurables simples. Tres repeticiones secuenciales por operación, armado del dataset fuera del cronómetro. El logger Drizzle cuenta SELECT y WITH; no cuenta protocolos de conexión ni autenticación HTTP. Windows x64, Node 24.21.0, Next.js 16.3.6, Drizzle 0.45.3, PGlite 0.5.8. No se accedió a PostgreSQL remoto.

| Operación, mismo fixture | SELECT antes, auditoría del 12/11 | SELECT después, 19/11 | Muestras después, tiempo local ms |
| --- | ---: | ---: | --- |
| Stock, 71 insumos | 73 | 3 | 53 / 19 / 18 |
| Lotes, 99 filas | 101 | 2 | 19 / 15 / 15 |
| Lista de recetas, 10 configurables simples | 87 | 19 | 53 / 32 / 33 |
| Productos, primera página de 30 | 5 | 5 | 19 / 15 / 15 |
| Productos, segunda página de 21 | 5 | 5 | 15 / 14 / 13 |
| Localizadores vacíos, una llamada al servicio | 4 | 4 | 7 / 5 / 6 |

Los conteos son el resultado principal. Los tiempos son observaciones locales de tres ejecuciones, no CPU, latencia HTTP, mediciones desde Argentina ni percentiles confiables. No se traducen a porcentajes de mejora en producción. Resultados crudos sanitizados: `performance/service-profile-2026-11-19.json`; fixture/harness reproducible en el apéndice 15 de la auditoría, cambiando sólo el destino del JSON al repetir.

Además se ejecutaron fixtures nuevos, con pruebas observadas fallando antes del cambio y pasando después:

| Escala del fixture de regresión | Antes | Después |
| --- | --- | --- |
| Stock: 1 / 6 / 100 insumos | 3 / 8 / 102 SELECT | 3 / 3 / 3 SELECT |
| Lotes: 1 / 9 ubicaciones | 3 / 11 SELECT | 2 / 2 SELECT |
| Páginas de lotes: 100 / 2 / 0 filas | 102 / 4 / 2 SELECT | 2 / 2 / 2 SELECT |
| Recetas configurables con modificadores: 1 / 10 / 40 | 26 / 134 / 494 SELECT | 20 / 20 / 20 SELECT |
| HTTP inicial de localizadores: POS normal / diálogo abierto | 2 / 3 | 1 / 1 |

La fixture de recetas con modificadores incluye más lecturas que la fixture simple de la auditoría; no son dos mediciones del mismo caso. Las pruebas usan presupuestos máximos, no obligan a conservar consultas si pueden reducirse más adelante.

## Cambios y garantías

| Cambio | Problema y solución | Validación y límite |
| --- | --- | --- |
| `src/modules/inventory/scoped-queries.ts` | `stockByBranch` consultaba saldos/lotes una vez por insumo. Ahora consulta una vez los IDs de la página y agrupa en memoria. `lotsByBranch` ya obtiene los datos de detalle en su JOIN y no reconsulta cada fila. | Siete pruebas PGlite: vencimiento inclusivo en fecha local, reservas, bloques de lote/ubicación, múltiples sucursales/ubicaciones, nulos/cero/ausencia de valuación, precisión de seis decimales, orden, búsqueda y páginas. Mantiene snapshot read-only repeatable-read de stock y comportamiento del detalle. Los saldos de la página se mantienen juntos en memoria; un historial grande puede justificar agregación SQL posterior. |
| `src/modules/recipes/service.ts` y `costing.ts` | Cada receta configurable reconstruía configuración/contexto de costos. La lista usa `catalog/cost-configurations.ts` existente por lote y reutiliza su estimador dentro de la misma transacción. `costComposition` conserva su interfaz. | Cuatro pruebas reales: costos literales derivados manualmente, herencia/override, factores/cantidades/merma, instrucciones, alternativas legacy, preparaciones, componentes archivados o con unidad cambiada, costos pendientes, permisos/sucursal y actualización entre solicitudes. No hay caché entre solicitudes ni réplicas. |
| `src/components/pickup/locator-fleet-context.tsx`, `use-locators.ts`, `sales-manager.tsx` | `PickupActions` y el diálogo repetían la consulta que ya tenía `SalesManager`. Un provider por POS distribuye el resultado/error existente. | React real en Chrome verifica una solicitud al montar y ninguna adicional al abrir el diálogo. El administrador usado independientemente consulta su propia sucursal. Sin estado global compartido entre sesiones o sucursales. Las mutaciones del POS propagan `onChanged` al propietario. |
| `src/components/pickup/locator-polling.ts` | Peticiones que se solapaban y seguían trabajando con pestañas ocultas. Un recurso mantiene una solicitud activa; cancela al desmontar, pausa oculto/offline y refresca al volver. Timeout 15 s y backoff hasta 30 s tras errores. | Pruebas del límite HTTP con cancelación, visibilidad, recuperación y temporizadores controlados. Sigue siendo polling; no se agregan SSE/WebSockets. Cadencia nominal: 5 s después de completar cada consulta sana. |
| `src/components/sales/cart.tsx` y `catalogue-loader.ts` | El POS esperaba todas las páginas antes de mostrar productos. Ahora publica cada página, mantiene búsqueda local y muestra si falta completar la carta. Un error tardío conserva lo cargado y el reintento continúa en el offset fallido. Si cambia el total, descarta el parcial y reinicia desde cero una vez por intento; otro cambio deja un error recuperable. | Chrome real verifica botón utilizable con página 2 pendiente, conservación ante 503, reintento de offsets `[0,1,1]` y búsqueda local final con acentos. Pruebas de recurso cubren abort/stale guard, búsqueda completa, página vacía y cambio de total con reinicios acotados. Concurrencia de carga: una página por vez. |
| `src/components/inventory/shared.tsx` | `getJson` no permitía cancelar. Se agrega un segundo argumento opcional con `signal`; se preservan headers de sucursal, no-store, errores y llamadas con un argumento. | Pruebas anteriores y nuevas usan el mismo límite HTTP; no modifica POST ni reintentos de operaciones de negocio. |

Con intervalo nominal de 5 s, una pestaña POS activa pasa de aproximadamente 24 a 12 solicitudes/minuto de fleet; al mantener abierto el diálogo, de 36 a 12. Fórmula para D dispositivos con T pestañas activas por dispositivo: `D × T × 12` solicitudes/minuto nuevas, frente a `D × T × 24` en el caso normal anterior. No incluye consulta inicial, refresh por acciones, latencia, backoff ni otras pantallas. Por ejemplo, cuatro pestañas activas pasan de 96 a 48 solicitudes/minuto de ese endpoint. Cada llamada conserva sus validaciones de autorización y base; no se eliminó trabajo necesario para confirmar ventas.

## Verificación y límites

| Verificación | Resultado |
| --- | --- |
| Revalidación focal al separar los documentos, 2026-11-19 | 12 archivos y 69/69 pruebas aprobadas, 91.66 s. Incluye inventario, recetas, ventas, caja, preparación, recursos de POS y Chrome real. Esta ejecución no repitió la suite completa ni la build; sus resultados históricos se conservan abajo. |
| 8 archivos críticos: nuevos inventario/recetas y regresiones de ventas/caja/preparación/stock/cache POS | 55/55 pruebas, 56.30 s. |
| 6 archivos focales de POS/pickup/touch, incluyendo Chrome real | 30/30 pruebas iniciales. Después de la revisión: 8/8 de recurso de catálogo + Chrome, incluyendo los dos nuevos casos de cambio de total. Se vuelve a incluir en la suite completa. |
| TypeScript completo, sin emisión/incremental | Correcto; repetido correctamente tras el ajuste de revisión. |
| ESLint sobre repositorio, excluyendo sólo temporales ignorados `tmp/**` | Correcto; los dos archivos ajustados tras revisión también pasan ESLint. |
| Suite completa original del 19/11, threads y un worker | 197 archivos: 184 aprobados, 11 fallidos y 2 omitidos; 1076 pruebas: 987 aprobadas, 3 fallidas y 86 omitidas. Duración 886.44 s. Los 6 archivos nuevos y sus 25 pruebas pasan, incluidos Chrome y los dos casos añadidos tras revisión. Las fallas se detallan abajo y se reprodujeron en HEAD. Las tres assertions se corrigieron el 20/11; no se sobrescriben estas cifras históricas. |
| Caché de fotos en Chrome, prueba existente omitida por falta de variable en la suite | Se repitió con `E2E_BROWSER_PATH` apuntando al Chrome instalado: 1/1 aprobada, 10.24 s. |
| Build Next de producción/standalone con Webpack, salida aislada | Dos intentos fallaron por `EPERM` creando carpetas de tipos: `app/api/settings/users` y `app/api/finance`. Preparar previamente los directorios de salida no resolvió la restricción. Es el mismo tipo de fallo de filesystem que en la auditoría; no equivale a una build validada ni permite atribuir el fallo a esta lógica de aplicación. |
| Preservación de archivos generados | `next-env.d.ts` y `tsconfig.json` restaurados y comparados por hash con su estado previo a la build; se conserva el cambio local preexistente en `next-env.d.ts`. |
| Revisión independiente | Completada; halló el reintento atascado cuando disminuía el total del catálogo. Corregido con dos pruebas RED/GREEN y revalidado por el revisor, sin bloqueantes restantes. |

Las pruebas de navegador aíslan las rutas de datos en un servidor HTTP de localhost y usan React/componentes reales; no ejecutan Next.js completo, estilos, login, PostgreSQL remoto o métricas de tablets. Usan Chrome instalado o `E2E_BROWSER_PATH`; sin navegador disponible se omiten explícitamente. El runner E2E global sigue necesitando resolver la migración genérica deshabilitada, como documenta la auditoría.

La revisión dejó dos ampliaciones opcionales de cobertura: cambiar `channel`/`refresh` en el componente real con una solicitud anterior pendiente, y timeout del catálogo seguido de retry. El recurso sí prueba cancelación/resultado tardío, y el polling de localizadores prueba timeout/recuperación; no se presentan como cobertura equivalente del componente completo. La paginación del API sigue usando offset: cambios que mantengan el mismo total entre páginas pueden alterar sus filas; no se introdujo una nueva garantía de snapshot entre solicitudes HTTP.

### Fallas de base reproducidas sin estos cambios

Se exportó una copia de HEAD con `git archive`, sin mover HEAD ni tocar los cambios locales, y se ejecutaron los archivos afectados con el mismo entorno aislado. Primera ejecución: 9 archivos fallidos, 9 pruebas aprobadas, 2 fallidas y 80 sin ejecutar por error de setup; duración 77.24 s. Segunda ejecución, validación y concurrencia: 2 archivos fallidos, 16 pruebas aprobadas, 1 fallida y 2 sin ejecutar por falta de PostgreSQL exclusivo; 6.07 s. Los once archivos afectados reproducen su resultado sin estas optimizaciones. No se presenta la suite completa como verde.

| Archivo/caso | Evidencia y causa | Siguiente corrección independiente |
| --- | --- | --- |
| `tests/catalog.test.ts`, `tests/inventory.test.ts`, `tests/modifiers-schema.test.ts`, `tests/modifiers.test.ts`, `tests/preparation.test.ts`, `tests/production.test.ts`, `tests/recipes.test.ts`, `tests/sales.test.ts` | El setup usa `tests/helpers/database.ts`, que intenta migrar todo el journal sin el mapeo de transición. La finalización del modelo lo rechaza con `Explicit transition mapping must be applied before finalization`. Sus 80 pruebas no llegan a ejecutarse. | Adaptar las fixtures legacy al procedimiento explícito de transición y conservar sus assertions de negocio. No eliminar el guard ni modificar migraciones para hacer pasar el setup. |
| `tests/attendance-scheduling.integration.test.ts`: `preserves original punches and requires a reason for correction approval/rejection` | `snapshot.events[0]` era `undefined` al consultar sin fechas eventos del 2026-10-29. Reproducido en HEAD el 19/11 y nuevamente el 20/11. | Resuelto el 20/11: período explícito en la fixture, respetando el contrato de consulta por fecha y conservando las assertions de corrección/eventos inmutables. |
| Mismo archivo: `links an unplanned entry to its assigned shift without altering the original punch` | El mismo problema de fecha producía lectura de `assignmentId` sobre `undefined`. Reproducido en HEAD. | Resuelto el 20/11: consulta temporal explícita, sin alterar el filtro de producción ni la assertion del evento original. |
| `tests/validation.test.ts`: `strict catalog inputs > stores an unknown item cost as null` | La expectativa no incluía `stockTracked: true`, que el parser existente agrega por defecto. El costo permanece `null`. Mismo fallo en HEAD. | Resuelto el 20/11: expectativa con el campo intencional, conservando la assertion de costo desconocido y el parser existente. |
| `tests/data-model.concurrency.test.ts` | Falla el setup con `Falta KYBO_TEST_DATABASE_URL; no se usa DATABASE_URL como alternativa.` Las dos pruebas requieren un PostgreSQL exclusivo vacío con nombre `kybo_test_*`. Se mantuvo vacía esa variable para impedir cualquier escritura remota. Mismo resultado en HEAD. | Provisionar una base de prueba exclusiva y autorizada; comprobar el destino y correr estas pruebas sin usar la base del local. Es una medición pendiente, no un defecto demostrado por esta ejecución. |

Las tres pruebas de `tests/modifiers-concurrency.test.ts` también se omitieron explícitamente por falta de `KYBO_TEST_DATABASE_URL`; se mantienen pendientes. La omisión de una prueba de `tests/product-photo-browser.test.ts` por falta de `E2E_BROWSER_PATH` se resolvió ejecutándola por separado con Chrome instalado (aprobada). Estas cuatro omisiones más las 80 de fixtures legacy y las dos del setup PostgreSQL explican las 86 de la suite completa.

La copia se mantuvo en un directorio temporal de caché, sin `.env` ni datos del local; las únicas escrituras de base fueron PGlite desechables. El segundo typecheck completo también pasó. Los registros detallados están en `tmp/optimization-root/baseline-tests.{json,log}` y `baseline-extra-tests.{json,log}`; el resumen sanitizado permanente de las ejecuciones y nombres de pruebas está en `performance/verification-2026-11-19.json`.

### Comandos reproducibles

```powershell
$env:NODE_ENV = 'test'
$env:DATABASE_URL = ''
$env:KYBO_LOCAL_DB = ''
$env:KYBO_TEST_DATABASE_URL = ''
$env:KYBO_ALLOW_TEST_MIGRATIONS = 'disposable-only'
$taskTemp = Join-Path (Get-Location) 'tmp/optimization-root/runtime'
New-Item -ItemType Directory -Force $taskTemp | Out-Null
$env:TEMP = $taskTemp
$env:TMP = $taskTemp
$env:TMPDIR = $taskTemp
node node_modules/vitest/vitest.mjs run --pool=threads --maxWorkers=1
node node_modules/typescript/bin/tsc --noEmit --incremental false
node node_modules/eslint/bin/eslint.js . --ignore-pattern 'tmp/**'
```

Se usó un directorio temporal estable para evitar el problema de caché SSR temporal del runner Windows observado en la auditoría. Los archivos JSON/log de ejecución se conservan en `tmp/optimization-root/`; los resultados y el perfil de servicios quedan documentados aquí y en `performance/`. Para una build local usar salida aislada y restaurar los archivos generados: el intento ejecutó `KYBO_STANDALONE=1`, `E2E_MANAGED=1`, `E2E_BUILD_DIR=.next-e2e/optimization-20261119`, `NEXT_TELEMETRY_DISABLED=1`, URLs/secretos de aplicación vacíos y `node node_modules/next/dist/bin/next build --webpack`. No se usaron credenciales de producción para probar consultas.

## Siguientes pasos de rendimiento

1. Completar una build de producción en un entorno con permisos adecuados. Los resultados de PGlite y desarrollo no reemplazan una prueba de la aplicación compilada.
2. Medir desde la conexión y tablets del local en Salta con dataset y concurrencia representativos: pantalla operable, primer producto utilizable, confirmación de pedido/cobro y actualización de comandas. Separar solicitudes frías/calientes; registrar muestras suficientes antes de publicar percentiles.
3. Instrumentar cantidad y tiempo de consultas, espera de pool, locks y duración de transacciones por flujo en staging. Usar esas mediciones para elegir la siguiente optimización de SQL, índices, autenticación/contexto o caché; no introducir cambios por suposición.
4. Ensayar dos cajas, reenvío tras respuesta perdida y preparación/stock/cierre en PostgreSQL exclusivo. Conservar atomicidad, importes exactos, revisiones, idempotencia y permisos por sucursal. PGlite no valida latencia de red, pooling ni concurrencia de PostgreSQL remoto.
5. Adaptar por separado las ocho fixtures legacy al mapeo explícito de transición para recuperar la cobertura que todavía no llega a ejecutarse. Las tres assertions de reloj/contrato ya se corrigieron el 20/11; no debilitar los guards ni las assertions de negocio para obtener un estado verde.

Para una sucursal se mantiene la arquitectura existente. Al sumar dispositivos o sucursales, ampliar capacidad u optimizar agregaciones sólo cuando el presupuesto de latencia, la espera del pool/locks o el consumo de recursos lo justifiquen. Las garantías de integridad no se postergan por el tamaño del local.

La preparación de contenedores, regiones, costos, backups/restauración y alternativas de despliegue continúa en [deploy-alternatives.md](deploy-alternatives.md).
