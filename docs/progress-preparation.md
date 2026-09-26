# SDD ledger — plan: docs/superpowers/plans/2026-09-25-comandas.md

Base caf442d; rama feat/kitchen-queue en checkout Next separado del sitio original.
Continuación de desarrollo autorizada: ejecución local, sin publicación ni integraciones externas.
Pre-flight: Task 1 conserva firmas de sales. Task 2 publica dentro de insertOrder; Task 3 consume sus DTOs y APIs sin cambiar cálculos de venta. Bloqueos venta→tarea; configuración producto→estación; no inversiones detectadas.
Scope: una estación por producto y varias por pedido. Móvil online; PWA/offline e inventario tendrán sus propios incrementos.
Task 1: complete. Baseline89/89. RED: HTTP413 para pedido válido y falta de bloqueo en SQL de replay. GREEN:92/92. Transporte de ventas300KB; otros20KB. Replay FOR SHARE en los cuatro comandos. La prueba observa SQL ejecutado y resultados; no sustituye la validación futura multiconexión.
Task 2: complete. RED por módulo de preparación ausente. GREEN9/9 específicos y101/101 suite completa, TypeScript sin errores. Publicación/anulación dentro de la transacción de venta; estados, permisos, transferencias, snapshot de ruteo y métricas verificadas en PostgreSQL embebido.

Task 3: Ruling: E2E usa Turbopack y compilación temporal por ejecución, restaurando next-env/tsconfig — la traza identificó lectura vacía del BUILD_MANIFEST de webpack; aislar caché y retener rutas no la eliminaron, Turbopack usa escritura atómica y completó19/19 sin el error — costo si es insuficiente: diferencias del servidor de desarrollo aún pueden requerir reproducción con Neon/producción antes de operar. No se cambian autenticación, aserciones ni reintentos de la aplicación.
Task 3 gates: RED inicial de navegador por /kitchen ausente; GREEN2/2 focales y19/19 E2E completas (1.4m) con captura1440/390 sin desborde. Build de producción, TypeScript, lint y diff --check sin errores. Capturas desktop/mobile/métricas inspeccionadas.
Task 3: complete (commits c7de641..4e53e50, tests: npm test →    Duration  31.07s (tests 82%, import 17%, transform 1%))

Final review (fresh reviewer, gpt-6-astra): no críticos; dos Important aceptados por efecto operativo: detalle obsoleto y ruta invisible de producto archivado. Ambos entran en una única pasada RED→GREEN.
Final: minor (deferred): Guardar una asignación limpia otros borradores de configuración sin aviso; se deben volver a ingresar.
Final: minor (deferred): Guardar el nombre de una estación archivada la reactiva implícitamente; usar la acción explícita de archivo nuevamente si se renombra.
Final: Ruling: PWA/offline, impresión e integraciones externas quedan fuera de esta versión — estaban diferidos y la interfaz requiere conexión a un servidor accesible — costo si se asumen disponibles: no se podrá operar sin internet ni imprimir/integrar desde este incremento.
Final: Ruling: No conectar consumo/reservas de inventario por ventas en este incremento — se conserva el límite explícito del POS y se implementará con su propio flujo transaccional — costo: registrar ventas o preparación no descuenta stock.
Final: Ruling: Validación multiconexión Neon y dispositivos reales se realiza al integrar — PGlite y navegador verifican lógica pero no reproducen toda esa infraestructura — costo: esta entrega aún no valida el reemplazo operativo de Fudo.

Final: fixed detalle abierto obsoleto — regresión «open detail refreshes across sessions and locks its own stale data» RED por falta de segunda lectura → GREEN con dos sesiones, borrador preservado, GET fallido, suspensión y entrega; suite102/102 y navegador21/21.
Final: fixed ruta de producto archivado — «finds and clears an archived product route without reactivating the product» RED de validación/listado → GREEN, con reintento y producto conservado archivado; recorrido UI también GREEN; suite102/102 y navegador21/21.
Final test fixture: el usuario de prueba cambia de nombre en el recorrido de UI anterior; se selecciona destinatario por ID distinto del responsable, sin depender del nombre visible. No se cambia lógica de la aplicación.
Final gates 2026-09-25: npm test102/102; E2E21/21 (1.7m); build de producción, TypeScript, lint y git diff --check salen0. Se conserva la rama local feat/kitchen-queue. Sin publicación, conexión Neon, modificación del sitio original ni importación de datos reales.
