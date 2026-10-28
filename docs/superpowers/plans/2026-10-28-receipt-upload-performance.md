# Carga del comprobante del posnet

Pedido: investigar y reducir la demora al cargar la foto del comprobante de cierre de lote. Cambios locales sobre `7595c02`, conservando las mejoras anteriores de Caja y las indicaciones de formularios.

## Diagnóstico

- Las imágenes de hasta 3 MB se enviaban completas. Después del guardado, la vista previa solicitaba otra vez la foto al servidor privado, repitiendo autorización, consultas y descarga.
- El servicio repetía la resolución del contexto de usuario/sucursal en cada una de sus dos fases. El perfil previo registró 19 viajes a PostgreSQL, incluidos BEGIN/COMMIT/ROLLBACK, abortando antes del INSERT. Solo ese recorrido y la normalización consumieron 1.33–1.37 s, con aproximadamente 59 ms por viaje.
- Una prueba independiente del almacenamiento privado, con imagen sintética de 1.15 MB, midió 2.18 s al subir y 0.69 s al leer. El objeto temporal se eliminó al terminar; no se registró un comprobante de negocio.

## Cambios

- Se comprimen también las fotos de más de 768 KiB, conservando un máximo de 2800 px por lado largo, proporciones y orientación. WebP usa calidad 82/72. Las imágenes detalladas pueden conservar más bytes dentro del límite previo de envío de 3 MB, en vez de seguir degradándose para alcanzar un tamaño fijo.
- La vista previa usa una URL local del archivo desde su selección y muestra el estado de preparación/guardado. Solo aparece «Comprobante agregado» después de recibir el ID persistido. El borrador conserva la URL privada del servidor para reabrirlo; no guarda URLs blob.
- El cierre sigue bloqueado mientras se sube. Ante error se descarta la vista previa pendiente y puede seleccionarse el mismo archivo para reintentar. Las URLs locales se revocan al reemplazar, quitar, fallar o desmontar.
- La autorización preliminar ya no bloquea toda la caja. La transacción final conserva el orden sucursal → caja → sesión y vuelve a resolver permisos actuales después de cualquier espera. Si se cerró la jornada o se revocó el acceso durante la subida, rechaza el adjunto y elimina el objeto sin reclamar.

## Evidencia

- RED observado: falta de vista previa durante una subida pendiente; foto mediana enviada íntegra; 16 consultas de dominio superando el presupuesto; orden invertido de bloqueos durante la primera optimización.
- GREEN: 40 pruebas en seis suites de Caja, fotos, HTTP y ventas; 38 casos de interfaz de Caja, incluidos errores/reintentos, cierre durante la subida y permisos revocados; revisión independiente sin bloqueantes tras restaurar el orden de bloqueo.
- Compresión real en navegador de una muestra JPEG: 2,276,380 → 1,256,040 bytes, reducción del 45%.
- Perfil final en Neon: 14 viajes, abortando antes del INSERT, y 1.04–1.08 s para el mismo recorrido medido. Aproximadamente un 20% menos de tiempo que antes, además del ahorro en envío y de evitar la descarga para la vista previa. No es una medición del tiempo total en un teléfono o conexión móvil.
- TypeScript detectó un archivo generado de Next truncado en `.next/dev/types/validator.ts`; se regeneró con `next typegen` y se restauraron exactamente `tsconfig.json` y `next-env.d.ts`. `pnpm typecheck`, `pnpm lint` y `git diff --check` finales aprobados.
- `pnpm run test --pool=threads --bail=1` ejecutó la suite general y terminó con nueve archivos fallidos: ocho fixtures antiguos (`catalog.test.ts`, `inventory.test.ts`, `modifiers-schema.test.ts`, `modifiers.test.ts`, `preparation.test.ts`, `production.test.ts`, `recipes.test.ts`, `sales.test.ts`) fallan antes de sus casos por la transición explícita de inventario de la migración 0008; `validation.test.ts` mantiene la expectativa antigua que omite `stockTracked`. Son los problemas previos ya reproducidos sobre una copia limpia y documentados en `2026-10-27-cash-register-result.md`. La ejecución con corte reportó 13 casos aprobados, 1 fallido y 80 omitidos; no se declara aprobada la suite general.

Registros locales en `.superpowers/cash-implementation/`: `photo-performance-{red,green}-{db,browser}.log`, `photo-lock-order-red.log`, `photo-performance-final-tests-v2.log` (40 aprobados), `photo-performance-final-browser.log` (38 aprobados), `photo-compression-report.json`, `photo-profile-{before,final}.log`, `photo-storage-profile.log`, `photo-performance-{types,lint}-final.log` y `photo-performance-project-tests.log`.

Los perfiles SQL bloquean todas las escrituras y simulan el almacenamiento. No hubo migraciones, cambios en `.env`, movimientos de caja, cierres, cobros ni comprobantes reales durante esta implementación.

## Publicación autorizada

El 28/10/2026 el usuario autorizó commit y push de las mejoras del cierre de Caja, las indicaciones de campos obligatorios y la carga de comprobantes. Los documentos anteriores describen la etapa local previa a esta autorización.

La verificación conjunta previa al commit aprobó 76 pruebas en 16 archivos, 75 casos de interfaz, build de producción con Webpack, TypeScript, ESLint y revisión de whitespace. Se mantienen documentados arriba los fallos previos de la suite general.

Se excluyen de Git y ESLint `/output/pdf/` y `/tmp/pdfs/`, que contienen los PDF y generadores del otro chat. Se conservan localmente; el alcance revisado tiene 65 archivos y ninguna referencia a esas carpetas en los trazados del build. Los registros conjuntos quedan en `publication-{tests,browser,build,types,lint}.log` y el listado de archivos aprobado en `publication-manifest.json`, dentro de `.superpowers/cash-implementation/`.
