# Plan: grupos reutilizables para combos

**Objetivo:** compartir opciones de productos entre combos sin repetir sus fichas, con revisión explícita de versiones.
**Diseño:** `docs/superpowers/specs/2026-10-18-reusable-combo-groups-design.md` (aprobado).
**Ejecución:** en esta sesión, según la solicitud expresa de implementar. No incluye commit/push ni aplicación de la migración a desarrollo.

## Restricciones

- Mantener `.env`, ventas y versiones existentes; usar bases descartables para pruebas.
- Respetar catálogo, permisos, auditoría, idempotencia y bloqueo de publicación existentes.
- Cantidad y adicionales locales; productos y nombre compartidos por versión.
- No actualizar combos publicados automáticamente ni agregar dependencias.

## Riesgos a verificar

- Inyección de productos o versión de otro grupo: rechazo atómico.
- Archivo y revisión antigua: nuevas asignaciones rechazadas, versión vigente conservada.
- Cambio concurrente e idempotencia: conflicto o repetición sin duplicados.
- Cambios de lista: conservar adicionales de productos restantes y cero para nuevos.
- Ejecución/costeo anteriores: nueva versión compartida no cambia una venta ni combo sin republicar.

## 1. Modelo, migración y servicio

Archivos: `src/db/product-option-group-schema.ts`, `src/db/combo-schema.ts`, `src/db/schema.ts`, `drizzle/0019_product_option_groups.sql`, journal, `scripts/apply-product-option-groups.ts`, `tests/helpers/data-model-database.ts`, `tests/product-option-groups.integration.test.ts`.

- Escribir pruebas y comprobar fallo antes de implementar.
- Crear identidad, versiones y productos inmutables; vínculos compuestos anulables en grupos de combo.
- Implementar `createProductGroupService(db)` con `list(actor)`, `get(actor,id,versionId?)`, `save(actor,input)` y `archive(actor,id,input)`.
- Guardado: `requestId`, `id/revision` opcionales solo juntos, `name`, `productIds` únicos y activos individuales. Lectura retorna `versionId`, `revision` y opciones resueltas.
- Script de migración: verificación del historial y modo lectura por defecto; `--apply` explícito, conteos preservados.
- Verificar servicio, constraints, archivo, autorización e idempotencia en base descartable.

## 2. Publicación de combos

Archivos: `src/modules/combos/service.ts`, `src/modules/combos/group-draft.ts`, pruebas anteriores y `tests/combo-group-draft.test.ts`.

- Agregar `sourceGroupId/sourceGroupVersionId` opcionales como pareja; impedir grupo compartido repetido.
- Validar propiedad de versión, productos exactos y archivo dentro del bloqueo/transacción. Nombre/orden canónicos; adicionales del combo.
- `loadCombo` entrega metadatos de origen/revisión actual por consulta conjunta.
- Utilidad pura para aplicar la revisión: comparación de agregados/quitados/nombre, cantidad conservada, adicionales por producto preservados y cero para nuevos.
- Verificar combos independientes, versiones antiguas, rechazo de contenido manipulado, regresiones de ventas y costeo.

## 3. API, administración y navegación

Archivos: `src/app/api/product-option-groups/{route.ts,[id]/route.ts}`, `src/components/products/option-group-tabs.tsx`, `src/components/products/option-groups-manager.tsx`, `src/app/(operations)/products/combo-groups/page.tsx`, `src/components/modifiers/manager.tsx`, `src/lib/navigation.ts`.

- Leer guías Next instaladas y seguir handlers con parámetros asíncronos, contexto y permisos actuales.
- Administración con listado/búsqueda, modal amplio, selección mediante Autocomplete único, guardar nueva versión/archivar y notificaciones.
- Acceso «Grupos de opciones», tabs por enlace «Modificadores» y «Productos para combos», URLs previas conservadas.
- Validar acceso en handlers y páginas y comportamiento móvil/teclado en navegador.

## 4. Editor de combo y verificación

Archivos: `src/components/products/combo-tab.tsx`, nuevo selector de grupo compartido si ayuda a separar responsabilidades, `tests/e2e/reusable-combo-groups.spec.ts`.

- Seleccionar grupo existente, mostrar origen/versiones y mantener cantidades/adicionales editables.
- Guardar grupo propio como reutilizable sin publicar el combo hasta la acción explícita.
- Revisar cambios antes de aplicar al borrador; cancelar mantiene versión publicada; publicación conserva versión seleccionada y notifica.
- Prueba de navegador con API/base reales: crear, usar en dos combos, publicar versión nueva, actualizar solo uno, escritorio/móvil y foto del resultado.
- Ejecutar tipos, lint, pruebas nuevas/regresiones pertinentes y suite del repositorio; informar fallos preexistentes si aparecen.
- Revisión independiente final, corregir hallazgos materiales y verificar diff. Dejar migración pendiente y cambios sin commit.
