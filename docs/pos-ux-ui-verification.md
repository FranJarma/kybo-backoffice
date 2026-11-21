# Verificación de la mejora POS

Base: `b5946319f0f875854d52a981338157aea3368981`. Rama: `feature/ux-ui-pos-improvements`. Entorno: Windows, Node 24.21.0; pnpm disponible 9.15.1 (el manifest declara 10.33.2), instalación offline con lockfile congelado y node-linker hoisted porque la sesión no permite junctions. No cambió package.json ni pnpm-lock.yaml.

## Baseline antes de editar la aplicación

| Verificación | Resultado observado |
| --- | --- |
| Unit/integration POS, caché, configuración, pedido, localizadores y caja | 8 archivos, 50 casos pasaron, PGlite descartable |
| pnpm lint | Pasó |
| pnpm typecheck | Pasó |
| pnpm build | Falló en Turbopack al crear el proceso Node de PostCSS: salió antes de conectar; referencia a production.module.css fuera del POS. Se inició antes de modificar app; no se considera build aprobado ni medición de bundle de producción. |
| Browser aislado, 1280×800 / 768×1024 / 390×844 | 3 casos de captura pasaron con APIs interceptadas. En móvil se registró expresamente una falla preexistente de líneas del carrito con altura cero; no se contó como flujo funcional aprobado. |

El fixture carga SalesManager y sus componentes reales, usa datos ilustrativos exclusivamente de tests e intercepta toda la red. No registra ventas reales. El bundle congelado y las capturas iniciales quedan en el workspace de la ejecución.

## Task 2: catálogo

- RED: presentación nueva ausente; tests del adaptador y tarjeta fijaron identidad, disponibilidad, precio formateado, foto persistente y cantidad.
- GREEN de presentación: 7 casos. El gate unit integrado inicial: 4 archivos / 32 casos; se ampliaron además las caracterizaciones del loader y límite de caché, sin cambiar esos módulos.
- Gate browser: `playwright test tests/e2e/pos-surface.spec.ts --grep "catalogue uses one responsive grid"`: 1 caso pasó. Verifica 3/2/1 columnas a 1280/768/390, también 360/320, una grilla, sin overflow horizontal, cantidad 1→2 real y ningún lookup/config adicional por filtros o resize.
- Baseline de requests por recorrido: 1 catálogo, 9 configuraciones precargadas, 1 consulta de localizadores. El bundle de fixture con profiling pesa 2.771.954 bytes; no es el bundle optimizado de Next.
- Pendiente: flujo completo en móvil, build final y comparación final de rendimiento; no se atribuyen mejoras de latencia de producción a respuestas simuladas.

## Task 2 fix round 1

El gate aislado ampliado pasó 4/4 casos y los unitarios 34/34. Verifica resize con pedido de dos unidades, total y contadores en cada breakpoint, reapertura de configuración, teclado/foco sin recorte a 390×1024, categoría vacía, nombre largo y fallback. Se conservó thumbnail128 del catálogo previo. El foco a 390×844 sigue ligado al defecto de espacio del pedido que se corrige en Task4.

`pnpm build --webpack` pasó completo, con TypeScript y todas las rutas. El primer intento del runner E2E managed con fallback Webpack se detuvo antes del servidor porque scripts/migrate.ts deshabilita la migración genérica durante la transición del modelo de datos. No se modificó ni se anuló ese bloqueo. La ejecución real de /sales requiere el bootstrap descartable revisado del repositorio; permanece pendiente, no aprobada.



## Task 3: modificadores

RED de implementación: 9 fallos esperados por metadata/copy/identidad visual; después se reprodujo y corrigió maxCount=0. GREEN final: 75 casos en 7 archivos, typecheck, ESLint y Prettier. Browser: 5 casos sobre componentes reales pasaron en 1280/768/390; defaults por producto, receta independiente de selección/precio cero, simple/múltiple, límites, disponibilidad, cancelar/reabrir y edición conservando cantidad/notas con precio recalculado. La apariencia usa key persistida con fallback neutro; no se alteran IDs de binding ni consultas adicionales. Se revisaron capturas de los tres tamaños y el pie del modal conserva acciones visibles.

El bootstrap alternativo del helper de tests se completó con PGlite nueva y usuarios descartables; el E2E integrado quedó bloqueado por permisos de socket a 127.0.0.1:3017. No se ejecutaron casos ni se anuló esa restricción.

La revisión independiente detectó claves semánticas de fixtures que no cubrían los UUID reales de modificadores. Una consulta de lectura de identidades activas permitió completar el adaptador con 24 opciones persistidas de cinco grupos. RED: 20 fallos esperados; GREEN: 49 casos focalizados, typecheck, lint y formato. Renombrar opciones no cambia su apariencia; Sin perlas usa X y Sin salsa círculo neutro. Claves nuevas conservan fallback. No se modificaron datos.

El caso adicional de 390x640 desplaza grupos de 0 a 476 px y comprueba posición/tamaño idénticos de cabecera y pie, sin desplazar diálogo o documento. Pasó 1/1. La revisión acotada aprobó los tres hallazgos corregidos sin nuevos bloqueantes.

## Task 4: pedido

RED: el área de líneas medía 0 px a 390x844. Se extrajeron OrderLine, el diálogo y las transformaciones de configuración, conservando el editor aislado de notas/precios y Deshacer. El manager mantiene borrador, caché y coordinación. Cliente y localizador siguen compartidos entre catálogo y revisión.

GREEN: 55 casos focalizados con PGlite descartable; typecheck, lint y formato correctos. El navegador pasó 14/14 en 35 s con componentes reales y HTTP interceptado, incluidos combos, cantidades, notas, eliminar/deshacer, cliente/localizador, historial/detalle y cambios de ancho. Se verificaron 320/360/390/768/1024/1280 y 390x640. La lista a 390x844 ahora mide 189,875 px; el cobro entra sin desplazar la pantalla a 390x640. En alturas pequeñas el resto del contexto y Seguir agregando se alcanzan desplazando la revisión.

Se eliminó un subtotal redundante que recortaba el cobro en 17 px. Cabecera, total y cobro permanecen fijos al desplazar solo las líneas. La selección de origen/consumo usa el naranja aprobado.

La revisión independiente encontró que Deshacer fijado cubría 49 px de una lista de 56 px en pantallas cortas. Se corrigió para que se desplace con la lista. RED: los clics ordinarios sobre otra línea fallaban en ambos tamaños; GREEN: 4/4 casos de quitar, editar otra línea y deshacer a 320x720 y 390x640, más edición y scroll previos. La revisión acotada aprobó la corrección sin nuevos bloqueantes.

## Task 5: cobro

RED: tres casos del helper y tres recorridos de UI detectaron las funciones faltantes, efectivo vacío confirmable, ausencia de filas compactas y transferencia sin acreditación explícita. GREEN: 57 casos focalizados y 14 recorridos de navegador; un caso administrado quedó omitido por el entorno documentado. Typecheck, ESLint y formato pasaron.

El cobro comparte cálculo bigint y presenta medios en dos columnas, campos específicos y filas compactas para división. Cada fila conserva sus referencias; agregar propone el saldo y quitar recalcula. El efectivo recibido se mantiene fuera de PaymentDraft. Titular/operación opcionales se serializan en una referencia de hasta 120 caracteres y la acreditación se vuelve a pedir al editar los datos. Cupón de tarjeta obligatorio y ceros a la izquierda preservados.

Se revisaron capturas de escritorio y celular. La prueba de teclado simula un viewport visual de 370 px con desplazamiento de 28 px y verifica campo enfocado y pie visibles; no prueba un teclado Android/iOS real. La geometría responde sin transición demorada y el contexto de efectivo tiene espacio reservado.

La revisión independiente corrigió dos desvíos: aviso fuera de vista al confirmar desde la última fila y panel 29 px más alto que el aprobado. RED: tres casos reprodujeron ambos defectos. GREEN: 4 focalizados y 16 de cobro; un caso administrado omitido. Efectivo mide 900x520 con columnas de 266 px, referencia opcional accesible y cuerpo desplazable al expandirla en poca altura. Los avisos nuevos reciben foco y quedan visibles incluso si se repite el texto con un nuevo evento. La revisión acotada aprobó especificación y calidad.

## Task 6: recuperación y confirmación

El hook adquiere exclusión sincrónica antes de persistir o despachar y comprueba la identidad vigente del comando al enviar, reintentar y descartar. Se conservaron URL, cuerpo, requestId y clave de sesión. Un validador opcional confirma la estructura y la identidad de la venta antes de limpiar la operación. Las respuestas incompletas conservan incertidumbre. El resumen del vuelto se asocia exclusivamente al comando admitido; después de recargar se omiten los datos de efectivo que no se conocen.

RED del hook: tres fallos de llamadas simultáneas, cuatro respuestas 200 mal formadas y tres acciones retenidas de renders anteriores. GREEN final: 12 casos Chrome; 61 pruebas Vitest de resultado, caja, stock, impresión, permisos y HTTP. Después de reforzar las acciones retenidas, se repitieron 22 regresiones pertinentes. Typecheck, lint y formato pasaron.

El estado de Caja se comparte desde su consulta existente. CASH_CLOSED devuelve un evento de actualización para volver a ofrecer apertura según permisos, conservando el pedido. Stock se muestra como detalle inline. Venta cobrada, pendiente, sin cargo y anulada usan estados distintos; impresión conserva su recuperación propia.

La prueba de concurrencia con dos conexiones se detuvo por falta de KYBO_TEST_DATABASE_URL dedicada. Los E2E históricos de ventas y pickup se actualizaron por inspección y se enumeraron 17 casos; su ejecución administrada sigue bloqueada.

La revisión independiente encontró cuatro fallas materiales: una respuesta de un POS desmontado podía borrar el comando de una venta posterior; una revisión nueva de la venta conservaba una confirmación anterior; una falla de sessionStorage podía dejar bloqueado el envío; y porcentajes mal formados podían superar la validación de resultado. Se reprodujeron con seis casos RED del hook y dos de revisión de venta. La corrección invalida intentos antiguos después de cada espera, conserva el comando ante fallas de almacenamiento, descarta confirmaciones obsoletas y valida los porcentajes antes de aceptar el resultado.

GREEN de la corrección: 18/18 casos del hook real en Chrome, 28 pruebas Vitest focalizadas y una ejecución nueva de 21/21 recorridos completos de checkout en 43,6 s. Los casos conservan los bytes del comando siguiente ante respuestas antiguas 200/503 y recuperan ese mismo comando después de recargar. Typecheck, lint y formato pasaron. La segunda revisión aprobó especificación y calidad en `105f01d`. El HTTP está interceptado: estos resultados no prueban conectividad productiva ni una impresora física.

## Task 7: revisión integrada

Se completaron las nueve paletas canónicas por ID, el área táctil del enlace de cuenta, la tipografía de los portales y el contexto compacto compartido entre catálogo y pedido. RED reprodujo los IDs sin paleta, el enlace de 37 px, Manrope en dos portales y la falta de espacio para tarjetas después de cobrar. GREEN: 9/9 unitarias de presentación y 86/86 casos de navegador en 2,2 min (52 superficie, 18 operaciones, 16 cobro). Typecheck, ESLint y formato pasaron también sobre las pruebas finales.

Las capturas y datos se conservan en [evidencia](pos-ux-ui-evidence/README.md). Se verificaron 1280×800, 768×1024, 390×844, anchos 320/360/1024, 390×640, foco, nombres largos y viewport reducido de teclado. Una tarjeta visible admite iniciar el siguiente pedido mientras se muestra el recibo anterior; se conserva el desplazamiento. Las nueve paletas usan identificadores reales en un escenario de pruebas separado del recorrido comparable.

El recorrido mantuvo 15 GET por ancho, incluidos 1 catálogo, 9 configuraciones y 1 consulta compartida de retiro. Buscar conserva cuatro commits React y editar diez. El perfil limpio final de `be21941` creció 27.992 bytes (+1,01 %); no es el bundle optimizado de Next. En el fixture comparable, el carrito móvil pasó de 0 a 189,875 px de área de líneas. No se agregaron memoizaciones, endpoints ni cachés. Los tiempos locales se documentan con su entorno y no prueban una mejora de latencia productiva.

La revisión independiente de toda la rama encontró cuatro fallas de recuperación/layout, documentadas por separado. Los resultados globales siguientes corresponden al código de aplicación `6052754`; las correcciones posteriores requieren sus regresiones focalizadas y el build final.

## Comprobaciones globales

| Comando | Resultado observado |
| --- | --- |
| `pnpm typecheck` | Pasó sobre los archivos finales de Task7. |
| `pnpm lint` | Pasó sobre los archivos finales de Task7. |
| `pnpm test` | Salió con código 1 en 947,94 s: 204 archivos pasaron, 13 fallaron y 2 se omitieron (219); 1.175 pruebas pasaron, 6 fallaron y 86 se omitieron (1.267). |
| `pnpm build` | Turbopack no avanzó de Creating an optimized production build. Se interrumpió exclusivamente su sesión tras más de seis minutos sin salida adicional. No se considera aprobado. El baseline había fallado en la conexión con el proceso de PostCSS. |
| `pnpm build --webpack` | Pasó después de las correcciones finales: compilación, TypeScript, generación y enumeración de rutas. No prueba un runtime autenticado configurado; el entorno no tenía credenciales de DB/auth. |
| `pnpm test:e2e` | Código 1 antes de Next: scripts/migrate.ts exige el runner revisado de transición y deshabilita la migración genérica. No se anuló. |

Los ocho fixtures históricos de catálogo, inventario, modificadores/schema, preparación, producción, recetas y ventas fallaron al preparar la transición explícita. El noveno fallo de preparación corresponde a PostgreSQL dedicado sin KYBO_TEST_DATABASE_URL. Una prueba no pudo crear una junction por EPERM; cuatro casos de navegador recibieron ERR_NETWORK_ACCESS_DENIED al usar localhost.

El sexto fallo de aserción fue `checkout-performance.integration.test.ts`: 52 consultas ante un límite de 50. Se reprodujo en un snapshot exacto de `b594631` con sus 1.025 archivos verificados contra Git y dependencias compartidas: cinco casos pasaron y ese mismo límite falló en 10,62 s. Todas las comprobaciones de pagos, reservas y stock anteriores a la aserción pasaron; la rama también ejecuta 52 consultas, delta 0. No se cambió el límite ni el servicio para ocultarlo. [Log de base](pos-ux-ui-evidence/logs/final-checkout-base-b594631.log).

La suite se ejecutó con NODE_ENV=test, KYBO_ALLOW_TEST_MIGRATIONS=disposable-only y sin DATABASE_URL, KYBO_TEST_DATABASE_URL, KYBO_LOCAL_DB ni KYBO_TRANSITION_DATABASE_URL. Los [logs](pos-ux-ui-evidence/logs/) conservan las causas. Estos resultados no equivalen a una suite global verde.

## Corrección y revisión final

La revisión completa reprodujo cuatro fallas: la cabecera real del AppShell dejaba sin tarjetas tocables al catálogo móvil; dos avisos de detalle/anulación omitían el descarte seguro de rechazos; actualizar el precio simple conservaba su revisión anterior; y una falla al limpiar sessionStorage después de un 4xx dejaba un botón de confirmar sin efecto. Se corrigieron juntas en `be21941`, después de reproducir los cuatro defectos.

La regresión final pasó 99/99 casos de navegador (63 superficie, 20 operaciones, 16 cobro), 88/88 casos Vitest focalizados, TypeScript, ESLint, Prettier y el build Webpack. Las pruebas de shell verifican físicamente 44 píxeles consecutivos y clics normales a 320/360/390 px, en delivery y en el pedido siguiente al recibo. Se mantiene un único pedido/catálogo. Las pruebas de recuperación conservan URL, requestId y bytes del comando, evitan reenviar al descartar y conservan cantidades, notas y efectivo ingresado. La prueba de precios envía revisión 2 después de refrescar la revisión 1.

La única revisión acotada posterior aprobó los cuatro hallazgos, sin nueva rotura: [informe final](pos-ux-ui-evidence/reviews/final-fix-review.md). Queda una observación menor de copy: el configurador conserva “Agregar al pedido/Agregar combo” al editar una línea, aunque guarda correctamente una sola línea. No bloquea la revisión funcional.

Después del build se repitieron tres recorridos comparables sin otros checks intensivos. Pasaron 3/3 en 15,2 s. Catálogo listo: 566,3/495,7/504,6 ms a 1280/768/390; configuración: 84,5/112,5/103,1 ms. Son respuestas interceptadas y muestras locales, sin conclusión sobre latencia productiva. Las capturas del perfil son del fixture original sin shell; los seis casos del shell real se verifican por separado.

## Entrega

Rama local `feature/ux-ui-pos-improvements`, con commits por etapa y evidencia incluida. Se conserva el trabajo del checkout original. [Descripción de PR preparada](pos-ux-ui-pr.md). No se mergeó a main ni se desplegó en producción.

La publicación remota completa queda pendiente: la revisión automática rechazó cargar una captura al repositorio público FranJarma/kybo-backoffice sin autorización explícita de ese contenido. Se detuvieron esas cargas; no se creó ni movió la referencia remota de la feature. La entrega local incluye una copia Git autosuficiente, verificada sin alternates, con el mismo commit y árbol. La historia es shallow en el commit base documentado; contiene todos los objetos necesarios para revisar y continuar esta rama.
