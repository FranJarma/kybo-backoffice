# Menú lateral colapsable

Solicitud: aprovechar el espacio de trabajo colapsando el sidebar. Se aplica sobre la navegación existente y conserva los nombres de inventario recién aprobados.

Decisión de implementación: en escritorio (desde 1024 px), alternar el menú completo de 250/264 px y una columna de íconos de 72 px desde un botón en la barra superior. El modo compacto conserva nombres accesibles, ayudas al pasar el mouse/enfocar, sección activa, identificación del usuario y cierre de sesión. El contenido de la página permanece montado.

La elección se guarda en una cookie de interfaz `kybo-sidebar`, leída por los layouts del servidor para restaurar el ancho inicial sin cambiarlo después de hidratar. Sin cookie válida, se muestra expandido.

Una preferencia compartida del navegador con `useSyncExternalStore` conserva la última elección al restaurar layouts con props antiguos. Si el navegador bloquea la cookie, el cambio sigue funcionando durante la sesión. El enlace activo se mantiene visible desplazando exclusivamente el contenido interno de la navegación, también al cambiar el tamaño de la ventana.

En celular/tablet vertical se conserva el drawer completo; el punto de venta continúa usando ese acceso también en escritorio. Cambiar de ancho cierra el drawer al entrar en escritorio, conservando la preferencia compacta. Los permisos y rutas actuales se reutilizan.

Alcance: interfaz y preferencia local del navegador. Sin dependencias nuevas, datos de negocio, migraciones, commit ni push. Se conserva el trabajo previo de nombres de inventario.
