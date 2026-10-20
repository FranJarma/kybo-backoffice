# Verificación: grupos reutilizables para combos

## Uso

En **Productos → Grupos de opciones**, los tabs separan Modificadores y Productos para combos. Un grupo de productos se crea con fichas existentes y se selecciona desde Componentes de un combo mediante «Usar grupo existente». Cada combo mantiene sus unidades y adicionales por canal.

Para aprovechar «Gaseosa a elección» ya cargado: abrir el combo de waffle, entrar en Componentes, usar «Guardar como grupo reutilizable» y publicar los componentes. En el combo de superpancho se puede seleccionar ese grupo existente. No se vuelven a cargar las bebidas ni sus costos. Los grupos no se fusionan automáticamente por nombre.

Editar un grupo publica una versión nueva. Cada combo permite revisar agregados, quitados y cambios de nombre, aplicar al borrador y publicar cuando corresponda. Hasta entonces conserva su versión anterior. Archivar impide nuevas asignaciones y mantiene las existentes y las ventas.

## Base de datos

Migración: `drizzle/0019_product_option_groups.sql`. Agrega tablas de grupos y versiones y vínculos opcionales a los grupos de combo. Preserva identidades y opciones anteriores. No crea stock ni cambia precios o costos.

El script `scripts/apply-product-option-groups.ts` verifica el historial y trabaja en una transacción de solo lectura por defecto. Solo aplica con `--apply`. El 18/10/2026 se aplicó la migración a desarrollo por solicitud explícita del usuario y se verificó nuevamente el historial: migración registrada, sin pendientes. La comparación de huellas antes/después confirmó la conservación de los 20 productos, 32 precios, 0 ventas, 1 versión de combo, 2 grupos y 5 opciones existentes. Se verificaron las 3 tablas nuevas, los 2 campos de origen y los 2 triggers de inmutabilidad.

```powershell
node --import tsx scripts/apply-product-option-groups.ts
# Aplicación explícita, cuando corresponda:
node --import tsx scripts/apply-product-option-groups.ts --apply
```

## Pruebas automatizadas

La ejecución final de las pruebas nuevas y regresiones relacionadas pasó: **52 pruebas en 11 archivos**. Cubre grupos/versiones, membresía y propiedad de versiones, rechazo atómico de datos manipulados, archivo, permisos, idempotencia y cantidad de auditorías, migración con datos anteriores, independencia de cantidades/adicionales, costeo por sucursal y conservación de una venta confirmada después de actualizar el grupo y republicar el combo. Incluye regresiones de catálogo, onboarding, caché, navegación y ventas de combos.

La revisión independiente detectó dos problemas de reintentos en la interfaz: convertir por separado grupos propios idénticos podía compartir la identidad de operación, y reintentar un archivo con respuesta perdida podía informar un conflicto. Ambos casos se agregaron a la prueba real de navegador y se reprodujeron antes de sus correcciones. Las conversiones tienen identidad por borrador y los reintentos conservan su solicitud hasta completarla.

La prueba final de Chrome pasó (1/1, 57,8 segundos de ejecución del caso), con una aplicación y base descartable reales, sin simular respuestas de datos. Comprueba creación y edición del grupo, reutilización en dos combos, cancelación de una revisión, actualización y publicación de uno solo, conservación de adicionales y cantidades, conversión independiente de grupos idénticos y recuperación de un archivo cuyo servidor confirma pero cuya respuesta se interrumpe deliberadamente. Se inspeccionaron las capturas de escritorio y móvil.

## Estado de la suite completa

Se ejecutó también `pnpm test`: **298 pruebas pasaron, 1 falló y 85 quedaron omitidas; 67 archivos pasaron, 10 fallaron y 1 quedó omitido**. No se presenta la suite completa como verde.

Los fallos ajenos a esta implementación son:

- `tests/catalog.test.ts`, `inventory.test.ts`, `modifiers-schema.test.ts`, `modifiers.test.ts`, `preparation.test.ts`, `production.test.ts`, `recipes.test.ts` y `sales.test.ts`: sus fixtures antiguos intentan finalizar la transición sin el mapeo explícito requerido por `0008_data_model_finalize.sql`.
- `tests/data-model.concurrency.test.ts`: falta `KYBO_TEST_DATABASE_URL`; las pruebas se niegan correctamente a usar la base de desarrollo como alternativa. No se afirma haber probado concurrencia entre conexiones PostgreSQL independientes.
- `tests/validation.test.ts`, caso `stores an unknown item cost as null`: expectativa antigua que omite el campo predeterminado `stockTracked: true`. El validador y esta prueba no se modificaron en este trabajo.

El control final de tipos (`tsc --noEmit`) y `git diff --check` pasaron. Lint de los archivos modificados: sin errores, con dos advertencias previas en `app-shell.tsx` (`UserRound` y `dateLabel` sin uso). Los logs de las ejecuciones se conservaron en `.local/reusable-groups/`, excluidos de Git.

Se mantuvo la rama existente. `.env` permanece intacto.
