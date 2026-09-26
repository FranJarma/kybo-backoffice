# Recetas y producción

Continuación autorizada del diseño de Kybo Operations. Integra el inventario existente sin importar datos del sitio anterior ni conectar servicios externos.

## Comportamiento

- Recetas de productos por unidad y preparaciones con rendimiento expresado en la unidad base del insumo preparado. Se elige un producto/insumo existente; sus ABM siguen disponibles.
- Cada línea permite un ingrediente predeterminado, alternativas y omisión si es opcional. Se pueden comparar costos con distintas selecciones.
- Cada cambio crea una versión inmutable. No se permite cambiar de destino ni crear dependencias circulares, tampoco a través de alternativas.
- Costo teórico de reposición: precios de insumos actuales y recetas de preparaciones, recursivamente. Precio desconocido es Pendiente, cero explícito es válido. No se presenta como rentabilidad neta.
- Registrar producción exige elegir una preparación, multiplicador, consumos reales, rendimiento real, lote y vencimiento opcionales. Una vista previa informa disponibilidad, faltantes y costo antes de confirmar.
- Se consumen lotes utilizables por vencimiento más próximo (FEFO), excluyendo bloqueados y vencidos. Se suman ingredientes repetidos antes de validar stock.
- Se registra solamente producción del día comercial de Salta en este incremento. No se estiman costos históricos retroactivos. Vencimiento informado debe ser posterior al día y no superar un vencimiento conocido de los lotes consumidos.
- Stock y costo se transfieren en una transacción: salidas de insumos y entrada del preparado. Valuación por promedio ponderado del inventario existente. El costo se distribuye sobre el rendimiento real; no se registra una segunda merma por esa diferencia.
- Si una receta consume un preparado, se descuenta ese preparado, sin volver a descontar su materia prima.
- Versiones, actor, selecciones, consumos por lote, rendimientos y costos quedan registrados. Cambios posteriores no alteran el historial.
- Confirmación idempotente y verificación de la vista previa bajo bloqueo: cambios de stock, receta o costos requieren revisar una nueva vista previa. Recarga/reintento seguro con la misma clave.
- Acceso admin/manager y controles de origen existentes. Staff no obtiene acceso administrativo adicional.

## Interfaz

Seguir prototipos 03/04: títulos y acciones alineados, fondo claro, paneles blancos, azul marino y naranja. Lista y detalle de recetas; formulario de producción con resumen lateral, errores concretos y confirmación deshabilitada con faltantes. Móvil sin desbordamiento horizontal.

Fuera de alcance: POS, empleados, integración Fudo/Neon externa, OCR, impresión, campañas y precios sugeridos. Se retoman en sus bloques correspondientes.
