# Operación del día — diseño

Fecha: 22/10/2026. Estado: propuesta para revisión, sin implementación.

## Objetivo y alcance acordado

Dar al encargado una pantalla por sucursal para decidir qué hacer primero, asignar responsables y verificar resultados reales. El empleado consulta sus tareas y registra su ejecución. Incluye compras a proveedores, reposición Depósito → Barra/Cocina, preparaciones, controles de inventario y rendimiento por producto.

Requisitos confirmados:
- Contar insumos críticos en apertura y cierre.
- Críticos: tapa de waffle, pan de superpancho, salchichas, fiambre, perlas explosivas, perlas de tapioca, helado, café, vasos descartables y sorbetes.
- Perlas explosivas, perlas de tapioca, vasos y sorbetes: anticipación de compra de 7 días y margen de 3 días; umbral inicial de aviso de 10 días de cobertura.
- Ordenar por urgencia y explicar la razón de cada prioridad.
- Mostrar cuántos productos pueden prepararse con los insumos disponibles.
- Sin commit ni push. Esta entrega solo diseña y planifica; no aplica migraciones ni modifica inventario o configuración de negocio.

Decisiones propuestas, distinguibles de lo ya acordado: inventario completo semanal; plazos en días corridos; cálculo inicial simple de consumo; configuración de horarios y artículos por sucursal; empleados ejecutan tareas asignadas, encargado aprueba diferencias de conteo y compras. Se revisan con este documento.

## Evidencia del repositorio

| Existente | Reutilización / falta |
|---|---|
| `src/modules/replenishment/engine.ts`, `service.ts`, `types.ts` | Mínimos y objetivos por artículo/ubicación, disponibilidad por lotes y sugerencias de traslado/producción/compra. No hay tareas persistentes ni pronóstico. |
| `src/modules/production/planning.ts`, `orders.ts`, `review-result.ts` | Asignación, horario, inicio, finalización y revisión de resultados. Usar estas órdenes, no duplicarlas. |
| `src/modules/transfers/service.ts`, `src/db/transfer-schema.ts` | Confirmación, despacho, recepción y diferencias, con reservas. Actualmente restringidos a encargado. |
| `src/modules/inventory/scoped-adjustments.ts` | Conteo por lote con revisión; impide contar lotes reservados. Falta sesión de conteo con registro del empleado y aprobación del encargado. |
| `src/modules/inventory/service.ts`, `src/db/inventory-schema.ts` | Recepciones de compras y pagos; no se encontró entidad de pedido pendiente a proveedor. |
| `src/db/sourcing-schema.ts` | Proveedores de artículos, cotizaciones, presentaciones, mínimo de packs y plazo. |
| `src/modules/recipes/composition.ts`, `waste.ts`, `src/modules/products/fulfillment.ts` | Composición, modificadores, consumo con merma y versión física del producto. |
| `src/modules/operations/command.ts`, `inventory/locking.ts`, `ledger.ts` | Contexto de sucursal, permisos antes del replay, idempotencia y movimientos transaccionales. |

La rama contiene cambios previos de localizadores, clientes y tablet sin commit. No se descartan ni se atribuyen a este proyecto. La última migración observada es 0024; los números siguientes deben comprobarse al ejecutar.

## Alternativas y decisión

1. **Tablero coordinador sobre los módulos actuales (recomendado).** Una tarea dirige a una orden, traslado, conteo o compra real. Conserva trazabilidad y permite entregas independientes; exige definir contratos y permisos de ejecución.
2. Solo agrupar enlaces y avisos actuales. Es rápido, pero no resuelve responsables, seguimiento, conteos ni duplicados.
3. Reemplazar los módulos por un motor genérico de tareas. Mayor flexibilidad, pero obliga a rehacer movimientos y autorizaciones que ya funcionan.

Se propone la primera opción. Cuatro entregas: tablero/ejecución; conteos; abastecimiento anticipado; rendimiento. La primera debe funcionar sin fingir que las siguientes ya existen.

## Pantalla y recorridos

Ruta propuesta `/operations/day`, acceso «Operación del día» en la navegación. Encargados: «Equipo» y «Mis tareas»; empleados: solo «Mis tareas». Fecha operativa y sucursal siempre visibles.

Orden visual:
1. Encabezado con fecha, última actualización, filtros de ubicación/tipo/responsable y acción «Asignar tarea».
2. Resumen: críticas, altas, programadas y pendientes de revisión. Los números abren filtros; «Al día» describe necesidades cubiertas, no es una prioridad de tarea pendiente.
3. Lista ordenada de tareas: urgencia + explicación, acción concreta, artículo/cantidad/unidad, origen/destino, vencimiento, responsable y estado. «Vencida» es una marca adicional, no un estado que sustituya «Bloqueada».
4. Detalle lateral en escritorio y pantalla/dialog completo en tablet: motivo, existencias, dependencias, ejecución y actividad.
5. Pestañas secundarias «Stock por ubicación», «Rendimientos» e «Historial». Configuración separada, reservada al encargado.

Ejemplos ilustrativos, nunca datos sembrados en la base:
- **Alta · Pedir vasos**: quedan 10 días; plazo 7 + margen 3; responsable, proveedor, packs sugeridos y fecha límite.
- **Crítica · Reponer leche en Barra**: no hay disponible para los pedidos; mostrar lo disponible en Depósito, sin inventar que ya se trasladó.
- **Programada · Preparar 2 l de chai**: receta/version, lugar, responsable y hora; si faltan ingredientes, mostrar dependencia y estado bloqueado.

Controles táctiles de al menos 48 × 48 px; acción principal de 56 px. No depender de hover ni solo del color. Formatos locales y unidades explícitas. Resumen breve y ayuda desplegable para errores detallados. Listas paginadas a 50 registros; filtros conservados al volver. Refresco visible cada 60 segundos y después de cada comando; suspender al ocultar la pestaña. Los formularios abiertos no pierden ediciones al refrescar; una revisión obsoleta provoca 409 y permite recargar sin reenviar silenciosamente.

## Estados, responsabilidad y documentos

Estados persistentes: `pending`, `in_progress`, `blocked`, `awaiting_review`, `done`, `cancelled`, `superseded`. Responsable opcional al generar, obligatorio al empezar. «Terminada» requiere evidencia del documento, no un checkbox libre.

- Traslado: encargado define origen/destino y cantidades; empleado asignado puede despachar/recibir únicamente ese traslado dentro de su sucursal. Diferencias quedan pendientes del encargado. Termina al quedar recibido/resuelto, no al salir de Depósito. Traslados entre sucursales quedan en el circuito actual de encargado.
- Producción: la orden existente determina responsable, horario y estado. Inicio reserva; finalización registra producción real según el circuito actual. Revisión de diferencias usa el módulo existente. El tablero es una proyección de esa orden, no otra agenda editable en paralelo.
- Compra: empleado asignado puede preparar un borrador; encargado confirma que fue tramitado y registra fecha esperada. No enviar mensajes a proveedores automáticamente. Distinguir tarea «Tramitar compra» de seguimiento «Recibir compra»; terminar la primera nunca suma stock.
- Conteo: empleado registra y entrega; encargado aprueba diferencias. Solo una conciliación aprobada mueve existencias.
- Cancelación/bloqueo/reasignación registran motivo y actor. Un empleado no cambia cantidades autorizadas, proveedor o ubicación de una tarea ni se autoasigna trabajo del equipo.

Cada comando valida membresía actual y asignación, incluso si es un replay. El encargado conserva permisos actuales. No ampliar globalmente `staffCommand` para dar a empleados acceso a todos los traslados o ajustes: añadir comandos específicos de tarea con comprobación del documento vinculado y sus límites. Deshabilitar o revocar al responsable bloquea ejecución y señala necesidad de reasignación.

## Generación y deduplicación

Las recomendaciones se calculan sobre una lectura consistente de existencias, reservas, órdenes, recepciones y políticas. Consultar no escribe. Un comando explícito `reconcile` materializa/sincroniza tareas; el cliente del encargado lo solicita al entrar y cada 60 s mientras la pantalla esté visible. Para generación sin pantalla abierta, dejar un adaptador reutilizable de job, pero no instalar un scheduler ni prometer notificaciones fuera de la app en esta entrega.

Clave única de necesidad activa: sucursal + tipo + artículo + destino + política. Controles: sucursal + fecha operativa + apertura/cierre/semanal + ubicación. Vínculo único de documento: sucursal + tipo de documento + ID + etapa (`execute`, o `order`/`receive` en compras). Esto permite tramitar y recibir un mismo pedido con tareas diferentes sin duplicar ninguna etapa. Un índice parcial y bloqueo de reconciliación por sucursal impiden duplicados por dos sesiones.

- Necesidad nueva: crear pendiente sin responsable. Necesidad existente sin empezar: actualizar sugerencia y urgencia conservando asignación y comentarios.
- Una tarea empezada o un documento autorizado no cambia su cantidad silenciosamente. Registrar nueva sugerencia y pedir revisión; resolver lo ya comprometido antes de emitir otra tarea del mismo episodio.
- Si desaparece una necesidad aún no ejecutada, marcarla `superseded` con razón; no borrarla ni llamarla terminada. Las canceladas pueden regenerarse si la necesidad persiste; posponer una no elimina riesgo ni urgencia.
- Órdenes de producción/traslados creados fuera del tablero también se incorporan por vínculo único de documento. Si existen varios documentos para un artículo, se muestran como tareas distintas y se descuentan sus compromisos una sola vez.
- Stock parcial en Depósito: sugerir el traslado posible y una producción/compra por el remanente. No ocultar el remanente porque haya alguna fuente disponible.
- Dependencias son enlaces entre tareas sin ciclos. No se inician acciones dependientes si no cumplen stock/permisos actuales, aunque el tablero estuviera desactualizado.

## Conteos diarios y semanales

Configuración por sucursal: zona horaria existente, hora de apertura, hora de cierre y día/hora del inventario semanal. Si el cierre es anterior o igual a la apertura, pertenece al día calendario siguiente de la misma jornada. No inventar horarios: hasta configurarlos, mostrar «Configurar horarios» y permitir conteo manual, sin generar controles falsamente vencidos.

La lista de críticos se configura por IDs de artículos existentes. Los nombres acordados son categorías de selección: fiambres, sabores/tipos de perlas, vasos/tapas y sorbetes se desglosan en artículos reales. No sumar gramos con unidades ni crear artículos por coincidencia aproximada. Un artículo nuevo en estas categorías requiere confirmación del encargado para entrar al control. Mostrar configuración incompleta si falta asociar uno.

Sesión: `draft → counting → submitted → approved`, con retorno a `counting` cuando se requiere recuento; cancelación motivada. Un empleado ve qué contar y la unidad, sin precargar ni mostrar cantidad esperada antes de enviar. El encargado compara esperado, contado y diferencia.

- Apertura/cierre: críticos activos con control de stock en cada ubicación configurada, incluidos saldos cero. Semanal: todos los artículos activos con control de stock por ubicación. Incluir saldos positivos de artículos archivados hasta conciliarlos.
- Por fila se conserva cantidad física observada, fecha/hora, empleado y firma de saldos/lotes/reservas al iniciar esa fila. Si cambia la firma al enviar o aprobar, pedir recuento; no ajustar contra una cantidad antigua ni reinterpretar el conteo como stock actual.
- Cantidad física no significa disponible: reservas y lotes bloqueados/vencidos se muestran al revisor por separado. Nunca liberar reservas para hacer coincidir el conteo. Una discrepancia sobre lotes reservados queda bloqueada hasta resolverlos.
- El empleado cuenta total por artículo/ubicación; si hay diferencia, el encargado distribuye explícitamente la corrección por lote. No distribuir automáticamente pérdidas entre vencimientos diferentes. Excedente sin lote: ingreso manual trazable con fecha/lote definidos por el encargado y enlazado a la conciliación.
- Cada fila se concilia una vez en transacción. Igualdad registra revisión sin movimiento (el ajuste actual rechaza delta cero). La sesión se aprueba cuando todas las filas están conciliadas o excluidas por encargado con motivo; exclusiones visibles, nunca ocultas como inventario completo.
- Mostrar por separado controles vencidos y faltantes de stock; no usar diferencias de conteo como consumo comercial.

## Abastecimiento y urgencia

Stock disponible: suma FEFO de lotes utilizables en la sucursal menos reservas; excluir lotes bloqueados, vencidos o bloqueados en ubicación. Para tareas de reposición se calcula por ubicación; para compras, agregado por sucursal para no comprar por un simple faltante en Barra. Para cantidad física, incluir lo que realmente existe aunque no esté utilizable.

Política de compra por sucursal/artículo/proveedor preferido: plazo en días corridos, margen, cobertura objetivo, presentación y mínimo de packs. Grupo Bolivia: valores iniciales propuestos 7 y 3; asignación explícita a los cuatro grupos de artículos, no al nombre del proveedor por inferencia. La cobertura objetivo debe ser > 10 días y la elige el encargado; no fijar una cantidad comercial arbitraria.

Consumo diario inicial:
- Modalidad estimación manual: cantidad base por día corrido, autor y fecha, claramente etiquetada.
- Modalidad histórica: promedio de los últimos 28 días calendarios completos. Solo habilitar con 28 días de operación registrados y conciliados para la fuente; días sin cobertura conocida no cuentan como cero. Días cerrados configurados sí tienen consumo cero. No cambiar de manual a histórico sin elección del encargado.
- Movimientos de salida `sale_consume`, `direct_dispatch`, `production` de ingredientes y `waste` forman consumo; correcciones de producción/retornos físicos enlazados compensan su operación original. Excluir traslados, ingresos, conteos y `production_review` de valor. No contar el consumo de un ingrediente dos veces por leer además la venta o por expandir el preparado resultante.
- Si no hay tasa válida: «Sin estimación de cobertura», sugerir configurar consumo, mantener avisos por mínimos. Nunca mostrar infinitos días ni «Al día» por falta de datos. Una tasa cero confirmada muestra «Sin consumo estimado» y sigue respetando demandas/minimos existentes.

Cobertura: proyección diaria de lotes por vencimiento, consumo y entradas confirmadas hasta 365 días. En cada día vencen primero los lotes de esa fecha, ingresan recepciones esperadas confirmadas y se descuenta consumo. Una ETA sin hora se cuenta al final del día para no ocultar un faltante durante el día. Separar cobertura actual (sin entradas) y proyectada (con entradas). Mostrar valores aproximados; las reservas siguen cubiertas aparte y no se consumen otra vez al proyectar demanda incremental.

Pedidos entrantes: solo cantidad confirmada pendiente de recibir con fecha conocida. Borradores, cancelados, entradas sin fecha o atrasadas sin reconfirmación no cubren riesgo. Recepciones parciales reducen pendiente; nunca suman al stock actual antes de recibirse. Un faltante anterior a una llegada tardía conserva urgencia aunque el saldo final sea positivo.

Prioridad automática, con razón y evidencia:
- **Crítica**: bloqueo actual de pedidos/producción por falta de stock, o agotamiento previsto antes o en el plazo de reposición (para Bolivia ≤ 7 días) sin entrada que lo cubra a tiempo.
- **Alta**: cobertura > 7 y ≤ 10 días para Bolivia; compras requieren tramitarse hoy o ya vencieron su fecha límite. Para otros proveedores aplicar plazo + margen de su política. Un traslado/preparación vence durante el turno actual o es necesario para desbloquear una crítica.
- **Programada**: tarea futura fuera de esos umbrales. Control de apertura/cierre pendiente después de su hora: alta + vencida; no crítica automáticamente.
- **Al día**: no hay necesidades calculadas pendientes y las políticas/datos requeridos están completos. Si faltan datos, mostrar estado incompleto, no verde.

Orden: crítica, alta, programada; dentro, vencidas primero, luego fecha límite, creación e ID. Prioridad manual solo puede subir urgencia y exige motivo; no permite ocultar un riesgo automático.

Cantidad sugerida = máximo entre cero y demanda hasta cobertura objetivo menos stock utilizable y entradas confirmadas oportunas, calculado con el mismo calendario y vencimientos. Redondear hacia arriba a packs enteros y respetar mínimo de packs. Mostrar cantidad base y packs. Un borrador existente se actualiza como propuesta, no se duplica; no autoenviar, autoaprobar ni registrar compras reales.

## Pedidos a proveedores

Agregar `purchase_orders` y líneas; estados `draft`, `ordered`, `partially_received`, `received`, `cancelled`. Fechas de trámite y ETA; cantidades solicitadas, recibidas y canceladas por línea, con revisión y evidencia. Conservación: recibidas + canceladas ≤ solicitadas. Cancelar remanente no elimina recepciones.

Vincular las recepciones existentes a líneas de pedido y actualizar remanente en la misma transacción. Recepciones sin pedido siguen permitidas; no asociarlas por proveedor o artículo de forma automática. Cantidad mayor que el remanente requiere revisar primero el pedido por encargado; reintentos no duplican stock. Costos y pagos permanecen en el circuito actual de recepciones.

## Rendimiento y capacidad

Dos consultas distintas:
1. **Rendimiento de un insumo**: cantidad simulada → productos equivalentes, con receta, variante y merma explícitas. Ejemplo: 1.000 g de taro, receta neta de 30 g y merma de 2 % → 32 bebidas completas.
2. **Preparables ahora**: máximo entero según todos los componentes disponibles en la ubicación de consumo, usando composición vigente y descontando reservas. Con taro para 32 pero solo 20 vasos, informar 20 y vasos como limitante.

Reutilizar resolución de composición y `consumptionQuantity`; aritmética decimal/BigInt, nunca flotantes para decidir stock. Buscar el máximo entero cuyo consumo calculado por las funciones reales cabe en cada componente, con máximo visible 1.000.000 y etiqueta «≥ 1.000.000» si se alcanza. Artículos sin control no limitan, pero se identifican; si ninguno controla stock, no inventar una cantidad ilimitada.

Productos configurables: calcular la selección predeterminada válida y mostrarla; si no existe, pedir opciones y mostrar «Requiere configuración». Combos: componentes elegidos, sumar ingredientes repetidos y no contar el encabezado como consumo. Sin receta publicada: no estimable. Preparados intermedios deben existir físicamente; materia prima para producirlos no equivale a preparados listos.

La capacidad por producto supone dedicarle el stock a ese producto; no sumar capacidades de productos que comparten insumos. Una simulación de mezcla de productos y la previsión estadística estacional quedan fuera de esta versión. Rendimiento observado de una preparación se muestra aparte: cantidad planificada frente a resultado real revisado, sin reemplazar automáticamente la receta.

## Modelo y límites técnicos

Nuevas tablas separadas por entrega:
- Núcleo: `daily_operation_tasks`, `daily_operation_task_events`, `daily_operation_task_dependencies`, `daily_operation_branch_settings`. Tarea con `revision`, vínculo único a documento, clave de necesidad y metadatos explicativos. Índices por sucursal/estado/vencimiento y responsable; FK compuestas para impedir referencias entre sucursales.
- Conteos: `inventory_count_profiles`, `inventory_count_profile_items`, `inventory_count_sessions`, `inventory_count_entries`, `inventory_count_entry_adjustments`. Perfiles por IDs; sesiones/firma por fila; vínculos únicos a ajustes.
- Compras: `purchase_orders`, `purchase_order_lines`, `purchase_order_receipt_allocations`, `supply_planning_policies`. Una política activa preferida por sucursal/artículo; el snapshot de cotización no cambia si luego se edita el catálogo.
- Rendimiento: consulta derivada; sin nuevos balances ni caché persistida obligatoria. Reutilizar historial de resultados para producción real.

Nuevos módulos `daily-operations`, `inventory-counts`, `procurement`, `capacity`; cálculo puro separado de consultas/comandos. Todas las rutas autenticadas y limitadas por sucursal. APIs no aceptan estado terminal libre: transiciones específicas y evidencia obligatoria. Adaptar operaciones actuales mediante helpers que reciban `Tx` para que comando, stock y estado de tarea compartan transacción. No anidar `executeCommand` ni abrir otra transacción para el dominio vinculado.

Migraciones aditivas, verificadas en base descartable. Aplicar a la base configurada requiere autorización nueva: el permiso anterior para 0024 no se extiende a estas migraciones. No ejecutar `db:migrate` genérico ni modificar `.env`. Configuración inicial mediante interfaz y selección explícita del catálogo; ningún seed modifica cantidades o fabrica compras/tareas terminadas.

## Entregas y aceptación

1. **Tablero y ejecución:** tareas persistentes, permisos, urgencia por mínimos y vencimiento, stock por ubicación, proyección de producción y traslados, deduplicación y UX tablet. Compras solo enlaces al módulo existente hasta la entrega 3; no prometer entradas pendientes.
2. **Conteos:** perfiles críticos, horarios, aperturas/cierres/semanales, captura ciega y revisión de diferencias con conflictos de stock. Comprobación: ventas durante el conteo no producen ajustes silenciosos.
3. **Abastecimiento:** pedidos pendientes, recepciones parciales enlazadas, consumo y cobertura, Bolivia 7+3 y paquetes. Comprobación: dos encargados no generan compras duplicadas; una llegada tardía no oculta quiebre.
4. **Rendimientos:** 1 kg de taro → 32; todos los insumos → limitante correcto; combinaciones, reservas y ubicaciones coherentes con la reserva real.

Pruebas: motores puros; integración PGlite descartable autorizada; concurrencia real PostgreSQL solo en base de pruebas explícitamente autorizada; rutas/roles/sucursales; navegador 600×960, 768×1024 y 1024×768; reintentos, cierre/reapertura, foco y teclado. PGlite no demuestra exclusión entre dos conexiones PostgreSQL.

## Configuración que debe completar el encargado al activar

Horarios de apertura/cierre, día semanal, IDs de críticos y ubicaciones, responsables, proveedor/presentaciones de Bolivia, cobertura objetivo, consumo diario manual o fuente histórica elegible. Sin esos datos no se inventan compras, horarios ni pronósticos. La interfaz muestra qué falta configurar y permite comenzar con las capacidades ya disponibles.

## Fuera de alcance

Envío automático a proveedores, notificaciones externas, ejecución con app cerrada sin integración de scheduler, optimización de mezclas de producción, pronóstico estacional/ML, cambios automáticos de recetas, reservas de stock por una mera sugerencia, sustitución del módulo contable y traslados intersucursal ejecutados por empleados.

## Revisión del diseño

Se comprobaron separación entre stock físico/proyectado, consumo versus traslados/ajustes, permisos en replay, doble conteo de entradas, conciliación con reservas, dependencias, tareas duplicadas y configuración incompleta. Los documentos de plan son borradores revisables solicitados junto con este diseño; no autorizan ejecución. Antes de implementar se revisan diseño y etapa correspondiente con el usuario.
