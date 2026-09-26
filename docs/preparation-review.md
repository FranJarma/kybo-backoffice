# Revisión de comandas — 0.5.0

Revisión independiente de solo lectura por un agente con contexto nuevo, modelo gpt-6-astra, sobre `caf442d..4e53e50`. Se revisaron especificación, plan, bloqueos, idempotencia, consultas, UI y evidencia de pruebas. No se encontraron hallazgos críticos. El autor aceptó dos importantes y los corrigió en una única pasada con regresiones; no se pidió una segunda revisión.

## Importantes corregidos

1. **Detalle abierto desactualizado.** Antes consultaba solamente al abrir o confirmar una operación local. La regresión de navegador falló esperando una segunda lectura que nunca llegaba. Ahora comparte la lógica de polling y recuperación con el tablero, pero mantiene lectura, error y vigencia propios. Conserva el borrador durante lecturas periódicas y bloquea la transferencia si su lectura falla o vence. La prueba pasa con dos sesiones, GET fallido, suspensión/recuperación de visibilidad y cambios posteriores hasta entrega.
2. **Ruta invisible de producto archivado.** La prueba de dominio falló al intentar consultar productos archivados en configuración; el revisor también reprodujo los errores400/409 al desasignar/archivar. Se agregó un filtro explícito para verlos y quitar su estación sin reactivar el producto. No se les puede asignar otra estación. La regresión verifica reintento, archivo posterior de la estación y permanencia del producto archivado; el flujo completo pasa también desde la interfaz.

Las pruebas finales y sus cantidades quedan registradas en `progress-preparation.md`.

## Menores diferidos

- Guardar una asignación limpia otros borradores de la pantalla de configuración, incluida la edición de estación. Hasta corregirlo, editar y guardar un cambio por vez. No se pierden datos ya confirmados.
- Guardar el nombre de una estación archivada también la reactiva. Si se renombra una estación que debe seguir archivada, volver a archivarla explícitamente. El archivo sigue exigiendo que no tenga productos asignados ni tareas activas.

## Límites aceptados

- PWA, operación offline, impresión e integraciones externas quedan para sus propios incrementos. Esta interfaz necesita conectividad con el servidor.
- Las ventas y tareas todavía no reservan ni descuentan stock; el inventario no debe interpretarse como ajustado automáticamente por las ventas.
- La validación multiconexión en Neon y con los dispositivos del local corresponde a la integración. Las pruebas con PGlite, navegador y build no validan por sí solas el reemplazo operativo de Fudo.

La decisión de usar Turbopack para las pruebas y la evidencia del fallo anterior de webpack están documentadas en `preparation-verification.md`. No se cambió el framework, la seguridad ni el comportamiento de reintento para obtener un resultado verde.
