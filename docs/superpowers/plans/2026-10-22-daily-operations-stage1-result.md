# Operación del día — resultado de etapa 1

Estado al cierre: etapa 1 implementada y migración 0025 aplicada en Neon el 22/10/2026 con autorización expresa del usuario, quien también autorizó commit y push. `.env` permanece intacto.

## Qué incorpora

- Ruta `/operations/day`, menú «Operación del día» y acceso desde el panel de Reposición del punto de venta.
- Tareas por prioridad, ubicación, tipo y responsable; equipo/mis tareas, historial y páginas de 50 tareas.
- Asignación, bloqueo con motivo, cancelación autorizada y revalidación de permisos antes de reintentar una operación.
- Confirmación de sugerencias de traslado por encargado, conservando el responsable. El empleado asignado ve artículos/cantidades y confirma el movimiento interno completo. La reserva y los movimientos usan los servicios actuales, en la misma transacción que la tarea.
- Incorporación de producción y traslados internos existentes sin duplicar documentos. Producción mantiene la orden como fuente de responsabilidad, horario y estado; se puede comenzar desde el tablero y finalizar desde producción.
- Stock físico, reservado, no utilizable y disponible por artículo/ubicación, con búsqueda y unidades explícitas. Una entrada prevista nunca se suma al físico.
- Sugerencias por mínimos y objetivos existentes, remanente visible cuando Depósito no alcanza, fuentes que retienen su propio objetivo y compromisos descontados una sola vez.
- Actualización cada minuto mientras está visible, errores explícitos y formularios que conservan el texto ante conflictos. Los responsables deshabilitados requieren reasignación.

## Decisiones de implementación

1. Se trabajó sobre `codex/order-pickup` porque el plan depende de cambios anteriores sin commit. Se conservaron; no se creó un checkout que los omitiera. La revisión se limitó a etapa 1.
2. El traslado interno existente ya registra origen y destino al despachar: se conserva ese comportamiento, sin una segunda recepción artificial. Los intersucursal siguen en su circuito de encargado.
3. Se añadió `confirm_transfer` para convertir una sugerencia en orden autorizada sin duplicar carga ni perder la asignación. El empleado no puede confirmar cantidades sugeridas por su cuenta.
4. Stock cero genera prioridad alta. No se inventa un bloqueo actual de venta ni un pronóstico crítico sin evidencia; las reglas de cobertura llegarán en etapa 3. Los vencimientos sí elevan prioridad aunque no cambie la orden.
5. Las pruebas visuales usan los componentes reales y CSS del proyecto con APIs simuladas. Evitan tocar datos reales; no equivalen a probar una sesión desplegada contra Neon.
6. El registro de ejecución queda en `.superpowers/sdd/2026-10-22-daily-operations-01-board/`, porque no hubo commits que lo sustituyan.

## Verificación

- Antes del push autorizado: 56 pruebas pasan en 14 archivos, incluyendo tablero, navegación, localizadores, clientes, faltantes de inventario y combos.
- 36 pruebas de etapa 1 y regresiones de producción, traslados y reposición: pasan, 10 archivos.
- 8 pruebas de navegación: pasan. Se actualizó la lista permitida del empleado para incluir su nuevo tablero.
- 3 pruebas de navegador: pasan en 600×960, 768×1024 y 1024×768. Incluyen asignación, conflicto que conserva texto, recuperación después de una operación confirmada con fallo de refresco, vista de stock y ausencia de desborde horizontal.
- TypeScript: pasa. ESLint del alcance y revisión de espacios del diff: verificados.
- Compilación de producción con Webpack: pasa e incluye `/operations/day` y sus APIs. Turbopack falla al iniciar/conectar su proceso local de CSS en este entorno; no se cambió el compilador por defecto del proyecto. Se restauraron los cambios automáticos del build en `tsconfig.json` y `next-env.d.ts`.
- Revisión independiente: cuatro hallazgos importantes y dos inicialmente menores, todos atendidos con regresiones que fallaron antes del arreglo. No quedaron observaciones menores diferidas.

La corrida general de 120 archivos no fue verde. Detectó fallos propios durante la corrección, luego revalidados con las pruebas anteriores, y estos problemas preexistentes/fuera del alcance:

- `catalog.test.ts`, `inventory.test.ts`, `modifiers-schema.test.ts`, `modifiers.test.ts`, `preparation.test.ts`, `production.test.ts`, `recipes.test.ts`, `sales.test.ts`: fixtures antiguos intentan finalizar la transición sin su mapeo explícito.
- `data-model.concurrency.test.ts`: requiere `KYBO_TEST_DATABASE_URL` para PostgreSQL descartable. No se autorizó ni utilizó otra base como alternativa.
- `validation.test.ts`, caso `stores an unknown item cost as null`: la expectativa antigua omite el valor predeterminado `stockTracked: true`.

No se afirma que toda la suite histórica esté verde ni que PGlite pruebe exclusión entre dos conexiones PostgreSQL reales.

## Habilitación y próximos pasos

La migración aditiva está en `drizzle/0025_daily_operations.sql`, registrada en el journal y verificada en memoria, incluyendo rollback y restricciones. Se aplicó exclusivamente la 0025 con `scripts/apply-daily-operations.ts --apply`: el historial coincidió y se conservó el contenido de las 94 tablas existentes. Una segunda ejecución sin `--apply` permite verificar el estado sin cambios.

La consulta real del tablero en Neon pasó: una sucursal activa y 150 registros de stock por artículo/ubicación. No se registraron movimientos ni tareas de prueba. Actualmente falta configurar mínimos de reposición; la pantalla lo indica y puede mostrar el stock, pero no inventa necesidades con objetivos desconocidos.

Etapas 2–4 continúan pendientes: conteos de apertura/cierre y revisión, pedidos pendientes a proveedores con cobertura 7+3, y rendimientos. En etapa 1 las compras son sugerencias/enlaces a recepciones existentes; no se tramitan pedidos ni se envían mensajes automáticamente.
