# Detalle de venta en modal

**Spec:** `docs/superpowers/specs/2026-10-26-sale-detail-modal-design.md`. Ejecución inline en el checkout limpio `codex/order-pickup` para ver el cambio en la app local. Base: `f327a7d`. Sin commit/push ni escrituras reales.

## Pasos

- [x] Probar en navegador con APIs simuladas: consulta desde historial conserva filtros/posición, consulta con borrador conserva cliente/localizador/productos, acceso directo se cierra a la caja, respuesta tardía no contamina otro detalle.
- [x] Ejecutar RED antes de código.
- [x] Separar vista de fondo y consulta en `sales-manager.tsx`; evitar reinicios de borrador al consultar, preservar cambios explícitos de mesa y las mutaciones del detalle. Usar guardas de petición para cierre/respuestas tardías.
- [x] Implementar `sale-detail-dialog.tsx` para cabecera, carga/error, foco, cuerpo desplazable y acciones. Simplificar `sale-detail.tsx` y reutilizar la lógica de `fulfillment-panel.tsx` mediante un render de órdenes con progreso por línea y bloqueo de cierre durante operaciones pendientes.
- [x] Conectar enlaces de mesa/localizadores y evitar remontaje por el parámetro de venta. Mantener Historial montado durante consulta.
- [x] Probar cobro, entrega, anulación, reintento incierto y agregar pedido sin borrar el borrador previo. Revisar 600/768/1024/1440 px, foco/Escape y ausencia de duplicación de productos.
- [x] Ejecutar regresiones POS/localizadores, tipos/lint y compilación apropiada; inspección visual y revisión final independiente. Registrar resultados.

## Resultado verificado

- 32 pruebas de navegador aprobadas entre `sale-detail.spec.ts` y `pickup-pos.spec.ts`, con APIs simuladas. Incluyen conservación de búsqueda del catálogo, borrador/cliente/localizador, filtros/foco/posición del historial, acceso directo, errores y respuestas tardías, cobro, anulación, agregado a mesa y entrega incierta con el mismo identificador de operación. Evidencia local: `.next-e2e/sale-modal-ui-final.log`.
- 31 pruebas unitarias aprobadas en seis archivos: componentes táctiles, visibilidad de ventas, validación de clientes, caché del POS, localizadores y cantidades de preparación/entrega. Evidencia: `.next-e2e/sale-modal-unit.log`.
- Revisión independiente: corregidos y reproducidos antes/después dos casos: un enlace de localizadores podía cerrar una devolución pendiente; cambiar `account` podía dejar datos/errores de la venta anterior. Sin observaciones pendientes en la segunda revisión.
- Inspección visual y cuatro comprobaciones finales aprobadas a 600/768/1024/1440 px tras añadir indicadores de despliegue en cobros/comisiones. Cabecera y pie permanecen visibles; cuerpo con scroll propio, sin desborde horizontal, controles de al menos 44 px. Capturas locales: `.next-e2e/sale-modal-600.png` y `.next-e2e/sale-modal-1440.png`.
- ESLint de los archivos TypeScript modificados aprobado. Compilación de producción con webpack y comprobación TypeScript aprobadas en copia temporal sin `.env`; hashes de los once archivos de código/pruebas coinciden con el checkout. Evidencia: `.next-e2e/sale-modal-lint-final.log` y `.next-e2e/sale-modal-build.log`.

No se aplicaron migraciones ni se registraron ventas, cobros, entregas o cambios de stock reales. No se modificaron `.env`, `tsconfig.json` ni `next-env.d.ts`. La implementación se entregó sin staging, commit ni push, en la base `f327a7d`.

## Publicación autorizada

Después de revisar la implementación, el usuario pidió hacer commit y push de esta mejora en la rama actual `codex/order-pickup`. La publicación incluye el modal, la conservación del contexto del POS, las conexiones desde mesas/localizadores, las pruebas y esta documentación.

Verificación previa a la publicación:

- Las 32 pruebas de navegador del modal/POS volvieron a pasar, al igual que ESLint. Los once archivos de código/pruebas coinciden con la copia que pasó la compilación de producción y TypeScript.
- Se ejecutó además la suite general en una copia sin `.env`, con conexiones externas deshabilitadas y únicamente migraciones descartables autorizadas: 676 pruebas aprobadas, una fallida y 86 omitidas; 130 archivos aprobados, diez fallidos y dos omitidos. Evidencia local: `.next-e2e/sale-modal-commit-suite.log`.
- Los diez archivos fallidos se volvieron a ejecutar en una copia limpia del commit anterior `f327a7d`, y reprodujeron los mismos errores: ocho usan fixtures antiguos que no completan la transición de inventario (`catalog`, `inventory`, `modifiers-schema`, `modifiers`, `preparation`, `production`, `recipes`, `sales`); `data-model.concurrency` exige una conexión PostgreSQL dedicada no configurada; `validation` espera un objeto sin el campo `stockTracked` que ya devuelve la implementación anterior. Evidencia: `.next-e2e/sale-modal-baseline-failures.log`.
- Estos problemas preexistentes de la suite general quedan documentados; este commit conserva el alcance de la mejora del modal. No se conectó Neon ni se modificaron configuraciones o datos reales.
