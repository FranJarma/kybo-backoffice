# Localizadores y retiro: diseño y ejecución

Contexto aprobado: [order-pickup-handoff.md](order-pickup-handoff.md).

Se continúa en `codex/order-pickup`, sin commits ni push. El 22/10/2026 el usuario autorizó aplicar la migración 0024 en la base configurada en Neon; se aplicó y verificó preservación del contenido previo de 17 tablas. El usuario autorizó explícitamente ejecutar migraciones únicamente en una base descartable en memoria. Las pruebas de integración usan PGlite en memoria; las pruebas de navegador simulan las respuestas de la API.

## Diseño

- Cada sucursal tiene una cantidad de localizadores (16 inicialmente, ampliable) y una clave aleatoria para su pantalla pública. La clave habilita exclusivamente la lectura del DTO público.
- Cada asignación pertenece a un pedido, conserva número, actor y fecha; la devolución registra actor y fecha. Índices únicos parciales impiden dos asignaciones vigentes del mismo número/sucursal o del mismo pedido. Cambiar exige confirmar la devolución del anterior. Anular, cobrar o entregar nunca libera el equipo.
- Asignación inicial dentro de la transacción de creación/agregado del pedido: cualquier conflicto revierte venta, pago, reservas y comandas. Cambios posteriores bloquean venta y pedido y verifican la asignación esperada. Reintentos usan las claves de operación existentes.
- Preparación pública derivada de tareas y cantidades de fulfillment de todas las líneas operativas, incluidos componentes de combos. Venta directa se considera lista para entrega; recetas requieren todas las estaciones listas y cantidades completas. Sin progreso conocido no se anuncia listo. Pedidos anulados o completamente entregados salen de la pantalla.
- Identificador público `venta.secuencia`, separado del localizador. Por solicitud del usuario, la API pública incluye el nombre del cliente guardado en la venta (cliente registrado o nombre libre), junto al pedido/localizador. No incluye identificadores de cliente, contacto, notas, importes ni medios de pago. Consulta por sucursal y pedidos pendientes, máximo 9 por página para mantener legibilidad; rotación automática si exceden una página. Actualización cada 5 segundos; datos ocultos ante errores de conexión para evitar anunciar estados vencidos. La consulta parte de índices parciales sobre entregas pendientes y comandas activas: no reactiva ventas históricas sin seguimiento operativo.
- Controles táctiles en caja: selección 1–16 y Sin localizador, ocupados deshabilitados. Gestión de equipos pendientes de devolución desde caja, incluso de ventas anuladas/entregadas; historial y cambios desde el detalle del pedido. Comandas muestran el número actual.
- La entrega usa el circuito de fulfillment existente; no se modifica el inventario por asignar o devolver. Llamado desde la base física, manual.

## Implementación y verificaciones

- [x] Estado derivado: pruebas de estaciones mixtas, combos, entrega parcial, venta directa, cancelación y datos incompletos; implementar `src/modules/pickup/state.ts`.
- [x] Datos: `src/db/pickup-schema.ts`, columnas de sucursal y migración `0024_order_pickup.sql`, registrada y aplicada en Neon con autorización explícita.
- [x] Servicios: `src/modules/pickup/service.ts` y consultas públicas; validación de localizador en venta, asignación transaccional, historial, devolución con comparación de asignación y permisos por sucursal.
- [x] API y UI: rutas internas autenticadas, ruta pública por clave, selector táctil, gestión de devoluciones, identificación en comandas, pantalla pública sin sesión interna.
- [x] Pruebas: validar rollback por conflicto, reutilización, reintentos antiguos, permisos, privacidad y consistencia con inventario. Ejecutar tipos, lint y build. Pruebas de base en el entorno descartable autorizado.

## Registro

- Rama y cambio previo verificados: solo el handoff sin seguimiento. Documentación instalada de Next.js revisada.
- Decisión: continuar sin nuevas aprobaciones de diseño/plan, conforme a la instrucción explícita del traspaso de implementar el alcance autorizado; conservar el pedido de autorización específico para ejecutar migraciones en pruebas.
- Revisión independiente: corregidos reinicio del localizador al descartar/iniciar borradores y actualización del detalle después de cambiar/devolver el equipo. Pruebas de navegador cubren ambos recorridos.
- Verificación visual: controles numéricos de al menos 64 px de alto y fuente de 24 px; se corrigió la precedencia del estilo global de botones.
- No se permite archivar una sucursal con equipos pendientes de devolución; mantiene accesible la gestión física.

## Uso y activación

Con la migración 0024 aplicada, en Ventas aparece «Sin localizador · Elegir». El número se reserva al guardar el pedido, con validación transaccional; elegirlo en el borrador no lo ocupa todavía. «Localizadores y pantalla» permite devolver equipos, entrar a sus ventas y abrir el enlace de clientes. El detalle de cada pedido permite cambiar la asignación y consultar su historial.

El enlace público `/pickup/<clave de la sucursal>` funciona sin sesión. «Listo» no acciona el equipo físico: el operador continúa haciendo el llamado desde la base. La entrega sigue en Preparación y entrega, y la devolución del equipo se confirma por separado.

La migración `0024_order_pickup.sql` agrega la cantidad inicial 16 y la clave pública a las sucursales (también mediante defaults para sucursales futuras), crea el historial con restricciones de exclusividad e índices para consultar trabajo pendiente. No requiere modificar ni borrar ventas anteriores. La ampliación futura usa `branches.locator_count` (1–999); esta etapa no agrega una pantalla administrativa para editar esa configuración.

## Evidencia de verificación

- 36 pruebas en 10 archivos: localizadores, combos, comandas, sucursales, privacidad y cantidades de fulfillment. Incluye conflicto sin venta/cobro parcial, cancelación sin liberación, devolución y reutilización, reintentos antiguos, sucursales separadas, mesas con pedidos sucesivos, combo Barra+Cocina+venta directa y exclusión de ventas históricas.
- 3 pruebas Playwright: pantalla pública sin sesión y recuperación tras desconexión; selección táctil y borrador nuevo; actualización del número después de cambiarlo. Las últimas dos montan los componentes reales con un fixture de navegador y API simulada, sin rutas auxiliares de producto.
- Lint de código: `pnpm exec eslint src tests scripts '*.ts' '*.mjs'` aprobado. `pnpm lint` incluye artefactos y copias antiguas en `.local`, con errores preexistentes; no se editaron esos archivos.
- Compilación de producción aprobada con Turbopack, incluida su comprobación de TypeScript y generación de 60 páginas estáticas. Se usó una salida nueva `.next-e2e/pickup-build` después de que el primer intento aislado dejara una caché de CSS fallida. Se restauraron `next-env.d.ts` y `tsconfig.json`, que Next.js modifica al cambiar la carpeta de salida.
- La disputa simultánea se ejercita en PGlite, que serializa transacciones. Los índices únicos de PostgreSQL son la garantía de exclusión; no se ejecutó una prueba con dos conexiones PostgreSQL externas.

- Activación 22/10/2026: `scripts/apply-order-pickup.ts --apply` verificó historial y hashes, aplicó exclusivamente 0024 en una transacción y comprobó la preservación de 17 tablas. App existente en http://localhost:3000: pantalla pública y API responden 200, cola vacía, 16 localizadores; Ventas redirige al login y API interna responde 401 sin sesión. Sin ventas de prueba agregadas, cambios de .env, commit ni push.
