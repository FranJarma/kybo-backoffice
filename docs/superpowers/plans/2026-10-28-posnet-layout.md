# Orden del paso Posnet en el cierre

Pedido: mejorar la organización del paso Posnet en PC con una jerarquía clara y espacio útil.

Propuesta de implementación: franja superior para comparar registrado en Kybo, total de lotes y diferencia; debajo, dos columnas equilibradas para datos/evidencia y comprobantes de la jornada. Los campos se alinean y la foto queda después de los datos. En dispositivos estrechos se conserva un orden continuo con importes primero. El cuerpo del cierre se desplaza manteniendo encabezado, pasos y acciones visibles.

- [x] Probar el orden de datos/evidencia, legibilidad del listado, comparación inicial y acciones visibles al desplazarse.
- [x] Reorganizar el formulario y sus estilos manteniendo cálculos, archivos, referencias y borradores existentes.
- [x] Verificar en PC, tablet y celular; comprobar lotes múltiples, foto, diferencias, permisos y foco del efectivo.

Sin migraciones, registros financieros reales ni publicación automática de estos cambios.

Resultado: comparación de tres importes en una franja superior; formulario y comprobantes en columnas equilibradas, con letras y referencias más legibles. Se eliminaron encabezados redundantes y el recuadro lateral que mezclaba totales, instrucciones y cobros. Los cuatro campos del lote tienen controles de la misma altura, la evidencia aparece después y las opciones secundarias tienen menor peso. El listado identifica comprobantes faltantes y muestra un estado vacío explícito cuando corresponde. En pantallas estrechas se apilan las secciones y los importes siguen primero.

El contenedor del modal usa encabezado/pasos/pie fijos y un cuerpo con desplazamiento propio. Cambiar de paso vuelve al inicio del cuerpo y conserva el foco del efectivo ya solicitado. Los totales se calculan con la misma lógica previa, incluyendo devoluciones y cantidades de operaciones; los estados distinguen falta de datos, diferencias, coincidencia y revisión pendiente. Se mantienen los archivos privados, sus controles y las claves de cada lote.

Verificación: prueba roja observada por ausencia de la nueva comparación. Aprobaron **34 pruebas de interfaz de Caja**, incluyendo los tres anchos de PC 1024/1366/1920, los controles de efectivo en cinco tamaños y el circuito de varios lotes con fotos, revisión y eliminación. Otras cuatro verificaciones finales aprobaron encabezado completo, disposición y textos de los lotes. TypeScript, ESLint de archivos afectados y comprobación del diff aprobados. Se inspeccionaron capturas de PC y celular. No hubo comandos financieros reales, migraciones, commit ni push.
