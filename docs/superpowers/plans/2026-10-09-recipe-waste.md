# Merma y costos de recetas

Acordado: cantidad util; consumo = cantidad / (1 - merma/100).
Merma por componente versionado, predeterminada 0, rango 0 inclusive a 100 exclusive. Redondear consumo hacia arriba a seis decimales. Aplicar una sola vez antes de reservar; conservar cantidades resueltas en ventas/ordenes historicas. Consumo real informado explicitamente no recibe otra merma.

Implementacion: columnas en recipe_options y componentes de modificadores; calculo central; costos de preparaciones recursivos; preview de costos sin guardar; formularios simples y configurables; acceso Ingredientes como vista de articulos utilizables en recetas, sin duplicar tablas. Mantener registros y precios desconocidos como pendientes.

Verificar formula, limites, versionado, costo, composicion, reservas y navegacion. Preservar .env y los cambios locales del combobox. La aplicacion de la migracion y la publicacion en GitHub fueron autorizadas posteriormente por el usuario el 2026-10-09.

## Verificaciones realizadas

- 37 pruebas aprobadas en 7 archivos: merma, integracion, composicion, navegacion, renderizado de navegacion, permisos de paginas y cantidades de preparacion.
- Compilacion de produccion y lint completos correctos.
- Comprobacion en navegador con base desechable: 100 g utiles y 20 % de merma muestran 125 g de consumo y $250 con costo de $2/g. Acceso, breadcrumb y listado de Ingredientes verificados.
- Integracion: 4 unidades utiles con 20 % de merma reservan 5; el stock permanece en 12 hasta terminar y entonces baja a 7. Versiones historicas, modificadores y preparaciones anidadas incluidos.
- Revision independiente: corregido el total de una receta configurable sin componentes fijos y con extras opcionales sin seleccionar; su costo base es cero, no pendiente. Caso cubierto por prueba.

## Organizacion del catalogo

Ingredientes muestra alimentos y bebidas habilitados para recetas. El catalogo de inventario contiene todos los articulos y permite filtrar por clase. Descartables reemplaza el nombre Envases en la interfaz y se distingue de los ingredientes en recetas, conservando su costo y consumo. Ambas vistas editan el mismo registro. Los formularios agrupan datos basicos, unidad/costo y usos, con acciones siempre visibles.

## Activacion

El 2026-10-09 se aplico `drizzle/0010_recipe_waste.sql` a la base configurada, por instruccion expresa del usuario. Se verifico el historial 0000-0009 y el estado de la transicion antes de aplicar solo 0010 dentro de una transaccion, con comprobacion de datos conservados, tres columnas y tres restricciones de rango. El migrador generico sigue bloqueado para proteger la transicion anterior; no se uso para esta operacion. No se modifico .env.
