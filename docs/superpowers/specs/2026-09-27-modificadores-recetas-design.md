# Grupos modificadores y recetas configurables

Fecha: 27 de septiembre de 2026. Proyecto: Kybo Operations.

Estado: diseño técnico para revisión, basado en el modelo conversado y aprobado por Francisco. La implementación y el plan de ejecución aún no están realizados. Este bloque precede a «stock por ventas» en el roadmap.

## Objetivo y alcance

Registrar cada producto una sola vez y construir su composición según opciones reutilizables. La misma composición alimentará el costeo, las instrucciones de preparación y, en el bloque posterior, el consumo de inventario. El dominio permite bebidas, hamburguesas, panchos y otros productos gastronómicos, sin tipos específicos por rubro.

Esta entrega incluye administración de grupos, configuración en recetas de productos, simulación de costos, selección en ventas y visualización en comandas. Mantiene precios por canal e históricos. No introduce multiempresa, combos de productos anidados, reglas condicionales entre grupos, cobros Mercado Pago ni movimientos de inventario por ventas. Las preparaciones y sus producciones mantienen su circuito actual.

La referencia inspeccionada es el ZIP 0.5.0, especialmente `business-schema.ts`, `recipe-schema.ts`, `sales-schema.ts` y el servicio de recetas. No se ha inspeccionado la base instalada por Francisco ni se presume que esté vacía.

## Modelo relacional

Se conservan `products`, `ingredients`, `product_prices`, `recipes`, `recipe_versions`, `recipe_lines`, `recipe_options`, `sale_lines` y el libro de movimientos de inventario. No se generan productos por combinación.

| Tabla propuesta | Relaciones y responsabilidad |
| --- | --- |
| `modifier_groups` | Identidad del grupo, nombre, revisión actual y archivo. |
| `modifier_group_versions` | FK al grupo; número de versión, nombre histórico, autor y fecha. Cada versión publicada es inmutable. |
| `modifier_options` | FK a versión de grupo; clave estable dentro del grupo, nombre, orden y tipo `composition` o `instruction`. La clave permite comparar versiones. |
| `modifier_option_components` | FK a opción e insumo; cantidad por elección en la unidad base del insumo, con nombre/unidad históricos. |
| `recipe_modifier_groups` | FK a versión de receta y versión de grupo; orden, nombre visible, mínimos/máximos y factor de porción. |
| `recipe_modifier_options` | FK a asignación de grupo y opción; habilitación, cantidad predeterminada, máximo por opción y modo de composición `inherit` o `override`. |
| `recipe_modifier_option_components` | Composición completa que reemplaza la heredada cuando el modo es `override`. No se suma a la original. |
| `recipe_modifier_option_prices` | FK a opción configurada en receta; canal y recargo no negativo. Único por opción configurada y canal. |
| `sale_line_modifiers` | FK a línea vendida y opción configurada; cantidad elegida, nombre de grupo/opción, instrucción y recargo unitario históricos. |
| `sale_line_components` | FK a línea vendida e insumo; cantidad resuelta por unidad de producto y nombre/unidad históricos. Una fila agregada por insumo y línea. |

Las cantidades usan `numeric(18,6)` y los importes comerciales `numeric(14,2)`, coherentes con la base existente. Las operaciones aritméticas usan la utilidad decimal exacta del proyecto. Los IDs históricos se conservan con borrado restringido.

Se agrega `recipe_versions.composition_model`, con valor inicial `legacy` para recetas existentes y `configurable` para versiones convertidas. En `sale_lines`, `composition_status` distingue `legacy_unknown` para ventas anteriores, `unavailable` para ventas nuevas sin receta y `resolved` cuando se guardó la composición. La falta de filas de componentes no basta para inferir un consumo cero.

Las FK compuestas garantizan que una opción asignada pertenece a la versión de grupo vinculada. En ventas, una opción seleccionada debe pertenecer a la versión de receta de esa línea. Se agregan índices para las FK consultadas, unicidad de versión por grupo, clave de opción por versión, grupo por versión de receta, opción por asignación y componente por opción. La misma versión de receta usa un grupo una sola vez; dos funciones distintas requieren dos grupos explícitos.

Las reglas de suma y pertenencia que abarcan varias filas se validan en servidor dentro de la transacción de publicación o venta. El cliente nunca determina el precio ni la composición aceptados.

## Selección y composición

Para cada grupo, mínimo y máximo cuentan unidades seleccionadas, incluyendo repeticiones. Las cantidades de selección son enteros; cero significa no seleccionado. Un grupo obligatorio tiene mínimo mayor que cero. La repetición se expresa con el máximo de cada opción. La suma predeterminada debe cumplir los límites y solo contener opciones habilitadas.

Una opción de composición puede aportar varios insumos. «Sin perlas» puede aportar una lista vacía y tener costo cero. Una opción de instrucción, como «bien cocido», no admite componentes ni excepciones de composición. Su texto debe llegar a cocina; se mantiene independiente del costo y del recargo.

La parte fija contiene solamente los ingredientes que siempre se incluyen. Una alternativa, como elegir leche, es un grupo; su ingrediente no vuelve a figurar en la parte fija. Un extra agrega su composición. No se usan cantidades negativas para modelar quitas: un componente que se puede omitir se configura como elección opcional o con opción vacía.

El factor de porción de la asignación multiplica todos los componentes heredados del grupo. Si una opción usa `override`, sus filas representan cantidades finales por elección para ese producto y no reciben nuevamente ese factor. El administrador ve claramente cuándo dejó de heredar.

La cantidad final por unidad de producto es la suma de ingredientes fijos más las composiciones efectivas multiplicadas por las cantidades elegidas. Luego se agrupa por insumo. La cantidad de unidades vendidas multiplica ese resultado una sola vez. La selección conserva su procedencia para explicar extras aunque sus ingredientes se agreguen en el resumen.

No se elimina un ingrediente solo por aparecer en dos fuentes: podría ser legítimo, como queso incluido y queso extra. El editor advierte coincidencias entre parte fija y grupos y muestra la composición final para detectar duplicaciones de configuración.

## Costos y precios

El simulador y la venta utilizan un único resolvedor de selección y composición. Simular no escribe ventas ni mueve stock.

El costo de reposición se calcula con los costos actuales de insumos; para preparados se reutiliza el cálculo de su receta y rendimiento. Los costos desconocidos permanecen `null`; se muestra el subtotal conocido y el detalle faltante, sin presentar costo total ni margen completos. Una opción vacía cuesta cero de manera explícita.

El precio por unidad es el precio base del producto en el canal más los recargos de las opciones elegidas. Recargo cero no implica costo cero. Una opción habilitada necesita un recargo explícito, incluso cero, en cada canal en que se venda el producto. La ausencia se muestra como «Sin precio» y bloquea esa selección para ese canal; no se hereda silenciosamente otro canal. Los ajustes manuales conservan los permisos y motivos vigentes.

Los recargos forman parte de la versión de receta. Cambiarlos publica una nueva versión. Cambiar un grupo compartido crea una versión nueva de grupo: los productos existentes siguen vinculados a la anterior. Adoptar la nueva versión muestra diferencias y publica una nueva receta por producto, con revisión explícita de precios y excepciones.

La composición de venta no es una prueba de consumo ni un costo real. El costo real se fijará junto al movimiento de inventario en la entrega posterior, usando su política de valuación. No se presenta como ganancia neta la diferencia entre precio y costo de ingredientes.

## Flujos de administración, venta y cocina

Administrador y encargado gestionan grupos y recetas con las capacidades actuales de catálogo. El personal puede elegir modificadores habilitados al vender y consultar las instrucciones de preparación, sin acceder a costos.

En Productos y recetas se agrega la gestión de grupos reutilizables. Su editor permite opciones y componentes, archivo e historial. El editor de producto distingue parte fija y grupos, muestra reglas de selección, porciones y recargos por canal. El simulador conserva controles para comparar combinaciones, con desglose por fuente y faltantes.

Al agregar un producto configurable al carrito se muestra un panel adaptado a escritorio y celular. Muestra obligatorios pendientes y total actualizado. Configuraciones distintas usan renglones separados; al aumentar la cantidad se repite toda la configuración de ese renglón. Se puede editar antes de confirmar.

Al confirmar, el servidor valida versiones, opciones, permisos y precios; si hubo cambios relevantes, devuelve conflicto para revisar el carrito. Venta, selección, composición resuelta y publicación de comandas se guardan atómicamente. Se conserva el mecanismo existente de idempotencia y comparación de contenido: un reintento idéntico devuelve la venta original.

Las comandas muestran nombres de opciones, cantidades, instrucciones y observaciones. El producto conserva su estación asignada; un extra no crea otra tarea ni altera por sí solo el ruteo. La edición del catálogo no cambia las comandas históricas.

Archivar un grupo impide nuevas asignaciones, pero no invalida versiones ya vinculadas a productos. Retirar una opción del menú exige publicar la configuración del producto correspondiente. Se muestra qué productos siguen utilizándola. Un insumo archivado bloquea nuevas ventas de composiciones que lo requieren; el historial sigue consultable.

## Transición de recetas existentes

La migración SQL es aditiva. No elimina tablas, reinicia la base ni reinterpreta ventas históricas. Las recetas anteriores siguen usando el comportamiento vigente hasta que se revisen.

El editor ofrece convertir una receta de producto en una nueva versión configurable. Las líneas simples obligatorias quedan fijas; alternativas y opcionales proponen grupos con las cantidades existentes. La primera alternativa actualmente usada se propone como predeterminada, incluso en líneas opcionales, para conservar el costo inicial. El usuario revisa nombres comerciales, reglas, recargos y reutilización de grupos antes de publicar.

En versiones convertidas solo se admiten líneas fijas con una opción obligatoria; las elecciones se expresan con los nuevos grupos. Las líneas convertidas se retiran de la parte fija de esa nueva versión. Esto evita que el resolvedor ejecute simultáneamente las alternativas antiguas y las nuevas para la misma función.

Los recargos no se deducen de costos ni se inventan durante la conversión. Deben completarse explícitamente. Los productos sin receta siguen el flujo actual y se señalan como composición no disponible; no se les asigna consumo cero. Los comprobantes, ventas y producciones anteriores mantienen sus referencias originales.

En una venta nueva con receta `legacy`, el resolvedor conserva la primera alternativa de cada línea, como el comportamiento predeterminado actual, y guarda esa composición. El POS informa que las variantes comerciales requieren convertir la receta. No se reconstruye retrospectivamente la composición de ventas antiguas a partir de supuestos.

## Verificación necesaria

1. Un producto con tapioca y el mismo con explosivas generan composiciones y costos distintos sin duplicar la ficha del producto.
2. Una hamburguesa puede elegir pan, proteína, extras repetidos e instrucción de cocción; los límites se aplican en servidor.
3. Una opción con varios componentes, un factor de porción y una excepción completa resuelven cantidades exactas sin aplicar el factor dos veces.
4. Insumo fijo más extra del mismo insumo conserva ambas cantidades legítimas; convertir una línea variable no mantiene una copia fija.
5. Selecciones inválidas, opciones ajenas, precios faltantes, insumos archivados y datos manipulados son rechazados sin escritura parcial.
6. Costos desconocidos no se convierten en cero; recargo cero, composición vacía y costo pendiente permanecen distinguibles.
7. Nueva versión de grupo o receta no modifica ventas previas; el cambio concurrente obliga a revisar y los reintentos no duplican operaciones.
8. Cocina ve las opciones correctas de cada renglón y el personal no recibe costos en sus respuestas.
9. Recetas, producciones y ventas antiguas continúan funcionando después de una migración ensayada sobre una copia de datos.
10. La conversión revisada conserva cantidades y costo de la selección predeterminada con los mismos precios de insumos.

La implementación deberá verificar dominio, migraciones, permisos y recorridos en navegador; validar concurrencia con conexiones PostgreSQL independientes. Los casos que requieren Neon y dispositivos reales se distinguirán de las pruebas locales.

## Entrega siguiente

Tras revisar esta especificación, preparar el plan de implementación por esquema/migración, resolvedor, administración, venta/comandas y verificación. La entrega posterior de stock por ventas consumirá `sale_line_components`, con reservas, momento de consumo, cancelaciones y mermas definidos en su propio diseño. Multiempresa y Mercado Pago conservan su alcance futuro.
