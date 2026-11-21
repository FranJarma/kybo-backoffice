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

