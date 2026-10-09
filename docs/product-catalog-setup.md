# Categorías y fotografías de productos

La ficha comercial agrega categoría, descripción, foto, orden y habilitación por canal. En el POS, categoría y búsqueda se combinan con paginación. “Agotado temporalmente” se modifica en Sucursales y ubicaciones, dentro de Productos de esta sucursal; no afecta otros locales ni ajusta stock.

## Activación del esquema

La migración preparada es `drizzle/0009_product_catalog.sql`, con snapshot y journal de Drizzle. Es aditiva y requiere la transición anterior finalizada en estado `ready`. No se aplicó a la base de desarrollo o producción. Antes de ejecutar esta versión contra una base existente se debe aplicar 0009 mediante un procedimiento de migración autorizado y registrar su hash en el journal de Drizzle. El comando genérico `db:migrate` sigue bloqueado por el mecanismo de transición anterior: no usarlo ni volver a ejecutar el backfill 0007/0008 para esta actualización.

Los productos existentes conservan sus identificadores y precios. Quedan sin categoría, descripción o foto; todos los canales conservan su habilitación previa, sin crear precios ausentes. Archivar categorías no archiva productos.

## Almacenamiento de fotos

1. Crear un almacén **privado** de Vercel Blob y conectarlo al entorno correspondiente. Usar almacenes separados para pruebas y producción.
2. Configurar `BLOB_STORE_ID` y las credenciales OIDC del despliegue, o `BLOB_READ_WRITE_TOKEN` en el servidor. No exponerlos con `NEXT_PUBLIC_`, subirlos a Git ni enviarlos por chat.
3. Para desarrollo local con un almacén de prueba, configurar el token localmente. La aplicación no crea un proveedor ni inventa credenciales. Si falta configuración, muestra un error al cargar fotos y mantiene operativos los demás campos.
4. Probar subir, guardar, reemplazar y quitar una foto. Una carga provisional se asocia al guardar la ficha; cancelar no cambia la foto persistida.

Entrada JPEG, PNG o WebP de hasta 4 MiB y 25 megapíxeles, sin animación. Se orienta, reduce a 1600 píxeles como máximo y convierte a WebP sin metadatos. HEIC/SVG no están admitidos. Las imágenes se guardan fuera de PostgreSQL y se sirven a usuarios autenticados por `/api/media/[id]`.

Para revisar archivos no usados, ejecutar `node --import tsx scripts/cleanup-product-photos.ts`. Sólo informa. `--apply` autoriza el borrado físico de candidatos sin referencias y con al menos 7 días de antigüedad o desvinculación. La herramienta marca y bloquea el activo antes de borrarlo; una interrupción admite reintento. No se ejecutó sobre ningún almacén real.

Si el proveedor confirma una carga pero falla el registro en base, el servidor intenta eliminarla. Si también falla esa compensación, revisar los objetos UUID huérfanos desde el almacén: no se presenta la carga como exitosa. No borrar archivos sólo por su nombre sin comprobar referencias.

Referencias: [Vercel Blob privado](https://vercel.com/docs/vercel-blob/private-storage), [subidas desde servidor](https://vercel.com/docs/vercel-blob/server-upload).
