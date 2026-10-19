# Grupos de productos reutilizables en combos

Estado: diseño aprobado por el usuario; implementación en la rama `codex/product-combos`. La migración de desarrollo queda como paso explícito separado.

## Objetivo

Registrar una sola vez «Gaseosa a elección» con Pepsi, Pepsi Max y 7up, y usarlo en el combo de waffle, el de superpancho y futuros combos. Cada producto mantiene su artículo, receta, modificadores, mermas, costo y funcionamiento de inventario. Compartir un grupo no duplica productos ni crea movimientos de stock.

Cada combo conserva su cantidad y sus adicionales por opción/canal. Por ejemplo, el mismo grupo puede representar una gaseosa en un combo individual y dos unidades del producto elegido en uno para compartir. Se mantiene la regla actual: una elección por grupo, con cantidad fija; elegir dos sabores diferentes exige dos grupos distintos y queda fuera de esta ampliación.

Las modificaciones del grupo compartido se publican como versiones. Un combo avisa que hay una actualización disponible y solo la adopta cuando el encargado la revisa y publica sus componentes. Las ventas confirmadas mantienen las versiones y elecciones originales.

## Estado actual y alternativa elegida

`comboGroups` y `comboOptions` pertenecen a una versión concreta de un combo. Actualmente no tienen una identidad compartida ni una versión de origen. Los grupos modificadores ya usan identidad estable, versiones y revisión explícita de cambios, pero sus opciones representan componentes o instrucciones, no productos completos.

Se propone agregar un catálogo independiente de grupos de productos y vincular sus versiones a las definiciones publicadas de combos. Se conserva la definición concreta del combo que ya usan las ventas y el costeo.

Copiar un grupo como plantilla facilitaría la primera carga, pero perdería el vínculo para detectar futuras actualizaciones. Leer siempre la última versión del grupo cambiaría combos publicados sin revisión. El vínculo a una versión concreta evita ambos problemas.

## Experiencia de usuario

### Productos → Grupos de opciones

El acceso actual «Modificadores» pasa a llamarse «Grupos de opciones», con dos tabs de navegación: «Modificadores» y «Productos para combos». Se conserva `/products/modifiers` para los modificadores y se agrega `/products/combo-groups` para los grupos de productos. Ambos mantienen el contexto de Productos, el acceso seleccionado en el sidebar y los breadcrumbs correspondientes; los enlaces existentes siguen funcionando.

El listado de productos para combos permite buscar, crear, editar y archivar grupos. Cada grupo muestra nombre, cantidad de productos y versión. El formulario solicita nombre y productos mediante el Autocomplete existente. No solicita ingredientes, cantidades de receta, mermas, precios de venta ni costos de compra.

Solo se pueden agregar productos individuales activos. Un producto no puede repetirse dentro del grupo. Un combo no puede ser una opción. La disponibilidad por sucursal/canal se informa y se valida en la venta; el catálogo de grupos es compartido entre sucursales y no habilita productos automáticamente.

### Componentes de un combo

Junto a «Agregar grupo» aparece «Usar grupo existente». Se busca el grupo con el Autocomplete y se añade su versión actual al borrador del combo. Se conserva la posibilidad de grupos propios para componentes fijos o casos que no se compartirán.

Un grupo compartido muestra su nombre y versión. El combo configura «Unidades por combo» y adicionales por producto/canal, inicialmente cero. Sus productos se administran desde el grupo compartido; no se permite cambiar silenciosamente su lista desde un combo. El nombre del grupo proviene de la versión elegida.

Los grupos propios existentes ofrecen «Guardar como grupo reutilizable». Esta acción crea explícitamente el grupo compartido a partir de sus productos y lo selecciona en el borrador; sus cantidades y adicionales siguen en el combo. Se informa que el grupo fue creado y que falta publicar los componentes para vincularlo al combo. Si se abandona el borrador, el nuevo grupo sigue disponible en el catálogo. No se combinan grupos automáticamente solo porque sus nombres coinciden.

El encargado puede usar esta acción con «Gaseosa a elección» del combo de waffle y luego seleccionarlo en el de superpancho. No se vuelven a cargar las gaseosas ni sus costos.

### Revisión de actualizaciones

Si existe una versión más nueva, se muestra «Hay una actualización disponible» con «Revisar cambios». La revisión enumera productos agregados y quitados y cambios del nombre del grupo. Aplicar incorpora la versión al borrador, conserva cantidad y adicionales de los productos que permanecen y asigna adicionales cero a los nuevos. Los productos quitados desaparecen del borrador revisado.

Hasta «Publicar componentes», la versión vendible del combo permanece intacta. Cancelar la revisión o cerrar el modal no cambia la publicación. Las actualizaciones nunca se aplican en segundo plano. Se puede conservar una versión anterior activa sin forzar su actualización al editar otro dato del combo.

Archivar un grupo impide nuevas asignaciones y nuevas versiones, pero conserva su historial y los combos que ya lo usan. Esos combos pueden seguir usando y republicando la misma versión mientras sus productos sean válidos. Se identifica el grupo como archivado en el editor. Archivar un grupo no archiva ni deshabilita sus productos.

Los formularios mantienen el estilo de tabs tipo enlace, el tamaño amplio y el desplazamiento de los modales actuales. Guardar/publicar y los errores usan las notificaciones existentes sin requerir desplazarse hacia el encabezado. Los controles deben funcionar con teclado y en móvil.

## Modelo y publicación

Se agrega un esquema específico de grupos de productos con tres tablas:

- `product_option_groups`: identidad estable, nombre vigente, revisión, archivo y fecha de creación.
- `product_option_group_versions`: identidad de versión, grupo propietario, número, nombre, autor y fecha de publicación. Unicidad por grupo y número, y clave única de identidad/propietario para las referencias compuestas.
- `product_option_group_products`: versión, producto y posición. Unicidad de producto y posición dentro de una versión; referencia a productos existentes.

`combo_groups` incorpora `source_group_id` y `source_group_version_id`, ambos anulables para los grupos propios. Una restricción exige ambos o ninguno; una clave foránea compuesta exige que la versión pertenezca al grupo indicado. Una versión de combo no puede vincular dos veces el mismo grupo compartido; dos grupos propios diferentes pueden seguir referenciando el mismo producto.

Al publicar un combo, el servidor verifica el vínculo y que sus opciones coincidan exactamente con los productos de esa versión, y materializa las opciones con los adicionales del combo en `combo_options`. No confía en la lista enviada por el navegador. El orden del grupo compartido proviene de su versión; el orden de los grupos y sus cantidades pertenece al combo.

Se conserva el formato de ejecución de `loadCombo`: identidad y versión del combo, grupos concretos y opciones concretas. Se añaden metadatos de origen y versión actual para el editor, sin cambiar las identidades de opciones ya publicadas. Las consultas del catálogo y del editor leen los metadatos actuales por lotes, evitando una consulta por grupo.

Crear, editar, archivar y publicar requieren los permisos actuales de administración de catálogo, validación en servidor, auditoría e idempotencia con `requestId` y huella del contenido. Publicar una revisión desactualizada devuelve conflicto sin escribir parcialmente. Se reutiliza el bloqueo de publicación del grafo existente para coordinar grupos, combos y referencias a productos.

Los límites iniciales son nombre de 1 a 100 caracteres y de 1 a 50 productos únicos por grupo; se mantienen los límites existentes de 10 grupos y cantidad de 1 a 99 unidades por componente de combo. Publicar valida UUID, propiedad de versiones, referencias activas y adicionales no negativos por canal, con cero por defecto.

## Ventas, inventario y costeo

El punto de venta continúa leyendo la versión publicada del combo. No consulta la última versión del grupo para sustituir opciones. Una nueva publicación del grupo no invalida por sí sola un carrito basado en un combo que sigue sin cambios. Publicar una nueva versión del combo conserva el control actual de configuración desactualizada al confirmar.

Los productos elegidos mantienen sus modificadores actuales al configurar una venta y las versiones físicas se fijan al confirmarla, como ahora. Las ventas confirmadas no se vuelven a resolver al editar un grupo. La línea comercial, sus hijos operativos, reservas, preparación, despacho y consumos conservan su comportamiento.

El costeo sigue usando el inventario/costo de referencia de la sucursal seleccionada y las opciones concretas de la versión del combo. Editar un grupo compartido no cambia el rango de un combo que todavía usa una versión anterior. Publicar los componentes actualizados invalida el costo del combo mediante el mecanismo actual. No se recalcula por cada interacción de la interfaz ni se utiliza el precio de venta como costo.

Los productos archivados o no disponibles siguen las validaciones actuales de publicación y venta; la versión compartida no permite saltarlas. Los costos pendientes conservan su estado y sus explicaciones. No se crean existencias ni se modifican ubicaciones al asignar un grupo.

## Compatibilidad y alcance de entrega

La migración posterior a `0018_product_combos` agrega las tablas y los vínculos anulables. Los grupos, versiones, opciones y ventas existentes mantienen sus identidades y valores, y quedan inicialmente como grupos propios. No se publica ninguna nueva versión de combo ni se deduplica información como efecto de la migración.

Se entrega el script específico y se prueba en bases descartables. La implementación preserva `.env` y los datos de desarrollo; la aplicación a esa base se trata como un paso explícito, no como una consecuencia de abrir el catálogo. Este trabajo no incluye un nuevo commit/push salvo solicitud del usuario.

La adaptación se concentra en `src/db/combo-schema.ts` y el nuevo esquema de grupos, `src/modules/combos`, nuevos servicios/API para grupos de productos, `src/components/products/combo-tab.tsx`, la pantalla de administración y `src/lib/navigation.ts`. Se leen las guías instaladas de Next.js antes de escribir componentes, rutas o handlers. Se reutilizan componentes, permisos, decimales y notificaciones existentes.

No se incorporan combos anidados, productos duplicados, nuevas reglas de recetas, cambios en los precios individuales, un sistema genérico de grupos para todos los dominios ni actualización masiva automática de combos.

## Criterios de aceptación y verificación

1. Crear «Gaseosa a elección» una sola vez y asignarlo a dos combos, sin recrear productos, artículos ni recetas.
2. Configurar cantidades y adicionales diferentes por combo, conservándolos separados del grupo compartido.
3. Convertir un grupo propio existente en reutilizable conservando opciones, cantidad y adicionales al publicar; cancelar conserva la publicación anterior.
4. Publicar una nueva versión con productos agregados/quitados; ambos combos avisan. Actualizar y publicar uno no cambia el otro ni las ventas existentes.
5. Conservar adicionales por producto al actualizar, usar cero en nuevas opciones y mostrar la comparación antes de publicar.
6. Rechazar referencias a combos, productos repetidos o archivados, grupos vacíos, versiones de otro grupo, productos inyectados, adicionales negativos, reintentos con contenido diferente y revisiones desactualizadas; no dejar escrituras parciales.
7. Archivar un grupo: desaparece de nuevas selecciones, permanece en los combos existentes y sus versiones siguen disponibles para el historial y la ejecución vigente.
8. Repetir una solicitud válida no duplica grupos, versiones ni auditorías. Publicaciones concurrentes se serializan y los permisos se comprueban en servidor.
9. Verificar selección de productos y modificadores, precio y costo del combo, stock y comandas con grupos propios y compartidos; confirmar que se conserva una venta anterior después de actualizar.
10. Verificar navegación y enlaces anteriores, escritorio/móvil, teclado, búsqueda con un solo control, notificaciones y solicitudes de costo estables ante interacciones sin cambios.
11. Ejecutar pruebas de integración de grupos/publicación, regresiones de combos y modificadores pertinentes, controles de tipos/lint y pruebas de navegador con base descartable. Verificar la migración sobre datos de combos existentes.

## Revisión del documento

Se contrastó con el esquema actual de combos y el servicio de modificadores. El vínculo por versión permite mantener el cálculo y la ejecución de combos existentes. La lista compartida y los adicionales locales tienen responsabilidades separadas. La conversión de datos anteriores requiere una acción explícita para evitar fusionar grupos que solo comparten un nombre. La regla actual de una elección con cantidad fija queda expresada para no prometer dos sabores distintos en un grupo.
