# Implementación: preparaciones centrales

Spec: `docs/superpowers/specs/2026-10-23-central-preparations-design.md`.
Base: `27f2e9e`. Ejecución inline en la rama de trabajo existente.

## Task 1: calcular necesidades centrales

Agregar pruebas que fallen para agregación de destinos, tandas, compromisos,
stock físico y ausencia de Depósito. Implementar el cálculo y su conexión a la
conciliación. Expected: pruebas focalizadas verdes; sin propuestas de producción
en Barra/Cocina ni transferencias de stock futuro.

## Task 2: confirmar una preparación desde la tarea

Agregar prueba de ciclo real y permisos antes de implementar el comando y su
botón. Reutilizar planificación, asignación y finalización actuales. Expected:
confirmar dos veces crea una sola orden, sin mover stock; finalizar permite
proponer el traslado físico y las órdenes pendientes evitan duplicación.

## Task 3: verificar y activar los mínimos

Ejecutar pruebas relevantes, tipos, formato, revisión independiente y revisión
visual. Preparar manifiesto y lectura previa de Neon; guardar políticas en una
transacción auditada, conciliar y verificar stock intacto y tareas pendientes.
Expected: valores leídos coinciden con el manifiesto; ninguna operación física.

Integración: un commit y push al finalizar, conforme a la autorización vigente.
