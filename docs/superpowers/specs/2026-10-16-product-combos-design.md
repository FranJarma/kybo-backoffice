# Combos que reutilizan productos y modificadores

Estado: diseño aprobado por el usuario. Implementación pendiente de revisión del plan.

## Objetivo y ejemplo

Crear «Combo waffle con gaseosa» sin volver a cargar ingredientes, cantidades ni mermas. El encargado vincula Classic y Salah al grupo «Waffle a elección» y las gaseosas existentes al grupo «Gaseosa a elección». Cada grupo exige una elección.

En la venta: Combo → Classic → masa chipá y demás modificadores existentes → gaseosa. Elegir Salah muestra los modificadores de Salah. Cambiar de producto reinicia la configuración anterior y exige completar la nueva.

El catálogo conserva las fichas y recetas originales. El combo referencia productos; no copia sus recetas. Los pedidos confirmados conservan las versiones y elecciones que tenían al venderse.

## Decisiones propuestas

- Incorporar el tipo de producto «Combo». Los productos actuales mantienen su funcionamiento.
- Un combo tiene nombre, foto, categoría, disponibilidad por sucursal/canal y precio propio por canal, reutilizando los campos del catálogo.
- En lugar de «Receta» y «Preparación», el combo tiene «Componentes» y «Costeo». La preparación y las ubicaciones provienen de cada producto elegido.
- Cada grupo tiene nombre, orden y productos permitidos. En esta primera versión se elige exactamente un producto por grupo, con una cantidad entera fija por unidad de combo. Un grupo de un solo producto representa un componente fijo.
- Los modificadores del producto elegido se reutilizan completos: predeterminados, mínimos, máximos, cantidades, mermas, instrucciones y recargos. No se configuran de nuevo en el combo.
- Se puede definir un adicional por opción del combo y canal, inicialmente cero. Se suman los recargos actuales de los modificadores. Las excepciones a esos recargos quedan fuera de esta primera versión.
- No se permiten combos dentro de combos ni referencias a sí mismo. No se convierte un producto con receta o historial en combo mediante un cambio silencioso de tipo.
- Los cambios de composición del combo se publican como versiones; editar un borrador no modifica la versión vendible.

## Precio y costo

Precio unitario del combo = precio base del combo + adicionales de las opciones elegidas + recargos de los modificadores de sus productos, multiplicados por la cantidad de cada componente. El precio individual del waffle o de la gaseosa no se agrega al precio del combo.

Todos los importes se calculan y validan en el servidor con la aritmética decimal existente. Se conserva la autorización actual para cambiar precios y la validación de precios/versiones desactualizados.

El costo es la suma de los costos de los componentes efectivamente elegidos y sus modificadores. El catálogo muestra el rango mínimo/máximo de configuraciones válidas en la sucursal seleccionada. Un costo desconocido sigue siendo pendiente, nunca cero.

Se reutiliza la carga conjunta de costos y se deduplican productos/recetas compartidos. La caché debe invalidarse también cuando cambien un producto, receta o modificador referenciado por un combo, además de los cambios de sucursal e inventario que ya corresponden.

## Modelo propuesto

1. Discriminador de tipo en productos: individual o combo, individual para todas las filas existentes.
2. Definición versionada del combo: producto propietario, versión, autor y fecha de publicación.
3. Grupos y opciones pertenecientes a esa versión: nombre/orden, cantidad fija, producto referenciado y adicionales por canal. Relaciones con claves foráneas y restricciones de cantidad, unicidad e importes no negativos.
4. Línea comercial de venta del combo: producto, cantidad, precio, total y versión del combo confirmada.
5. Líneas operativas hijas: producto realmente elegido, grupo/opción, cantidad, versiones de receta y modalidad de entrega, modificadores y componentes resueltos. Se vinculan a la línea del combo dentro del mismo pedido y sucursal.

La línea comercial contiene el importe cobrado. Las hijas se muestran como «Incluido», con importe comercial cero; contienen el consumo y la ejecución operativa. No deben interpretarse como productos regalados ni sumar nuevamente a los ingresos. Los reportes y las consultas de ventas deben distinguir líneas comerciales de componentes incluidos.

La cantidad operativa hija es cantidad de combos × cantidad fija del componente. Dos combos con elecciones diferentes se agregan como configuraciones diferentes al carrito. Solo se puede aumentar conjuntamente la cantidad cuando las elecciones coinciden.

## Flujo de catálogo y venta

### Catálogo

El encargado crea un producto de tipo Combo, carga sus precios y agrega grupos. Usa el Autocomplete existente para seleccionar productos del catálogo y definir adicionales opcionales. El formulario no solicita ingredientes ni mermas.

La publicación valida grupos completos, referencias activas, ausencia de ciclos y cantidades permitidas. La disponibilidad operativa se valida por sucursal y canal al configurar y confirmar la venta.

### Punto de venta

El combo abre un configurador con los grupos en orden. Elegir un waffle muestra el configurador de modificadores existente dentro de ese componente. Los componentes fijos también requieren completar sus modificadores obligatorios.

Antes de agregar, todas las elecciones deben ser válidas. El carrito y el detalle muestran una cabecera del combo con su precio y, debajo, el waffle, masa, extras y gaseosa elegidos. Los importes incluidos no se presentan como cargos adicionales.

El servidor recibe identificadores de opciones y selecciones, no ingredientes calculados por el navegador. Resuelve y valida toda la configuración dentro de la transacción de venta, con límites de tamaño y cantidad para evitar expansiones excesivas.

Si cambió una versión, disponibilidad o precio desde que se abrió el configurador, la operación se rechaza con una indicación para revisar el combo. Nunca se sustituye silenciosamente el producto o modificador elegido.

## Stock, comandas y trazabilidad

La línea comercial del combo no crea una reserva, consumo ni comanda propia. Solo sus componentes operativos pasan por la reserva y el cumplimiento existentes.

Cada componente mantiene su modalidad: el waffle con receta consume al completar su preparación; una gaseosa de reventa consume al entregarla. Se respetan la ubicación de consumo y la sucursal de cada operación.

Las tareas de cocina muestran el nombre del componente, sus modificadores y el combo al que pertenece. La entrega muestra también los componentes de reventa. Actualmente la publicación de comandas selecciona líneas con receta: no se debe inventar una receta para que una gaseosa aparezca en una estación. En esta primera versión las gaseosas se gestionan en el panel de entrega existente.

El estado visible del combo se deriva del estado de todos sus componentes; no puede mostrarse entregado mientras falte uno. Se mantiene el avance independiente entre estaciones.

La anulación de la venta libera las reservas pendientes de los componentes una sola vez. Lo ya preparado o entregado sigue las reglas actuales de resolución física: reembolsar dinero no devuelve ingredientes automáticamente. Las devoluciones de reventa siguen vinculadas al componente y lote original. No se incorpora una nueva política de reembolsos parciales por componente.

La auditoría permite conocer qué combo se vendió, qué productos y modificadores se eligieron, qué versiones se usaron, quién confirmó y qué movimientos de stock se produjeron. Las recetas nuevas afectan pedidos futuros, no los ya confirmados.

## Integración con el repositorio actual

- `src/db/business-schema.ts`, nuevos esquemas de combos y `src/db/sales-schema.ts`: tipo, versiones y relación comercial/operativa. Migración posterior a `0017_username_login`, preservando los cambios locales pendientes.
- `src/components/catalog-manager.tsx` y componentes de productos: formulario del combo y reutilización de tabs/autocomplete.
- `src/components/sales/product-configurator.tsx`, carrito y detalle: selección anidada y presentación de precios incluidos.
- `src/modules/sales/validation.ts` y `service.ts`: entradas discriminadas para producto/ combo, expansión validada y guardado atómico.
- `src/modules/sales/queries.ts`, `reservation.ts`, preparación y cumplimiento: separar el precio comercial de las líneas físicas y conservar agrupación visible.
- `src/modules/catalog/product-costs.ts` y caché: rango de costos del combo sin recálculos por interacción irrelevante.

No se requiere volver a registrar ningún waffle, gaseosa, receta o grupo modificador existente. No se toca el `.env` ni se incluye la contraseña de Abi en archivos. No se hace commit ni push como parte de esta implementación sin una nueva solicitud.

## Verificación y criterios de aceptación

1. Crear el combo con Classic/Salah y gaseosas existentes sin ingresar ingredientes.
2. Elegir Classic/masa chipá y Salah/masa común reutilizando sus grupos obligatorios y opcionales.
3. Verificar precio base, adicionales por canal, recargos de modificadores y cantidades múltiples; cobrar exactamente una vez.
4. Rechazar opciones de otro grupo, modificadores de otro producto, referencias archivadas, versiones desactualizadas y componentes no disponibles en la sucursal/canal.
5. Confirmar el consumo exacto con mermas de las versiones seleccionadas y sin movimientos del padre comercial; no duplicar reservas ante reintentos.
6. Completar cocina y entregar gaseosa por separado, mostrando correctamente el estado global del combo.
7. Anular antes y después de preparación/entrega, comprobando reservas, resolución física y ausencia de devoluciones automáticas incorrectas.
8. Modificar posteriormente la receta de Classic: nuevos combos toman la versión actual, ventas previas mantienen sus snapshots.
9. Validar rango de costos por sucursal, costos pendientes e invalidación de caché al cambiar componentes.
10. Probar regresión de ventas individuales, mesas, pagos, comandas y acceso de empleados; verificar UI en escritorio y móvil.

## Revisión del diseño

Se contrastó con la implementación actual: las líneas de venta tienen una sola receta y modalidad física; las reservas, tareas y devoluciones se vinculan a esas líneas. La separación propuesta permite reutilizarlas y exige adaptar explícitamente las consultas comerciales y los estados agregados. No es suficiente agregar opciones de producto al editor de modificadores actual.

La alternativa de copiar ingredientes a un modificador se descarta porque incumple el objetivo. La alternativa de cobrar todos los componentes como productos independientes no conserva el precio propio ni la identidad del combo. Se propone mantener una cabecera comercial con componentes operativos vinculados.
