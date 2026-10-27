# Mínimos de reposición en Inventario

El usuario pidió sacar la administración de mínimos del punto de venta y ubicarla en un lugar propio del Encargado o Administrador. La decisión de implementación es una pantalla «Inventario y compras → Mínimos de reposición», en `/inventory/replenishment`.

Se considera una pantalla propia frente a un tab de existencias o Configuración general: las reglas se revisan con el negocio, por artículo y ubicación, y merecen un acceso directo dentro del trabajo de inventario. Mantener el editor en el punto de venta no cumple la separación solicitada.

La página muestra las reglas activas e inactivas de la sucursal seleccionada y permite agregar, editar y desactivar con el formulario existente. Se conservan unidades base, validaciones, revisiones y reintentos. No se modifican reglas guardadas, cantidades, esquema ni lógica de sugerencias de traslado.

El menú y la página se reservan al Encargado y Administrador mediante los controles existentes. El servidor sigue rechazando escrituras del Personal, incluso accediendo directamente. El punto de venta conserva los avisos y acciones operativas, sin editor de reglas. Operación del día enlaza a la nueva página.

Diseño: jerarquía y colores existentes de Kybo, controles táctiles y lista legible en tablet. Carga, error y ausencia de reglas se distinguen. Una carga fallida no ofrece una lista vacía como si no hubiera configuración.
