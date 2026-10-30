# Sucursales y ubicaciones — diseño

El usuario aprobó aplicar directamente la propuesta el 29/10/2026: cabecera con la sucursal seleccionada y pestañas Ubicaciones, Equipo y accesos y Productos, con mayor contraste y jerarquía. Se omite la propuesta visual previa por elección explícita del usuario.

- Seleccionar la sucursal actual al ingresar; si ya no existe, usar una sucursal accesible. La selección administrativa de esta pantalla no cambia la sucursal operativa del encabezado.
- Mostrar nombre, código y zona horaria de forma legible. El selector reutiliza SearchCombobox.
- Ubicaciones como listado claro con nombre, estado y acción secundaria de archivar, confirmada y con sus restricciones actuales. Crear ubicación o sucursal abre un formulario puntual; no ocupa media pantalla permanentemente.
- Equipo y accesos con estado explícito, rol local y permiso de catálogo global separados. Mostrar correctamente los administradores que acceden a todas las sucursales.
- Productos conserva el Autocomplete y la habilitación, agotado temporal, despacho y composición de reventa; separar visualmente ajustes de sucursal de los globales.
- Pestañas accesibles por teclado; conservar borradores al cambiar pestañas; impedir operaciones con datos de otra sucursal o cargas incompletas. Formularios con campos obligatorios y respuesta de guardado.
- Azul para navegación/selección, naranja para acciones principales; texto oscuro, superficies y separadores de contraste suficiente. Adaptar filas y formularios a tablet y móvil.

Alternativas: se eligieron pestañas frente a secciones desplegables porque delimitan mejor las tareas. Se conserva el sistema visual existente, sin dependencias ni cambios de esquema.

No aplicar migraciones, modificar permisos reales ni registrar datos de negocio durante la verificación. Mantener los cambios pendientes de Asistencia y de otros chats. Sin commit ni push.
