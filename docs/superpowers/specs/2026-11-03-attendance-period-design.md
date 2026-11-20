# Asignación de horarios por período

## Acuerdo

El usuario pidió asignar el mismo turno durante varios días o semanas y eligió conservar los horarios y francos existentes, mostrando las fechas omitidas. Se implementa la propuesta presentada: persona, turno habitual, fechas desde/hasta, días de la semana, resumen antes de confirmar y edición individual posterior.

## Enfoque

La carga por período es la opción elegida frente a seleccionar y guardar cada fecha por separado. La copia de la semana anterior se conserva para repetir una planificación ya existente. No se introduce una recurrencia indefinida: se crean asignaciones independientes en las tablas actuales.

## Experiencia

- Acción «Asignar varios días» en Planificación semanal.
- Autocomplete compartido para empleado y turno habitual activo. El horario y la pausa se muestran juntos; los cambios particulares siguen disponibles al editar cada día.
- Período con fechas desde/hasta y días de la semana visibles. Atajos para la semana en pantalla y la siguiente. Como decisión de implementación, se permiten hasta 90 días por operación y se incluyen inicialmente los siete días, claramente seleccionados y ajustables antes de revisar.
- Vista previa consultada al servidor: cada fecha indica «Se agregará» o por qué se omite. Un turno, franco o fichaje ya existente se conserva. También se omiten superposiciones con turnos que cruzan medianoche, incluso en otra sucursal, sin exponer sus detalles.
- Cambiar empleado, turno, período o días invalida la vista previa. No se confirma una vista previa vencida o pendiente.
- Confirmación única con número de horarios por agregar. Se vuelve a comprobar todo al guardar: si otra persona ocupó una fecha desde la revisión, se conserva y se informa en el resultado final.
- El resultado enumera las omisiones reales, incluso si difieren de la vista previa, y evita un segundo envío accidental. La edición por día y la copia de semana siguen funcionando.

## Integridad

Solo encargado y administrador con acceso vigente pueden consultar la vista previa y asignar. La persona debe tener cuenta personal activa, participación habilitada y acceso a la sucursal. No se habilitan nuevos permisos para la cuenta compartida del local.

El turno se toma de su configuración vigente, con revisión comprobada entre vista previa y confirmación. Fechas y días se validan en servidor. Se usan los bloqueos e idempotencia existentes de Asistencia, una transacción para las inserciones y auditoría, y escrituras agrupadas para evitar una petición o varias consultas por día. Se conservan la zona horaria de la sucursal y las pausas de la plantilla.

Sin migraciones, escrituras de prueba en Neon, cambios al .env, commit ni push. La app real continúa en localhost:3000. Las pruebas que registran horarios usan una base descartable en otro puerto.

## Verificación

Períodos de una y varias semanas; selección de días; fechas inválidas y límite; preservación de horarios, francos y fichajes; cruces de medianoche; concurrencia entre vista previa y confirmación; turno modificado/inactivo; permisos y sucursales; reintento sin duplicados; resultado de todas las fechas ocupadas; y pantalla adaptable con controles accesibles.

## Autorización de entrega

El 3 de noviembre de 2026 el usuario autorizó hacer commit y push de las mejoras de producción y de la asignación de horarios por varios días. Esta indicación reemplaza la restricción inicial de commit/push para estos cambios.
