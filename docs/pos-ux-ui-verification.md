# Verificación de la mejora POS

Base: `b5946319f0f875854d52a981338157aea3368981`. Rama: `feature/ux-ui-pos-improvements`. Entorno: Windows, Node 24.21.0; pnpm disponible 9.15.1 (el manifest declara 10.33.2), instalación offline con lockfile congelado y node-linker hoisted porque la sesión no permite junctions. No cambió package.json ni pnpm-lock.yaml.

## Baseline antes de editar la aplicación

| Verificación | Resultado observado |
| --- | --- |
| Unit/integration POS, caché, configuración, pedido, localizadores y caja | 8 archivos, 50 casos pasaron, PGlite descartable |
| pnpm lint | Pasó |
| pnpm typecheck | Pasó |
| pnpm build | Falló en Turbopack al crear el proceso Node de PostCSS: salió antes de conectar; referencia a production.module.css fuera del POS. Se inició antes de modificar app; no se considera build aprobado ni medición de bundle de producción. |
| Browser aislado, 1280×800 / 768×1024 / 390×844 | 3 casos de captura pasaron con APIs interceptadas. En móvil se registró expresamente una falla preexistente de líneas del carrito con altura cero; no se contó como flujo funcional aprobado. |

El fixture carga SalesManager y sus componentes reales, usa datos ilustrativos exclusivamente de tests e intercepta toda la red. No registra ventas reales. El bundle congelado y las capturas iniciales quedan en el workspace de la ejecución.

## Task 2: catálogo

- RED: presentación nueva ausente; tests del adaptador y tarjeta fijaron identidad, disponibilidad, precio formateado, foto persistente y cantidad.
- GREEN de presentación: 7 casos. El gate unit integrado inicial: 4 archivos / 32 casos; se ampliaron además las caracterizaciones del loader y límite de caché, sin cambiar esos módulos.
- Gate browser: `playwright test tests/e2e/pos-surface.spec.ts --grep "catalogue uses one responsive grid"`: 1 caso pasó. Verifica 3/2/1 columnas a 1280/768/390, también 360/320, una grilla, sin overflow horizontal, cantidad 1→2 real y ningún lookup/config adicional por filtros o resize.
- Baseline de requests por recorrido: 1 catálogo, 9 configuraciones precargadas, 1 consulta de localizadores. El bundle de fixture con profiling pesa 2.771.954 bytes; no es el bundle optimizado de Next.
- Pendiente: flujo completo en móvil, build final y comparación final de rendimiento; no se atribuyen mejoras de latencia de producción a respuestas simuladas.

## Task 2 fix round 1

El gate aislado ampliado pasó 4/4 casos y los unitarios 34/34. Verifica resize con pedido de dos unidades, total y contadores en cada breakpoint, reapertura de configuración, teclado/foco sin recorte a 390×1024, categoría vacía, nombre largo y fallback. Se conservó thumbnail128 del catálogo previo. El foco a 390×844 sigue ligado al defecto de espacio del pedido que se corrige en Task4.

`pnpm build --webpack` pasó completo, con TypeScript y todas las rutas. El primer intento del runner E2E managed con fallback Webpack se detuvo antes del servidor porque scripts/migrate.ts deshabilita la migración genérica durante la transición del modelo de datos. No se modificó ni se anuló ese bloqueo. La ejecución real de /sales requiere el bootstrap descartable revisado del repositorio; permanece pendiente, no aprobada.



## Task 3: modificadores

RED de implementación: 9 fallos esperados por metadata/copy/identidad visual; después se reprodujo y corrigió maxCount=0. GREEN final: 75 casos en 7 archivos, typecheck, ESLint y Prettier. Browser: 5 casos sobre componentes reales pasaron en 1280/768/390; defaults por producto, receta independiente de selección/precio cero, simple/múltiple, límites, disponibilidad, cancelar/reabrir y edición conservando cantidad/notas con precio recalculado. La apariencia usa key persistida con fallback neutro; no se alteran IDs de binding ni consultas adicionales. Se revisaron capturas de los tres tamaños y el pie del modal conserva acciones visibles.

El bootstrap alternativo del helper de tests se completó con PGlite nueva y usuarios descartables; el E2E integrado quedó bloqueado por permisos de socket a 127.0.0.1:3017. No se ejecutaron casos ni se anuló esa restricción.

La revisión independiente detectó claves semánticas de fixtures que no cubrían los UUID reales de modificadores. Una consulta de lectura de identidades activas permitió completar el adaptador con 24 opciones persistidas de cinco grupos. RED: 20 fallos esperados; GREEN: 49 casos focalizados, typecheck, lint y formato. Renombrar opciones no cambia su apariencia; Sin perlas usa X y Sin salsa círculo neutro. Claves nuevas conservan fallback. No se modificaron datos.

El caso adicional de 390x640 desplaza grupos de 0 a 476 px y comprueba posición/tamaño idénticos de cabecera y pie, sin desplazar diálogo o documento. Pasó 1/1. La revisión acotada aprobó los tres hallazgos corregidos sin nuevos bloqueantes.

## Task 4: pedido

RED: el área de líneas medía 0 px a 390x844. Se extrajeron OrderLine, el diálogo y las transformaciones de configuración, conservando el editor aislado de notas/precios y Deshacer. El manager mantiene borrador, caché y coordinación. Cliente y localizador siguen compartidos entre catálogo y revisión.

GREEN: 55 casos focalizados con PGlite descartable; typecheck, lint y formato correctos. El navegador pasó 14/14 en 35 s con componentes reales y HTTP interceptado, incluidos combos, cantidades, notas, eliminar/deshacer, cliente/localizador, historial/detalle y cambios de ancho. Se verificaron 320/360/390/768/1024/1280 y 390x640. La lista a 390x844 ahora mide 189,875 px; el cobro entra sin desplazar la pantalla a 390x640. En alturas pequeñas el resto del contexto y Seguir agregando se alcanzan desplazando la revisión.

Se eliminó un subtotal redundante que recortaba el cobro en 17 px. Cabecera, total y cobro permanecen fijos al desplazar solo las líneas. La selección de origen/consumo usa el naranja aprobado. Revisión independiente de esta etapa en curso.
