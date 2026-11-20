# Registro de producción: organización y claridad

El usuario eligió aplicar directamente la reorganización propuesta y trabajar en otra rama. La implementación se hará en `codex/production-ux`, sobre `origin/main`, usando Next/React y el sistema visual existente de Kybo. Los detalles de composición quedan a criterio del implementador.

## Enfoque

Se consideraron conservar la página larga y ajustar sus estilos, o separar las actividades. Se eligió separar **Órdenes**, **Registrar lote** e **Historial**: permite encontrar el trabajo pendiente sin atravesar un formulario y conserva el circuito actual de planificación y consumo real.

## Experiencia

- Órdenes es la vista inicial. «Nueva producción» abre la planificación en la misma página. El enlace existente con `?recipe=` abre esa planificación con su receta.
- Formularios separados visualmente del seguimiento. Preparación y responsable usan el Autocomplete compartido; las alternativas obligatorias se distinguen de los ingredientes ya fijados por la receta.
- Órdenes con estado, responsable, cantidad, ubicación y vencimiento claramente agrupados. Iniciar y finalizar conservan las acciones y validaciones actuales.
- Registrar lote prioriza preparación, tandas y rendimiento. Insumos en filas con nombre y unidad, resumen lateral en escritorio y composición de una columna en móvil. Revisión de stock previa al guardado permanece obligatoria.
- Historial reúne órdenes terminadas y lotes registrados, distinguiendo ambos registros. Paginación contextual, visible solo cuando se necesita.
- Los borradores permanecen al cambiar de pestaña. Durante un envío o resultado incierto se bloquean cambios que puedan perder la operación. Las cantidades conservan precisión; solo se eliminan ceros finales innecesarios.
- Azul para selección y contexto, naranja para la acción principal, estados acompañados por texto. Controles de al menos 44 px y sin desbordamiento a 320 px.

## Límites

Sin migraciones, datos reales, cambios de permisos ni cambios a reservas, recetas, costos, revisión o idempotencia. El personal conserva su acceso a tareas propias; la administración conserva planificación y revisión. Sin commit ni push en esta etapa.

## Validación

Verificar el flujo de asignación y el borrador entre pestañas en navegador con una base descartable, los bloqueos durante operaciones y la disposición en 1440/1024/768/390/320 px. TypeScript, lint focalizado y regresiones modernas de producción. No agregar pruebas que solo comprueben clases o copien el marcado.

## Autorización de entrega

El 3 de noviembre de 2026 el usuario autorizó hacer commit y push de las mejoras de producción y de la asignación de horarios por varios días. Esta indicación reemplaza la restricción inicial de commit/push para estos cambios.
