# Revisión de compras e inventario — 2026-09-25

Revisión independiente del incremento respecto de `0700c12`, la especificación y el plan del 25 de septiembre. Incluye esquema/migración, servicio/validación/decimales, guardia de unidad en catálogo, rutas HTTP y componentes integrados. No se modificó código de producto ni se repitió la suite completa. El recorrido E2E general seguía en ejecución al emitir este informe.

## Hallazgos que requieren corrección

### P1 — Se pierde la operación incierta al salir de la pantalla o recargar

Archivo: `src/components/inventory/shared.tsx`, `useOperation`, líneas 45–107; navegación disponible en `src/components/app-shell.tsx`.

La única copia del destino, payload y requestId está en `useState`. Tras confirmar el servidor una recepción sin comprobante y perderse la respuesta, el botón de reintento conserva esos datos únicamente mientras siga montado el componente. Recargar la página o navegar a Inventario desde el menú y regresar destruye esa copia. El formulario permite comenzar otra recepción con otro UUID; el servidor acepta ambas porque son claves nuevas y no existe comprobante para deduplicar. Lo mismo afecta pagos y entradas manuales. El bloqueo local de edición no protege la navegación general.

Reproducción: extender el escenario existente de `route.fetch()` seguido de `route.abort()` con una recarga antes del reintento; ya no aparece recuperación del envío original. Volver a ingresar los mismos datos sin comprobante produce una segunda operación válida. Evidencia: inspección directa de estado y navegación; no se ejecutó navegador adicional en paralelo al E2E en curso.

Conservar y recuperar la operación exacta pendiente a través de recarga/navegación, con contexto de usuario y destino; no permitir sustituirla silenciosamente por una nueva.

### P2 — El borrador de pago se traslada a otra recepción

Archivo: `src/components/inventory/purchases-manager.tsx`, `showDetail` (132–142), `confirmPayment` (228–239) y botón «Volver al listado» (259–263).

Reproducción: abrir recepción A, pulsar «Registrar pago», completar medio/importe/referencia, volver al listado sin confirmar y abrir recepción B. `showDetail` reemplaza `detail` pero no reinicia ni vincula el estado `payment`, `amount`, `paymentMethodId` o `reference`. Por ello el formulario de A se muestra abierto sobre B y «Confirmar pago» envía los datos al nuevo `detail.id`. Si B tiene saldo suficiente el servidor registra el pago contra B. También persiste el borrador al crear una nueva recepción desde el listado.

Evidencia: flujo determinista de los setters y del destino construido en `confirmPayment`. Vincular el borrador al ID de recepción o cerrarlo y reiniciarlo al cambiar de recepción.

### P2 — El conteo positivo permite ingresar stock de un insumo archivado

Archivo: `src/modules/inventory/service.ts`, `adjust`, líneas 216 y 237–248.

`lockIngredient(..., opening)` verifica actividad únicamente para ingresos manuales. Un conteo positivo usa el mismo insumo bloqueado pero no comprueba `archivedAt`, por lo que elude la prohibición de nuevas entradas sobre referencias inactivas.

Reproducción ejecutada en una base PGlite aislada y migrada: ingreso inicial de 1 g a ARS 10; archivar el insumo mediante catálogo; conteo del lote a 2 g con revisión vigente. Resultado real: `remainingQuantity="2.000000"`, `archived=true`, `physicalQuantity="2.000000"`, `usableQuantity="2.000000"`, `stockValue="20.000000"`. Se esperaba rechazar la diferencia positiva, conservando las bajas sobre lotes archivados.

## Veredicto

Requiere corregir los tres hallazgos antes de cerrar este incremento. El diseño principal está implementado de forma coherente: cantidades y valoración con BigInt, desconocido distinto de cero, bloqueo transaccional por insumo/recepción, clave persistida con actor y huella, comprobante normalizado, instantáneas de recepción, revisión de lote, permiso/Origin y respuestas privadas. No se encontró otro fallo demostrado de esos contratos en esta revisión.

Las cuatro advertencias del preflight fueron atendidas: el hash de pago incluye recepción, los locks de presentaciones preceden sus referencias, revivir un lote originalmente desconocido conserva valor pendiente y los lotes tienen paginación con positivos primero. Las pruebas existentes cubren esos mecanismos y casos centrales; los resultados generales comunicados por implementadores no se presentan aquí como ejecución propia. PGlite no demuestra por sí solo intercalados reales de múltiples conexiones PostgreSQL, por lo que la revisión de orden de locks sigue siendo parte de la evidencia de concurrencia. No se conectó ningún servicio externo ni se realizó integración/despliegue.

## Cierre acotado de correcciones — primera pasada

Inspección de los cambios y sus regresiones, sin repetir suites. El bloqueo del conteo positivo sobre insumos archivados queda resuelto: se comprueba la fila del insumo bajo lock antes de modificar lote/saldo; la regresión exige rechazo, saldo intacto y permite conteo negativo/merma. El implementador comunica 65/65 pruebas generales aprobadas.

La recuperación de una operación incierta ahora guarda destino y payload exacto antes del fetch en sessionStorage, separado por actor/tipo; recarga/navegación restaura el reintento y conserva errores de autenticación o resultados inciertos. El destino recuperado está limitado a las rutas de escritura previstas. La prueba de respuesta perdida ahora recarga antes de reintentar. Esto atiende el P1 dentro del alcance de la misma pestaña; cerrar la pestaña y uso offline no son parte del alcance.

El P2 de borradores de pago está corregido para abrir una recepción existente mediante showDetail, pero **queda una ruta del mismo hallazgo sin cerrar**: begin() oculta el formulario sin limpiar importe/medio/referencia y onReceived() cambia detail sin limpiarlos. Repro: borrador de pago en A → listado → nueva recepción B → confirmar B → Registrar pago; reaparecen los valores de A. Limpiar esos campos en begin/onReceived cierra esta ruta.

Además, el botón «Nueva recepción» todavía no incluye disabled={locked}; los controles posteriores impiden enviar, pero la regresión de recuperación espera que este botón esté deshabilitado y fallará. El navegador integrado continúa pendiente; estos dos puntos se notificaron al coordinador antes del cierre.

## Cierre final acotado

Los tres hallazgos de esta revisión quedan **resueltos por inspección del código actualizado**. `begin()`, `onReceived()` y `showDetail()` limpian medio, importe, referencia y fecha del borrador de pago; «Nueva recepción» se deshabilita con el estado conjunto de operaciones. No quedan bloqueos de código demostrados dentro del alcance revisado.

Se inspeccionó también la corrección numérica focal: `safeScaled` comprueba magnitudes BigInt antes de persistir netos/totales de 18 dígitos y valor/costo aplicado de 24 dígitos, coincidiendo con la precisión de sus columnas. Los errores son VALIDATION/400 y permanecen dentro de la transacción. Dos regresiones verifican desbordamiento de entrada y recepción, ausencia de saldo y rollback de la clave de operación. El coordinador comunica 67/67 pruebas aprobadas; no se volvieron a ejecutar desde esta revisión.

La prueba de navegador incluye recuperación tras recarga y cambio de recepción; se añadió además el camino de nueva recepción. Se notificó una mejora menor de esa última aserción: completar un nuevo importe no vacío antes de iniciar la recepción nueva para que el caso detecte específicamente la antigua fuga de borrador.

**Veredicto de revisión: aprobado en el alcance de código inspeccionado.** El cierre de ejecución sigue pendiente del reporte E2E y de las comprobaciones finales build/typecheck/lint que registra el coordinador. Esta aprobación no afirma que esos comandos ya hayan terminado ni autoriza integración o despliegue externo.

### Cierre de ejecución registrado por el coordinador

Después del veredicto se completaron los gates: 67/67 pruebas de dominio/HTTP, compilación, TypeScript y ESLint aprobados. Los 11 escenarios de navegador fueron comprobados entre la ejecución completa y las repeticiones focales; el caso de borrador de pago hacia una recepción nueva se reforzó con valores no vacíos y aprobó. Ver `verification-stock.md` para distinguir los resultados completos de las repeticiones. No quedan verificaciones pendientes para entregar este incremento local; la validación con Neon sigue fuera de su alcance.
