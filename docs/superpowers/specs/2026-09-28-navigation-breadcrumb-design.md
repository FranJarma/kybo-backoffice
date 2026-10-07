# Navegación por áreas y Breadcrumb

Fecha: 2026-09-28
Estado: retomada e implementada por pedido del usuario, después de integrar el modelo de datos.

El catálogo físico se denomina Artículos: incluye ingredientes, preparaciones,
envases, materiales de uso interno y productos comprados listos para vender.

## Objetivo acordado

Organizar Kybo desde áreas del negocio hacia pantallas concretas. La URL, el
sidebar, el título y el Breadcrumb deben comunicar la misma ubicación, incluso
al abrir una URL directamente o recargar. Incorporar un componente Breadcrumb
reutilizable, accesible y adaptable a móvil.

El usuario aprobó separar Productos, Cocina e Inventario y compras. Los grupos
modificadores son reutilizables y serán hermanos de Recetas dentro de Productos.
Las presentaciones actuales representan formatos de compra ligados a artículos y
proveedores, no variantes del producto vendido.

## Jerarquía y rutas canónicas

| Área | Pantalla | Ruta |
| --- | --- | --- |
| Inicio | Inicio | `/` |
| Ventas | Punto de venta | `/sales` |
| Ventas | Mesas | `/sales/tables` |
| Ventas | Clientes | `/sales/customers` |
| Cocina | Comandas | `/kitchen` |
| Cocina | Registro de producción | `/kitchen/production` |
| Productos | Catálogo y precios | `/products` |
| Productos | Recetas | `/products/recipes` |
| Productos | Modificadores | `/products/modifiers` |
| Inventario y compras | Inventario y compras | `/inventory` |
| Inventario y compras | Artículos | `/inventory/items` |
| Inventario y compras | Compras | `/inventory/purchases` |
| Inventario y compras | Presentaciones de compra | `/inventory/presentations` |
| Inventario y compras | Proveedores | `/inventory/suppliers` |
| Inventario y compras | Traslados | `/inventory/transfers` |
| Inventario y compras | Consumo interno | `/inventory/internal-use` |
| Configuración | Sucursales y ubicaciones | `/settings/branches` |
| Configuración | Medios de pago | `/settings/payment-methods` |

Las áreas son agrupaciones del menú, con un máximo de dos niveles visibles.
No se crean paneles vacíos ni funcionalidades nuevas para justificar una URL.
Productos, Ventas, Cocina e Inventario tienen pantallas principales existentes.
Configuración es por ahora un encabezado del menú sin página propia.

Los nombres de las pantallas se usan de forma coherente en el enlace del menú,
el título de página y el último elemento del Breadcrumb. El nombre del área se
usa en el encabezado de grupo y, cuando corresponde, en el antecesor del Breadcrumb.
Los verbos de acción, como «Registrar producción», se reservan para botones.

## Sidebar

- Inicio como acceso independiente; áreas restantes con encabezados visibles.
- Pantallas agrupadas debajo de su área, sin árboles profundos ni interacción
  obligatoria para descubrir las opciones.
- Un único enlace con `aria-current="page"`; el grupo activo también tiene una
  indicación visual diferenciada que no depende solamente del color.
- Resolver la ruta específica: `/products/recipes` no activa Catálogo y precios.
- Menú móvil con los mismos datos, cierre al navegar, control por teclado y
  devolución del foco al botón que lo abrió, preservando el comportamiento actual.

## Breadcrumb

Componente de presentación en `src/components/ui/breadcrumb.tsx`, integrado una
sola vez en el shell, encima del título del contenido. Sustituye el indicador
plano actual «Kybo > ubicación»; no se muestran dos rutas de ubicación distintas.

Ejemplos para administrador y encargado:

- Inicio: `Inicio`.
- Catálogo: `Inicio > Catálogo y precios`.
- Recetas: `Inicio > Productos > Recetas`.
- Modificadores: `Inicio > Productos > Modificadores`.
- Producción: `Inicio > Cocina > Registro de producción`.
- Artículos: `Inicio > Inventario y compras > Artículos`.
- Medios de pago: `Inicio > Configuración > Medios de pago`.

Los antecesores llevan a pantallas existentes: Productos a `/products`, Cocina
a `/kitchen`, Inventario y compras a `/inventory`, Ventas a `/sales`. No se
inventa un enlace a Configuración mientras no exista una página para ese nivel.

Usar `nav` con nombre accesible «Ubicación», lista ordenada, enlaces Next.js y
separadores decorativos ocultos a lectores de pantalla. La página actual se
renderiza como texto con `aria-current="page"`. En móvil se conservan el padre
inmediato y la página actual; puede omitirse visualmente Inicio si falta espacio.
El contenido no provoca desbordamiento horizontal y los enlaces conservan foco
visible y nombres accesibles completos.

Para personal, cuya pantalla de entrada es Punto de venta, evitar el enlace al
resumen restringido `/`. Mostrar `Punto de venta`, `Ventas > Mesas` o `Comandas`
según la ubicación. Los enlaces del Breadcrumb respetan sus destinos permitidos.

## Una definición compartida

Crear un módulo de navegación con identificadores estables, áreas, etiquetas,
rutas, antecesores y visibilidad por rol. Sidebar, Breadcrumb y enlaces entre
pantallas consumen esta definición. No deducir títulos de segmentos de URL ni
mantener tablas independientes que puedan divergir.

Las páginas de catálogo conservan sus identificadores internos (`products`,
`ingredients`, etc.). La ruta visual nueva no cambia las entidades ni los
endpoints `/api/...`. El catálogo de rutas conocidas es explícito; rutas
desconocidas continúan respondiendo con 404.

## Compatibilidad

Redirecciones permanentes de páginas, preservando parámetros de consulta:

| Ruta anterior | Destino |
| --- | --- |
| `/recipes` | `/products/recipes` |
| `/modifiers` | `/products/modifiers` |
| `/production` | `/kitchen/production` |
| `/ingredients` | `/inventory/items` |
| `/purchases` | `/inventory/purchases` |
| `/presentations` | `/inventory/presentations` |
| `/suppliers` | `/inventory/suppliers` |
| `/tables` | `/sales/tables` |
| `/customers` | `/sales/customers` |
| `/payment-methods` | `/settings/payment-methods` |

Ejemplo obligatorio: `/production?recipe=abc` debe llegar a
`/kitchen/production?recipe=abc`. Actualizar los enlaces internos para que usen
directamente las rutas canónicas, incluidos Inicio, recetas, producción y mesas.
Actualizar referencias de navegación en pruebas existentes sin alterar sus
llamadas a APIs. No cambiar endpoints, esquema, servicios ni datos comerciales.

## Acceso y layouts

Mantener las barreras del servidor además de la visibilidad del menú. Personal
accede a Punto de venta, Mesas, Comandas y selección de sucursal. El permiso
adicional de gestión de catálogo habilita sus pantallas compartidas, pero no
inventario operativo ni producción. Administradores y encargados conservan
su acceso operativo. Los enlaces de antecesores respetan estos permisos.

Mantener un único AppShell por página. La reorganización de segmentos y grupos
de rutas debe evitar layouts duplicados y rutas públicas equivalentes que
compitan entre sí. Consultar las guías instaladas de Next.js antes de implementar.

## Alcance y preservación

Conservar todos los cambios de 0.6.0-rc.1 y las modificaciones locales, incluido
el diagnóstico de `scripts/create-user.ts`. No editar `.env`, ejecutar migraciones,
hacer commits ni push. Esta tarea organiza la navegación existente; no rediseña
formularios, incorpora módulos nuevos ni cambia reglas de negocio.

## Verificación y aceptación

- Pruebas de resolución de ubicación, enlaces activos y visibilidad por rol.
- Pruebas del Breadcrumb renderizado: orden, destinos, página actual y semántica.
- Verificación de redirecciones, incluidos parámetros de consulta.
- Comprobar que el acceso directo funciona y que páginas movidas conservan los
  controles del servidor; ocultar enlaces no constituye autorización.
- Revisar menú y Breadcrumb en escritorio y móvil, teclado y ausencia de
  desbordamiento. Usar sesiones autorizadas existentes si están disponibles;
  informar cualquier recorrido autenticado que no pueda verificarse.
- TypeScript, lint, pruebas pertinentes sin base de datos y `git diff --check`.
- Compilación de producción; Webpack es la alternativa ya verificada si el
  entorno sigue bloqueando procesos auxiliares de Turbopack.
- No ejecutar el arnés E2E actual ni pruebas de integración que preparan bases
  mediante migraciones mientras siga vigente la restricción del usuario.

## Revisión de la especificación

Se comprobaron cobertura de las pantallas actuales, correspondencia de nombres,
compatibilidad de URLs, límites de permisos, ausencia de páginas ficticias,
tratamiento de Inicio para personal y preservación de cambios locales. La
especificación no requiere cambios de esquema ni consultas a la base real.
