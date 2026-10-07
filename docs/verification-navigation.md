# Verificación de navegación — 2026-09-28

Implementación en el repositorio original, conservando la integración anterior del modelo de datos.

## Cambios

- Áreas: Ventas, Cocina, Productos, Inventario y compras y Configuración; Inicio independiente.
- Rutas explícitas y anidadas para las pantallas existentes. Recetas y Modificadores son pantallas hermanas de Productos.
- Artículos reúne el catálogo físico; Catálogo y precios representa los productos vendibles. Presentaciones de compra deja explícito su propósito.
- Sidebar y Breadcrumb comparten rutas, nombres, jerarquía y visibilidad. Una sola pantalla activa; antecesores restringidos sin enlace.
- Breadcrumb semántico, enlaces con foco visible y adaptación a pantallas pequeñas. Se conserva el menú móvil con cierre al navegar y devolución del foco.
- Controles del servidor para catálogo y operaciones. Gestionar catálogo no habilita producción ni inventario operativo a personal.
- 16 redirecciones permanentes preservan enlaces anteriores y parámetros de consulta. APIs y entidades internas mantienen sus rutas.
- Referencias de navegación de las pruebas E2E actualizadas, sin ejecutar el arnés que prepara bases.

## Evidencia

- Compilación de producción con Webpack: exitosa; rutas canónicas presentes, sin conflictos de layouts.
- TypeScript: sin errores.
- ESLint sobre código fuente, configuración y pruebas de navegación/E2E: sin errores.
- 11 pruebas de navegación, renderizado semántico y controles de acceso: aprobadas.
- Comprobación HTTP de las 16 redirecciones en localhost: todas responden 308 y conservan `?recipe=nav-check`.
- `git diff --check`: sin errores de espacios.
- Hashes de `.env` y `scripts/create-user.ts`: coinciden con los preservados. HEAD sin cambios.

## Límite de la revisión

El navegador de Codex llega al ingreso: no dispone de una sesión autenticada.
La revisión visual del contenido protegido y la interacción del menú móvil con
teclado quedan pendientes de esa sesión. Las pruebas de renderizado verifican
estructura y atributos; no sustituyen una comprobación visual ni de foco en navegador.

En esta tarea no se ejecutaron migraciones, no se hicieron commits ni push.
