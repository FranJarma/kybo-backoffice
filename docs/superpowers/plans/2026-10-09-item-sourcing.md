# Proveedores y cotizaciones por ingrediente

**Objetivo:** primera etapa de la propuesta aceptada: vincular varios proveedores desde la ficha, crear presentaciones y registrar cotizaciones comparables con historial. Pedidos, reposición, importaciones y notificaciones pertenecen a etapas posteriores.

**Diseño:** mantener `items` como catálogo único y `purchase_presentations` como presentación por proveedor. Agregar vínculos proveedor/artículo (sin exigir precio ni presentación) y cotizaciones inmutables con una copia del contenido y unidad cotizados. Incluir las presentaciones existentes al consultar vínculos. Catálogo compartido entre sucursales; permisos vigentes de gestión del catálogo para escribir. No modificar costos ni existencias al cotizar.

**Tecnología:** Next.js App Router, React, Drizzle/PostgreSQL, Zod, Vitest/PGlite. Sin dependencias adicionales.

## Implementación

- [x] Pruebas con base desechable: varios proveedores, referencias existentes, comparaciones por litro, historial, reintentos, permisos, precios vencidos y cambios de presentación.
- [x] Migración aditiva 0011, esquema de vínculos/cotizaciones, validación y servicio transaccional con auditoría e idempotencia existente.
- [x] API `/api/items/[id]/suppliers`: lectura y acciones de vincular, crear presentación y cotizar.
- [x] Pestaña independiente en la ficha; guardar ingrediente y continuar, búsqueda de proveedores, carga por cajas/envases, precio por presentación, fecha/vigencia e historial. Mantener borradores al cambiar pestañas.
- [x] Verificar tipos, lint, pruebas y flujo visual en una base de prueba. Revisar cambios finales sin commits ni push.

## Casos importantes

- Una cotización conserva la presentación original aunque cambie después; una cotización anterior no se compara con un contenido diferente.
- Un precio vencido o un proveedor archivado no se presenta como una oferta vigente.
- Cargar otra vez una operación pendiente es seguro; compartir clave con otro contenido devuelve conflicto.
- La conversión usa aritmética decimal exacta. El precio comparativo es informativo, no una recomendación automática basada sólo en precio.
- La cotización corresponde a una presentación completa, ARS y bajo condiciones comparables; la pantalla pide precio final con impuestos y aclara que no incluye flete.

## Resultado

24 pruebas aprobadas en 5 archivos; tipos y lint sin errores. Flujo comprobado en navegador con base aislada: alta de ingrediente, vínculo sin precio, caja 12 × 1 litro, cotización e historial, vigencia, borrador entre pestañas y rechazo de cotización ante cambio de presentación incluso después de recargar. Revisión independiente: corregidos orden de bloqueos y revisión de presentación capturada al iniciar la cotización. Migración 0011 aplicada en desarrollo y verificada en conexión nueva. Sin commits ni push.

