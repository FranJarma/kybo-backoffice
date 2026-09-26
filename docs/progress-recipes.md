# SDD ledger — plan: docs/superpowers/plans/2026-09-25-recetas-produccion.md

Base: 7a7dc73. Rama aislada feat/recipes-production dentro del checkout de Next separado del sitio original.
Pre-flight: Task 1 produce versiones/opciones; Task 2 las referencia sin editarlas. Conforme.
Pre-flight: Task 2 amplía movimientos; Task 3 debe ampliar etiquetas y recuperación de operaciones. Conforme.
Pre-flight: Tasks 1/2 comparten locks/valuación con inventario y guardias de unidad del catálogo. Se reutilizan helpers exactos existentes, sin fórmulas duplicadas.

Estado: implementación y revisión completas. Entrega local 0.3.0; integración externa aplazada.

Task 1: complete. RED: servicio ausente; GREEN: 72/72 pruebas, typecheck sin errores. Se corrigió el fixture del contrato updateRecord (campos planos).
Task 2: en curso.

Task 2: complete. RED: servicio ausente; GREEN: 78/78 pruebas, typecheck sin errores. Movimientos de UI ampliados en esta tarea para conservar el contrato tipado.
Task 3: en curso.

Task 3: complete. E2E RED por rutas ausentes; GREEN suite completa 14/14. Luego de tarjetas móviles, comparación 1/1 y producción 1/1; fixture corregido para seleccionar el botón visible en lugar del texto del layout oculto. Build, typecheck y lint finales sin errores. Reselección verificada RED→GREEN; borrador conservado.
Task 4: complete. Revisión fresca 7a7dc73..e98a362 sin hallazgos críticos, importantes ni menores. Archivo fuente ZIP validado sin dependencias ni datos privados. Se conserva la rama feat/recipes-production para continuar; no se publica ni se conecta Neon.

Final: Ruling: concurrencia real y despliegue no evaluados por el revisor — se mantiene el alcance local porque la integración fue aplazada — falta validar intercalados de conexiones en Neon antes de operar allí.
