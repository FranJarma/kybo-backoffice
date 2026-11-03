# Registro de producción: resultado

Rama `codex/production-ux`, creada desde `origin/main` (`46d3434`).

## Experiencia aplicada

- Pestañas Órdenes, Registrar lote e Historial. La entrada prioriza el trabajo pendiente; Nueva producción muestra el formulario solo al solicitarlo.
- Autocomplete compartido para preparaciones, responsables y alternativas de ingredientes. Los ingredientes fijos se muestran por nombre, sin selectores redundantes.
- Planificación con campos agrupados, unidades visibles, obligatorios identificados y acción de asignar alineada.
- Rendimiento arriba en el registro del lote, consumos por ingrediente y resumen lateral en escritorio. Una columna en celular.
- Estados, fechas, responsables y ubicaciones agrupados. Paginación contextual con posiciones separadas para órdenes e historial.
- Borradores conservados entre pestañas, incluidos resultados y consumos de órdenes existentes. Durante envíos pendientes o inciertos se protege la navegación.
- Recarga real de recetas modificadas, historial independiente del borrador y recuperación de respuestas perdidas sin duplicación.
- Al cambiar la preparación, el formulario permanece visible mientras se actualiza la receta. El nombre seleccionado y el aviso de carga se muestran inmediatamente; sus campos y confirmación quedan deshabilitados hasta recibir los ingredientes correctos. Un error permite reintentar sin habilitar la receta anterior; respuestas de selecciones previas se ignoran.

## Corrección de integración

El registro directo de lotes crea una orden interna para sus movimientos, cuya composición es diferente a la de una tarea asignada. La consulta anterior intentaba leerla como una tarea y fallaba al abrir el historial. La consulta ahora excluye esas órdenes internas mediante su vínculo con `production_batches` y la sucursal: los lotes siguen en su listado y las órdenes asignadas en el suyo. Una prueba de integración reproduce el error anterior y verifica ambos listados tras la corrección. No se cambió cómo se mueve o reserva stock.

## Verificación

- 19 pruebas enfocadas de producción en cinco archivos: consumos, horarios, revisión de resultados, preparaciones centrales y convivencia de lotes con órdenes.
- 13 pruebas de navegador con datos ficticios en memoria: borradores, enlace con receta, asignación/inicio/finalización, envío sin respuesta y recarga, errores de consulta, alternativas, paginación, conflicto real de versión de receta y cambio de preparación con carga lenta, error, reintento y respuestas fuera de orden.
- Revisión independiente y corrección de los siete hallazgos, con reproducciones de navegador.
- Vistas 1440/1024/768/390/320 px y personal a 390 px, sin desbordamientos. Capturas fuera de Git; última comprobación sin errores de navegador.
- Compilación de producción y TypeScript correctos. La compilación se ejecutó sin conexión ni secretos reales y emitió los avisos de configuración de la página existente de contraseña por la ausencia deliberada de `DATABASE_URL`, `BETTER_AUTH_SECRET` y `BETTER_AUTH_URL`; terminó con código 0.
- Lint focalizado sin advertencias, formato y comprobación de espacios correctos. Los archivos generados por Next se restauraron a su contenido original.

No se ejecutaron migraciones ni se modificó Neon o el `.env`. La base y las cuentas de navegador usadas para verificar son descartables. No se afirma que se haya ejecutado toda la suite histórica: se usaron los tests pertinentes al cambio. Sin commit ni push; rama y modificaciones conservadas para revisión.

## Autorización de entrega

El 3 de noviembre de 2026 el usuario autorizó hacer commit y push de las mejoras de producción y de la asignación de horarios por varios días. Esta indicación reemplaza la restricción inicial de commit/push para estos cambios.
