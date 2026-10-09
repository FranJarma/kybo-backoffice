# Productos y categorías Implementation Plan

Goal: completar ficha, categorías, fotos privadas y selección en POS preservando historia y operación por sucursal.
Spec: ../specs/2026-10-06-products-categories-design.md
Execution: inline, autorizado por el usuario el 2026-10-09. Sin commits, push, migración real ni worktree nuevo.

## Tareas
- [x] 1. Datos y catálogo: business-schema, branch-schema y media-schema; migración 0009. Validaciones, referencias, auditoría, actualización compatible. Pruebas unitarias e integración en PGlite desechable.
- [x] 2. Fotografías: SDK Blob privado y sharp; normalización, subida autorizada, lectura privada, asociación transaccional, limpieza en modo informe. Pruebas de formato, límites, propiedad y fallos con almacenamiento simulado.
- [x] 3. Venta: disponibilidad al confirmar, agotado por sucursal con revisión, búsqueda/categoría/paginación del POS. Pruebas de disponibilidad y listados.
- [x] 4. Interfaz: Categorías en navegación, ficha y foto, canales, estado local, tarjetas y filtro del POS. Conservar estilo y accesibilidad. Revisar renderizado.
- [x] 5. Verificación: TypeScript, lint, pruebas específicas, compilación y revisión independiente del diff. Documentar configuración y límites de validación.

## Review Focus
- Actualización desde cliente anterior no borra campos nuevos.
- Archivo de categoría no interrumpe ventas.
- Imagen nueva no sustituye la anterior si guardar falla.
- Agotado de una sucursal no se propaga a otras ni invalida reintentos confirmados.
- Limpieza y asociación de imágenes se serializan sobre el mismo activo.

## Ledger
- Inicio: sólo next-env.d.ts modificado y especificación sin seguimiento. Preservar ambos. No se leen valores de credenciales.
- Ruling: ejecución continua en repositorio original por instrucción explícita; plan y ledger se conservan porque no habrá commits.

- Revision independiente: corregidos validacion de agotado en servidor, compatibilidad de escrituras antiguas de sucursal, ajuste de pagina fuera de rango y etiqueta de categoria archivada. Regresion de venta agotada reproducida antes de corregirla.
- Verificacion: 31 pruebas aprobadas en 9 archivos. Las suites historicas sales.test.ts y catalog.test.ts fallan en su fixture al intentar ejecutar 0008 sin el mapeo de transicion (20 casos no ejecutados). No se considera aprobada la suite completa.
- TypeScript y compilacion de produccion con webpack aprobados. ESLint aprobado excluyendo .local, que contiene la vista previa generada.
- Navegador con PGlite aislado: acceso, sucursal, listado de 32 productos, formulario, paginacion 30+2, agotado deshabilitado y filtro sin resultados. Revisados escritorio y movil (390 px). Corregido el texto del estado vacio filtrado.
- Limite: almacenamiento real Blob y concurrencia en PostgreSQL remoto no verificados. No se modifico .env ni se ejecutaron migraciones reales, commits o push.
