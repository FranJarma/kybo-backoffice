# Productos, categorías y fotos

Fecha: 2026-10-06
Estado: aprobado por el usuario el 2026-10-09. Implementado; activacion del esquema y almacenamiento externo pendiente.

## Objetivo y contexto

Completar la ficha comercial y facilitar la selección de productos en el mostrador. Conservar la navegación, recetas, modificadores, versiones históricas, sucursales y reservas ya incorporadas al repositorio. El texto de continuidad describe una versión anterior del inventario; no debe usarse para revertir el modelo actual.

Trabajar en el repositorio original. Preservar `.env`, credenciales y cambios locales. No hacer commits, push, despliegues ni migraciones sobre la base real. No crear servicios externos ni contratar planes. La activación de almacenamiento se documenta aparte y necesita configuración del entorno; no pedir secretos por chat.

## Catálogo compartido

- Nueva entidad `product_categories`, con UUID, nombre, orden entero no negativo, revisión, fechas y archivo lógico. Nombre activo único sin distinguir mayúsculas y espacios exteriores. CRUD con auditoría y permisos actuales de gestión de catálogo; archivo/restauración en lugar de borrado físico.
- `products` incorpora `categoryId` opcional, descripción opcional de hasta 2000 caracteres, `imageAssetId` opcional, orden entero no negativo y tres indicadores de habilitación por canal. Son independientes de recetas y precios.
- Cada producto tiene como máximo una categoría principal. Los existentes conservan `categoryId = null`, descripción y foto nulas; la interfaz muestra “Sin categoría” y una imagen neutra. No crear una categoría ficticia en la base ni copiar fotos de terceros.
- Orden de categorías y productos ascendente; nombre e ID desempatan de forma estable. La búsqueda y paginación respetan ese orden.
- Archivar una categoría no archiva sus productos ni corta sus ventas. Los vínculos existentes se conservan y se identifican como categoría archivada al editar. No asignarla a otros productos mientras esté archivada. En POS esos productos quedan bajo “Sin categoría”; restaurarla recupera su agrupación.
- Habilitación por canal predeterminada en verdadero para conservar las reglas previas; nunca crear un precio faltante. Canal habilitado y precio ausente se muestran como estados distintos. Se mantienen las reglas existentes de precio manual autorizado.

## Operación por sucursal

`branch_products` conserva su habilitación general e incorpora `temporarilySoldOut` y revisión para evitar cambios perdidos. El agotado temporal es manual y local a la sucursal: no altera stock, archivo ni habilitación del producto en otros locales.

La disponibilidad efectiva combina producto no archivado, habilitación del canal, habilitación de sucursal y ausencia de agotado temporal. Se verifica al consultar POS y nuevamente en el servidor al confirmar/agregar renglones, con bloqueos compatibles con las escrituras. Ocultar un botón no constituye validación.

Cambios posteriores de disponibilidad no cancelan pedidos ya confirmados ni reescriben sus importes/composición. Los reintentos idempotentes de una operación confirmada conservan su resultado anterior. Las nuevas operaciones sí respetan la disponibilidad vigente.

Gestores de catálogo editan categorías, ficha, foto y canales globales. Administradores/encargados con acceso a la sucursal cambian su agotado temporal. Personal de venta consulta; no obtiene permisos de edición por usar el POS.

## Fotografías y almacenamiento

Propuesta: Vercel Blob privado, detrás de una interfaz de almacenamiento del servidor. Las imágenes se sirven mediante una ruta autenticada de Kybo; no se publica el catálogo por implementar esta función. Otra integración podrá sustituir al proveedor sin cambiar `imageAssetId` ni el formulario.

La subida usa una ruta Node de Next.js: valida sesión, permiso de catálogo y origen, limita bytes antes de decodificar, comprueba el contenido real y normaliza la foto. Entrada JPEG, PNG o WebP, hasta 4 MiB y 25 megapíxeles. Rechazar SVG, archivos no reconocibles, imágenes animadas y formatos no soportados con mensaje claro. Orientar correctamente, quitar metadatos y generar WebP de hasta 1600 píxeles de lado mayor, sin ampliar imágenes pequeñas. Se validan límites en cliente y servidor; la comprobación del servidor es obligatoria.

El límite de entrada queda por debajo del límite documentado de 4,5 MB de Vercel Functions. Las fotos grandes deben reducirse antes de enviar, o mostrar una explicación accionable; no simular una carga exitosa. HEIC queda fuera de esta primera implementación y se explica que debe usarse JPEG, PNG o WebP.

`media_assets` guarda UUID, proveedor, clave opaca generada por servidor, tipo, dimensiones, bytes, autor y fecha. Nunca bytes/base64 ni secretos de acceso en PostgreSQL. El cliente recibe un identificador de activo, no puede elegir claves del almacenamiento ni adjuntar URLs arbitrarias.

La subida crea un activo provisional del usuario. Guardar producto y asociar un activo elegible ocurren en la misma transacción; el activo no se puede vincular a otro producto. Un error de subida mantiene la foto anterior. Un conflicto de revisión conserva el formulario y no sustituye silenciosamente una edición ajena. Quitar foto desvincula al guardar; no elimina productos ni historial.

No borrar inmediatamente los archivos reemplazados. Proveer una herramienta de mantenimiento con modo informe predeterminado para activos sin referencia, retención mínima de 7 días y comprobación transaccional antes del borrado explícito. Evitar borrar activos en proceso de asociación. Si Blob falla, no confirmar la subida; si falla la base después de subir, intentar compensación e informar sin exponer secretos.

Sin configuración de Blob, el catálogo y POS siguen funcionando. La carga muestra “El almacenamiento de fotos todavía no está configurado”. No usar disco efímero ni inventar credenciales como respaldo. Pruebas locales con adaptador de almacenamiento en memoria; la prueba real del proveedor queda separada hasta disponer de configuración autorizada.

## Experiencia de usuario

- Productos mantiene “Catálogo y precios”; nueva entrada hermana “Categorías” en `/products/categories`, integrada en navegación y Breadcrumb.
- Ficha organizada en Información (nombre, categoría, descripción, orden), Foto y Venta por canal (habilitación y precio). Mantener estilo compacto, azul/naranja y español argentino.
- Foto con vista previa, nombre/estado de carga, reemplazar y quitar. Deshabilitar guardado mientras la carga esté pendiente. Un error conserva los demás campos. No mostrar éxito antes de confirmar persistencia.
- Estado “Agotado temporalmente” en el contexto explícito de sucursal; separado visualmente de archivo y habilitación general. No mezclar cambios de catálogo global y permisos locales en una acción ambigua.
- POS combina búsqueda, categoría y canal. Filtros accesibles “Todas” y “Sin categoría”, miniaturas con alternativa neutra y nombre siempre legible. No depender del color o la imagen para identificar el producto.
- Paginación real al superar 30 productos; filtros aplicados en servidor, no sólo a la primera página. Conteos y selección coherentes al cambiar filtros o sucursal. Los productos agotados pueden verse identificados, pero no agregarse; el servidor también lo impide.
- Imágenes con espacio reservado, tamaño acotado y carga diferida para evitar saltos de diseño. Revisar controles, errores, foco y contraste en escritorio y móvil.

## Integración y migración

Extender el módulo de catálogo y sus contratos; extraer controles específicos de producto y foto a componentes pequeños. Mantener APIs anteriores compatibles cuando no envían los campos nuevos: una actualización antigua no debe borrar foto, categoría ni disponibilidad. No asumir que valores ausentes significan “quitar”. El archivo de producto sigue siendo una acción independiente.

La migración siguiente a 0008 es aditiva: nuevas tablas, columnas, claves y restricciones. Preserva UUID, precios, recetas, ventas, configuraciones de sucursal y datos de auditoría. Preparar SQL y metadatos coherentes; no modificar migraciones históricas. Ensayar en PGlite desechable, sin usar `DATABASE_URL` de la aplicación.

Dependencias propuestas: SDK oficial `@vercel/blob` y procesador de imágenes `sharp` como dependencia directa. Mantener el gestor declarado (`pnpm`) y reconciliar ambos lockfiles existentes sin actualizar paquetes ajenos. Revisar versiones y documentación antes de fijarlas.

## Verificación de aceptación

1. Migración con productos anteriores: identidades/precios intactos, nuevos campos vacíos y disponibilidad previa preservada.
2. Categorías: alta, orden, edición concurrente, archivo/restauración, nombre duplicado y referencias existentes.
3. Ficha: escritura parcial compatible, cero frente a precio ausente, canales independientes y permisos globales/locales.
4. POS: filtros/paginación combinados, orden estable, imagen ausente/rota, agotado sólo en su sucursal y rechazo de confirmación desactualizada.
5. Historial/reintentos: ventas previas intactas y reintento confirmado válido tras cambios de disponibilidad.
6. Fotos: tipo real, tamaño, dimensiones, orientación, metadatos, permisos, origen, error del proveedor, conflicto al guardar y activo ajeno/no elegible. Reemplazar/quitar nunca pierde la foto anterior antes del guardado.
7. TypeScript, lint, pruebas específicas y build; navegador con datos de prueba autorizados. Identificar expresamente lo que no se pudo verificar sin sesión o configuración del proveedor.

## Fuentes técnicas consultadas

- [Subidas desde servidor y límite de tamaño](https://vercel.com/docs/vercel-blob/server-upload).
- [Almacenamiento privado de Vercel Blob](https://vercel.com/docs/vercel-blob/private-storage).
- Guía local de Route Handlers de Next.js en `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/route.md`.
