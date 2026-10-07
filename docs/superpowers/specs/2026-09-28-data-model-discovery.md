# Revisión del modelo de datos de Kybo

Estado: relevamiento conservado como antecedente. La propuesta consolidada está en
`2026-09-28-data-model-design.md`, pendiente de revisión del usuario.

## Necesidad confirmada

El usuario pide resolver el diseño de datos antes de reorganizar navegación.
Confirma ingredientes, preparaciones, envases, productos comprados listos para
vender y materiales de uso interno, como limpieza. También confirma varias
sucursales, cada una con ubicaciones. Se conservan datos existentes,
modificaciones locales y `.env`. No ejecutar migraciones, commits ni push.

## Evidencia del código actual

- `business-schema.ts`: `ingredients` contiene nombre, unidad base, costo de
  catálogo, revisión y archivo. No expresa clase de artículo ni usos permitidos.
- `products` contiene la identidad comercial y se relaciona con precios por canal;
  no tiene un vínculo explícito para vender directamente un artículo almacenado.
- `purchase_presentations` vincula proveedor e ingrediente con una cantidad base.
- `recipes` apunta a un producto vendido o a un ingrediente de salida de una
  preparación. Conserva versiones, rendimientos y componentes.
- Compras, saldos, lotes, movimientos, producción y componentes de modificadores
  referencian `ingredients`, aunque sus responsabilidades exceden un ingrediente.
- `stock_balances` tiene una fila por ingrediente; no representa ubicación.
- Inventario ya usa transacciones, bloqueos, claves de reintento y promedio
  ponderado. Producción registra consumos y salida en una transacción.
- Las ventas guardan composición y modificadores históricos. El README declara
  explícitamente que vender todavía no descuenta inventario.
- Los costos de catálogo, los costos de inventario y los precios comerciales son
  conceptos distintos. No deben fusionarse durante la reorganización.

Estas observaciones provienen de archivos del proyecto, no de una inspección de
los datos ni de una auditoría completa de la base instalada.

## Alternativas

1. Renombrar `ingredients` a `supplies`: menor esfuerzo, pero no resuelve el
   vínculo entre mercancía almacenada y productos revendidos ni sus políticas.
2. Separar tablas para ingredientes, envases, limpieza y mercancía: permite campos
   específicos, pero fragmenta compras, lotes y movimientos y favorece duplicados.
3. Un catálogo común de artículos físicos y una capa comercial relacionada:
   recomendación provisional. Una identidad de inventario por artículo; roles y
   relaciones explícitas para comprar, elaborar, consumir y vender.

## Dirección recomendada, pendiente de completar requisitos

- `items`: artículos físicos, unidad base y clasificación. Ingrediente, envase o
  limpieza expresa naturaleza/uso; comprado o producido expresa abastecimiento.
  No usar un único enum que haga incompatibles comprar y producir el mismo artículo.
- `products`: ofertas comerciales con precios por canal. Un producto puede
  despacharse directamente desde un artículo o resolverse mediante una receta.
  Conservar separadas la unidad de venta y la cantidad de inventario consumida.
- Venta directa: vínculo explícito producto-artículo y cantidad por unidad vendida;
  una botella y un pack pueden referirse al mismo artículo físico.
- Recetas: composición versionada para venta bajo pedido o para producir un
  artículo almacenado. El consumo de un preparado descuenta ese preparado y no
  vuelve a descontar las materias primas que ya se consumieron al elaborarlo.
- Envases: pueden formar parte del consumo de un producto/receta. Limpieza: consumo
  interno identificado, sin obligar a inventar una receta o una venta ficticia.
- Presentaciones: compras con proveedor, artículo y conversión explícita a unidad
  base. Distinguir presentación de compra, unidad de medida y presentación de venta.
- Inventario: movimientos trazables, lotes y saldos reconciliables por ubicación.

## Sucursales y ubicaciones: requisito confirmado

Se asume un negocio con catálogo compartido; no se ha solicitado una plataforma
para empresas independientes. Un negocio puede operar varias sucursales y cada
sucursal contiene ubicaciones (depósito, cocina, barra, etc.).

- `branches` identifica sucursales; `locations` identifica lugares de stock y su
  sucursal. Cerrar una ubicación no elimina su historial ni permite ocultar saldo.
- `items` es compartido. No crear otra leche o botella por cada sucursal.
- Un lote identifica origen/trazabilidad del artículo y puede repartirse entre
  ubicaciones. Su saldo pertenece a la pareja lote-ubicación; la unicidad y claves
  compuestas deben impedir asociar el saldo a un artículo distinto del lote.
- El saldo resumido por artículo-ubicación es una proyección reconciliable de los
  movimientos. Definir explícitamente qué saldo se considera físico, reservado,
  bloqueado, vencido, en tránsito y disponible.
- Un traslado interno produce salida y entrada vinculadas. Entre sucursales,
  admitir despacho, stock en tránsito y recepción, incluyendo recepción parcial,
  diferencias y reintentos. Nunca hacer disponible en destino antes de recibir.
- Todo consumo/recepción/producción registra una ubicación explícita. No sumar
  stock de varias sucursales para aprobar una venta local.
- Ventas, mesas, estaciones de preparación y producción pertenecen a una sucursal.
  Unicidad de nombre de estación o posición de mesa se define dentro de ella.
- Permisos: membresía usuario-sucursal y rol operativo. Verificar la pertenencia
  en el servidor y en todas las consultas; un selector de sucursal no autoriza
  acceso. Traslados entre sucursales requieren permisos para cada fase.
- Definir alcance de costos promedios y precios. Recomendación a evaluar:
  valoración por artículo-sucursal, cantidades por ubicación, traslado interno
  sin revalorizar y traslado entre sucursales con costo documentado al despacho.
  No multiplicar precios por ubicación; distinguir precio por canal y cualquier
  excepción comercial por sucursal, con precedencia explícita si se incorpora.
- Los datos existentes necesitan una sucursal y ubicación iniciales acordadas;
  no asignarlos por inferencia a una sucursal real ni repartir saldos por defecto.

La elección del nombre físico definitivo (`items`, `inventory_items` u otro) se
cerrará con el modelo conceptual; no se decide para imitar una etiqueta del menú.

## Momento del consumo

Flujo aprobado por el usuario: reservar al confirmar y descontar al terminar la
preparación, con resolución física explícita de cancelaciones:

- Confirmar pedido: reservar componentes en ubicaciones de la sucursal. La reserva
  reduce disponibilidad sin registrar todavía el consumo definitivo.
- Iniciar preparación: conservar la reserva y señalar que está en proceso; no
  presentar los componentes como libres ni confundir saldo registrado con un
  recuento físico instantáneo durante la elaboración.
- Marcar lista: registrar consumo y liquidar la reserva en la misma transacción
  que cambia la comanda a `ready`, una única vez aunque se reintente la acción.
- Entregar: no volver a descontar los mismos componentes.
- Cancelar antes de empezar: liberar la reserva.
- Cancelar durante preparación: registrar cantidades efectivamente consumidas o
  perdidas y liberar únicamente el remanente sin usar; no devolver todo por defecto.
- Cancelar después de marcar lista: conservar el consumo ya registrado. Una merma
  del producto terminado no vuelve a descontar sus ingredientes. Cualquier
  recuperación real requiere una operación explícita y trazable.
- Producción para almacenar: consumo de componentes y alta del artículo producido
  al finalizar el lote, en una sola transacción.
- Reventa sin preparación: necesita su propio evento de salida, propuesto al
  entregar/despachar, sin obligar a crear una comanda de cocina ficticia.

El momento del consumo no debe depender del estado del pago. La asignación de
reservas a lotes, sus cambios ante bloqueos/vencimientos y el manejo de ajustes
de cantidad deben formar parte de la especificación detallada.

## Reglas que debe cerrar el diseño

1. Identidad única del artículo y relaciones comerciales sin duplicar stock.
2. Unidades y conversiones compatibles: no convertir masa a volumen sin una regla
   específica. Proteger unidad base cuando existe historial.
3. Correspondencia entre artículo, lote, movimiento, presentación y producción.
   Revisar restricciones compuestas donde claves foráneas independientes no bastan.
4. Cantidades, redondeos, costos desconocidos frente a cero, política de stock
   negativo y conciliación de saldos con movimientos.
5. Política de consumo: momento exacto para registrar venta/preparación, reservas
   si se necesitan, cancelaciones y reintentos sin duplicación.
6. Historial: versión y cantidades efectivas de cada operación; los cambios de
   catálogo no reescriben compras, producción ni ventas anteriores.
7. Correcciones auditadas y movimientos compensatorios, con referencia al origen.
8. Clasificación y usos permitidos verificables tanto en servicios como mediante
   las restricciones relacionales que correspondan.
9. Permisos para ajustes, consumos internos, producción y cambios de catálogo.

## Migración a diseñar, sin ejecutar

- Inventariar dependencias antes de renombrar tablas, columnas, contratos y pruebas.
- Preservar identificadores y relaciones; no borrar/recrear los datos de negocio.
- No clasificar automáticamente todos los registros actuales como alimentos:
  contemplar una clasificación pendiente de revisión.
- No reconstruir consumos históricos de ventas como si realmente hubieran sido
  registrados; definir un corte explícito para cualquier función nueva de stock.
- Planificar despliegue compatible, respaldo, comprobaciones de conteos y claves,
  reconciliación de saldos, ensayo en copia y procedimiento de recuperación.
- No modificar migraciones históricas ya aplicadas; cualquier evolución tendrá
  migraciones nuevas revisables y aprobación explícita para su ejecución.

## Pendiente de consulta

- Revisar la especificación consolidada y sus decisiones propuestas.

## Referencias de diseño

- Odoo: separar características del artículo y seguimiento de inventario:
  https://www.odoo.com/documentation/19.0/applications/inventory_and_mrp/inventory/product_management/configure/type.html
- Odoo: unidad de compra, unidad de inventario y conversiones:
  https://www.odoo.com/documentation/19.0/applications/inventory_and_mrp/inventory/product_management/configure/uom.html
- PostgreSQL: restricciones relacionales; un CHECK no asegura consistencia con
  otras filas/tablas:
  https://www.postgresql.org/docs/17/ddl-constraints.html

Las referencias orientan decisiones; el diseño específico debe responder a los
flujos de Kybo, no copiar un ERP completo.
