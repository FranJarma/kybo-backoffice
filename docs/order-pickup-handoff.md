# Cola de pedidos y asignación de localizadores

Contexto de continuidad al 22 de octubre de 2026.

Actualización del 26/10/2026: el usuario pidió liberar el localizador al entregar el pedido completo y devolverlo con un clic desde el listado. Esto sustituye la devolución separada obligatoria descrita en el traspaso original. Las entregas parciales conservan la asignación; cobros y anulaciones tampoco la liberan. Se conserva la devolución puntual directa y el historial. Ver [plan y verificación](superpowers/plans/2026-10-26-locator-delivery-return.md).

Actualización posterior: el circuito está implementado. El usuario autorizó mostrar el nombre del cliente junto al identificador en la pantalla pública, además de los colores/logo de Kybo y los ajustes de tablet, selección de cliente y detalle de faltantes. Esa autorización sustituye la recomendación inicial de omitir nombres. La migración 0024 se aplicó a Neon con autorización expresa; el 22/10/2026 también autorizó commit y push de la rama junto con Operación del día. Las restricciones de no migrar/publicar que aparecen abajo describen el alcance del traspaso original, no revocan estas autorizaciones posteriores.

## Pedido del usuario

Implementar una cola de pedidos para clientes y vincular cada pedido con el número del localizador entregado al cliente. La operación del punto de venta debe ser rápida y cómoda para pantalla táctil.

El usuario aprobó avanzar con ambas funciones. Solicitó un selector con los números 1 a 16 al tomar el pedido y que el diseño permita ampliar esa cantidad en el futuro. Por ahora el empleado hará sonar el localizador manualmente desde la base física.

## Equipo y límite de esta etapa

- Proveedor: llamadorinalambrico.com. El usuario compró un kit de 16 localizadores.
- El proveedor publica un equipo KEL 16, pero todavía no se confirmó que sea exactamente el modelo adquirido ni que permita control desde software externo.
- La integración automática con el equipo queda fuera de esta etapa, pendiente de la respuesta del proveedor. No implementar transmisión de radio ni dar por disponible una API.
- La cola de pedidos debe funcionar independientemente del hardware.

## Alcance funcional acordado

1. Asignar el número de localizador al tomar el pedido y mostrarlo en el punto de venta y las comandas.
2. Mantener trazabilidad de la asignación y de las acciones de preparación y entrega.
3. Ofrecer una pantalla de clientes con pedidos «En preparación» y «Listos para retirar», actualizada automáticamente.
4. Mostrar como listo un pedido completo cuando hayan terminado todas las estaciones que intervienen, incluyendo Barra y Cocina y los componentes de los combos.
5. Mantener el llamado manual desde la base. Que el sistema muestre «Listo» no significa que haya hecho sonar el localizador.
6. Resolver este circuito antes de continuar con la facturación de ARCA.

## Diseño recomendado para concretar al comenzar

Estas reglas completan la propuesta; todavía no son una especificación técnica implementada:

- Localizadores por sucursal, inicialmente 1–16. Evitar que el mismo localizador esté asignado a dos pedidos activos; validar también en la base de datos ante cajas concurrentes.
- Ofrecer «Sin localizador» para no bloquear pedidos que no lo necesitan o cuando no quedan equipos disponibles. Los ocupados deben ser visibles e indicar que no pueden seleccionarse.
- Guardar quién asignó, cambió y devolvió cada localizador, a qué pedido y en qué momento. Conservar el historial después de reutilizar el número.
- Confirmar la devolución física para liberar el equipo. Anular un pedido no debe suponer que el cliente ya devolvió el localizador.
- Mantener separado el número de pedido del número de localizador. El número público de pedido debe seguir siendo útil para pedidos sin localizador.
- La pantalla de clientes debe mostrar solamente identificadores y estados públicos: nunca nombres, importes, medios de pago ni notas internas. Debe estar limitada a una sucursal y no conceder acceso a operaciones internas.
- Reutilizar los estados y servicios de comandas; evitar otro circuito de estados editable que pueda contradecirlos. Contemplar venta directa y pedidos con varias estaciones.
- Los cobros y la entrega son procesos distintos. Una venta cobrada no implica un pedido listo ni entregado.
- Priorizar consultas pequeñas e indexadas y actualizaciones sin recargar la pantalla. Considerar el alojamiento previsto en Vercel u otro servicio al elegir el mecanismo de actualización.

## Estado del repositorio revisado

- Ruta: `C:\Users\franj\DEV\PERSONAL\kybo-operations-next`.
- Rama de origen revisada: `codex/product-combos`.
- HEAD revisado: `e0feb4f` — `feat: improve branch selection`.
- El árbol estaba limpio antes de agregar este documento.
- Rama de trabajo: `codex/order-pickup`, creada y seleccionada por pedido explícito del usuario al trasladar el trabajo al nuevo chat. Parte del estado actual que contiene las mejoras recientes. Verificar nuevamente la rama al comenzar; no volver a crearla si ya existe.
- Este traspaso no implementa la funcionalidad, no aplica migraciones y no hace commit ni push. Preservar `.env` y cualquier modificación posterior del usuario.

## Código existente relevante

- `src/components/sales/sales-manager.tsx`: punto de venta.
- `src/modules/sales/validation.ts` y `service.ts`: validación y registro de ventas y pedidos.
- `src/db/sales-schema.ts`: datos de ventas y pedidos; revisar la diferencia entre venta y pedido antes de decidir dónde asociar el localizador, especialmente para mesas con pedidos sucesivos.
- `src/modules/preparation/types.ts`: estados `pending`, `preparing`, `ready`, `delivered`, `cancelled`; las tareas incluyen pedido, venta, estación y tareas hermanas.
- `src/db/preparation-schema.ts`: tareas por pedido y estación, eventos y fechas de preparación y entrega.
- `src/modules/preparation/service.ts` y `queries.ts`: transiciones y consultas de comandas.
- `src/components/preparation/`: tablero, tarjetas y detalle.
- Rutas existentes: `/sales`, `/api/sales`, `/api/preparation`.

## Restricciones que deben conservarse

- Sucursales con ubicaciones; Barra y Cocina son estaciones con su ubicación de consumo.
- Reutilizar los permisos y la selección de sucursal del servidor. Personal y encargados no deben obtener permisos de administración de sucursales, ubicaciones ni medios de pago.
- Preservar reservas y movimientos de inventario: preparación consume al terminar; venta directa se descuenta al entregar. No generar movimientos adicionales por asignar, llamar o devolver un localizador.
- Mantener la composición de combos y sus modificadores existentes.
- Reutilizar las notificaciones transitorias del sistema para éxito y errores, con controles legibles y cómodos al tacto.
- Cumplir `AGENTS.md`: leer la documentación relevante de Next.js instalada en `node_modules/next/dist/docs/` antes de escribir código.

## Verificaciones a incluir en la implementación

- Dos cajas intentando asignar el mismo número: solamente una lo consigue y la otra recibe un mensaje claro, sin duplicar el pedido ni el cobro.
- Separación entre sucursales y permisos de lectura y escritura.
- Asignación, cambio de número, entrega, devolución y reutilización conservando el historial.
- Cancelación sin liberar indebidamente un dispositivo no devuelto.
- Pedido con Barra y Cocina y combo mixto: no anunciarlo listo antes de completar todos sus componentes.
- Venta directa, pedido sin localizador y ausencia de equipos libres.
- Pantalla de clientes sin datos privados, actualización automática y recuperación después de un corte de conexión.
- Reintentos de operaciones sin duplicar efectos; errores del servidor visibles en el punto de venta.
- Comprobar tipos, lint, pruebas pertinentes y uso táctil del flujo completo.

## Cómo continuar

Releer este documento y verificar el código actual. Concretar el diseño de datos y el recorrido de asignación, devolución y entrega antes de implementar. Si hace falta una migración, prepararla y explicar qué cambia; este documento no implica autorización para aplicarla a una base de datos. No hacer commit ni push sin una nueva instrucción del usuario para este trabajo.
