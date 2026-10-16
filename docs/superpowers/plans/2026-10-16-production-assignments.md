# Órdenes de producción asignadas

**Objetivo:** el encargado planifica qué, cuánto, dónde, para cuándo y quién; el empleado inicia y completa sus tareas y queda trazabilidad del consumo y resultado.

**Diseño aprobado:** conversación del 16/10/2026. Un responsable por orden, reasignación por encargado, reserva al iniciar, consumo al terminar. La receta queda congelada por versión. Mantener órdenes antiguas `confirmed` como en curso; no inventar responsables ni horarios históricos. Empleados solo acceden a sus órdenes de la sucursal activa. El flujo híbrido de ventas de sándwiches se implementará por separado: esta entrega produce stock de preparados, no cambia la resolución de ventas.

**Arquitectura:** ampliar production_orders con estado planned, asignación, vencimiento previsto, observaciones y actores/fechas. Reutilizar executeCommand, reservas y libro de movimientos; eventos en audit_events. Agregar rutas operativas que admitan empleados exclusivamente para sus tareas. UI compartida para encargado y empleado, historia consultable sin exponer costos al empleado.

**Restricciones:** preservar cambios locales y .env; sin commit/push; migración aditiva 0015; fechas en zona de sucursal; no permitir doble inicio/finalización ni operaciones cruzadas entre sucursales.

- [x] Modelo/migración y planificación/inicio/reasignación: pruebas de pertenencia, revisión, falta de stock y receta congelada.
- [x] Finalización y cancelación: empleado asignado, encargado, trazabilidad y compatibilidad de órdenes existentes; pruebas de idempotencia y consumo único.
- [x] Consultas/API: filtrar tareas por empleado y sucursal, devolver responsables, guía, consumo previsto/real e historial. No ampliar permisos del resto del inventario.
- [x] UI: planificar responsable/plazo/cantidad, Mis tareas, iniciar, finalizar, reprogramar/reasignar, motivo obligatorio en cambios/cancelación, toast, atraso y detalle del historial.
- [x] Verificación: integración contra base descartable, tipos, lint, revisión de diff y migración. Documentar comprobación visual pendiente si no hay sesión autenticada.

## Decisiones
- `confirmed` conserva su significado de materiales reservados; en UI se muestra En curso. Nuevas órdenes nacen planned sin reservas.
- El plazo es fecha y hora objetivo de finalización; no se ejecutan tareas automáticamente ni se envían mensajes externos.
- Reprogramar cantidad solo antes de iniciar; reasignación y plazo también en curso. Se registra el responsable anterior y el nuevo.
- Las órdenes antiguas siguen administrables por encargado; sin información histórica se muestra Sin registro.

## Resultado y verificación
- Migración 0015 aplicada en desarrollo tras comprobar hashes e historial de las 15 anteriores; conserva responsables/fechas desconocidos como NULL.
- 41 pruebas distintas aprobadas entre asignaciones, horarios, navegación, permisos de comandos/sucursal, merma y control de inventario. Incluyen receta congelada, reasignación, revocación de acceso incluso en reintentos, falta de stock, consumo único, agua no inventariable y trazabilidad de lotes.
- Comprobación de tipos y lint de los archivos afectados sin errores.
- Sin commits ni push. Se preservaron los cambios previos y .env.
- Pendiente comprobación visual con sesión de encargado y empleado. No se ha simulado ninguna producción real en la base de desarrollo.

## Prueba operativa sugerida
1. Encargado: Registro de producción → Planificar y asignar → elegir preparación, responsable, ubicación, cantidad y plazo.
2. Empleado: entrar con su cuenta y misma sucursal; abrir Mis tareas, consultar instrucciones e iniciar preparación.
3. Finalizar con consumo y rendimiento reales; comprobar el historial de responsables/horarios, lotes y stock.
4. El encargado puede reprogramar, reasignar o anular; la cantidad prevista se modifica solamente antes del inicio.

## Simplificación de empleados — 16/10/2026
- En producción, el empleado ve únicamente sus tareas pendientes/en curso, instrucciones y botones Comenzar/Terminar. No se muestran formularios de consumo, rendimiento, merma, lotes ni historial de inventario.
- Terminar admite solo expectedRevision. El servidor obtiene y agrupa las cantidades de la versión congelada de la receta y registra el rendimiento previsto. La auditoría indica quantitySource=planned y que los valores se calcularon automáticamente; no son una medición del empleado.
- Las diferencias se comunican al encargado y se corrigen mediante los ajustes de inventario existentes. El cierre detallado del encargado sigue admitiendo cantidades reales (quantitySource=reported).
- 24 pruebas de producción, inventario no controlado y merma aprobadas; tipos y lint sin errores. No requiere otra migración. Comprobación visual autenticada pendiente.
