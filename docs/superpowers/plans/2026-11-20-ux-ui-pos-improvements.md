# POS UX/UI Improvements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mejorar visualmente y refactorizar el punto de venta de Kybo, conservando sus reglas operativas, reduciendo responsabilidades mezcladas y evitando regresiones de rendimiento.

**Architecture:** Evolucionar el módulo de ventas existente con componentes por responsabilidad, una única fuente de estado del pedido y lógica monetaria reutilizada. Compartir datos, eventos y validaciones entre escritorio, tablet y celular; adaptar la presentación mediante layout responsive. Cambiar backend únicamente donde sea necesario para sostener las reglas de cobro, permisos, stock y recuperación.

**Tech Stack:** Stack existente: Next.js 16, React 19, TypeScript, Tailwind 4, Radix, Lucide, Drizzle/PostgreSQL, Vitest y Playwright; pnpm, Node >=24 según package.json verificado. No introducir otro framework ni actualizar dependencias por este rediseño.

**Spec:** Contrato funcional y visual incluido en las secciones 2–7 de este documento; Figma canónico enlazado en la sección 3. Este archivo viaja con el plan.

**Repository:** https://github.com/FranJarma/kybo-backoffice

**Target branch:** `feature/ux-ui-pos-improvements`

**Proyecto de ChatGPT:** Sistema de Gestión de Kybo.

**Estado de esta entrega:** implementación en curso en la feature branch, con contratos concretos en sección12 y evidencia actualizada en docs/pos-ux-ui-verification.md.

## Global Constraints

- Branch exacta: `feature/ux-ui-pos-improvements`.
- Código, variables, funciones y nombres de archivos en inglés. Copy de la interfaz en español argentino.
- Leer AGENTS.md y las instrucciones de los directorios afectados. El AGENTS.md actual exige leer las guías pertinentes de `node_modules/next/dist/docs/` antes de programar para esta versión de Next.js.
- Reutilizar `src/components/ui/search-combobox.tsx` para relaciones con búsqueda. Mantener controles en línea y pocas interacciones en la toma de pedidos.
- Respetar el contrato funcional existente, precios por canal, modificadores, combos, permisos, localizadores, stock, caja, impuestos y comisiones.
- Reutilizar componentes y helpers existentes antes de crear alternativas. No duplicar lógica por tamaño de pantalla ni por estado de un mockup.
- El Figma actualizado es autoridad visual para el POS. Los datos, permisos y reglas reales del repositorio son autoridad operativa.
- Los precios, recetas, selecciones y ventas del prototipo son ilustrativos; no introducirlos como datos de producción.
- No desplegar en producción, realizar operaciones reales ni ejecutar migraciones sobre datos productivos durante esta tarea.
- No cambiar dependencias, infraestructura o módulos ajenos al POS sin una necesidad demostrada dentro del alcance.
- Crear commits pequeños y coherentes dentro de la feature branch al completar tareas verificadas. No mergear a main como parte de este handoff.

## Review Focus

1. Cambiar de ancho, cerrar un modal o abrir historial no debe perder ni duplicar el borrador del pedido. Se verifica en tareas 2–4.
2. Un grupo multiselección o con mínimos/máximos distintos no puede transformarse accidentalmente en selección exclusiva por copiar el ejemplo de perlas. Se verifica en tarea 3.
3. En pago dividido, efectivo recibido y monto aplicado son distintos; el vuelto no debe contarse como ingreso aplicado a la venta. Se verifica en tarea 5.
4. Una respuesta lenta, doble toque, pérdida de conexión o resultado incierto no debe generar dos ventas, dos cobros ni dos reservas. Se verifica en tarea 6.
5. El refactor no puede eliminar la carga diferida/caché existentes, multiplicar consultas de localizadores ni producir solicitudes por cada tarjeta o cambio de viewport. Se verifica en tareas 1, 2 y 7.

---

## 1. Punto de partida verificado

Se revisaron metadatos de main, AGENTS.md, DESIGN.md, inventarios de src/tests y las primeras 170 líneas de SalesManager. No se hizo una auditoría exhaustiva del repositorio ni se corrieron pruebas.

- Main observado: `b5946319f0f875854d52a981338157aea3368981`.
- Ese commit incorpora el PR #20 de mejoras de velocidad. Actualizar la referencia al iniciar el nuevo chat: este SHA es evidencia de preparación, no una orden de trabajar sobre código viejo.
- `src/components/sales/sales-manager.tsx` tiene aproximadamente 56 KB. El fragmento leído concentra estado de vista, borradores, pedido, cliente, localizador y coordinación de cobro. Es candidato a extracción gradual, no a reemplazo total.
- Ya existen `PaymentDialog`, `ProductConfigurator`, `ComboConfigurator`, `CustomerPicker`, `OrderControls`, `Cart`, `ProductPicker`, `PosRequestCache`, `CashStatusGate` y manejo de localizadores.
- Ya hay tests de pagos, configuración, concurrencia, carga del catálogo, caché y experiencia táctil. Ampliarlos antes de crear suites equivalentes.

### Archivos existentes que deben inspeccionarse

| Responsabilidad | Archivos reales |
| --- | --- |
| Entrada y coordinación | `src/app/(selling)/sales/page.tsx`, `src/components/sales/sales-manager.tsx` |
| Catálogo y pedido | `src/components/sales/cart.tsx`, `cart-order.tsx`, `catalogue-loader.ts`, `request-cache.ts`, `touch-selection.ts` |
| Contexto del pedido | `customer-picker.tsx`, `fulfillment-panel.tsx`, `order-controls.tsx`, `shared.tsx` dentro de `src/components/sales/` |
| Configuración | `src/components/sales/product-configurator.tsx`, `combo-configurator.tsx`, `src/modules/recipes/configuration.ts` |
| Cobro | `src/components/sales/payment-dialog.tsx`, `payment-math.ts`, `stock-shortage-notice.tsx`, `replenishment-panel.tsx` |
| Dominio y servidor | `src/modules/sales/types.ts`, `validation.ts`, `service.ts`, `reservation.ts`, `http.ts` |
| Rutas | `src/app/api/sales/route.ts`, `src/app/api/sales/[id]/[action]/route.ts`, rutas existentes de configuración y combos |
| Primitivas y formato | `src/components/ui/button.tsx`, `dialog.tsx`, `input.tsx`, `search-combobox.tsx`, `operation-alert.tsx`, `src/lib/number-format.ts` |
| Estilos y convenciones | `DESIGN.md`, `src/app/globals.css`, `src/components/sales/shared.tsx`, configuración de fuentes y superficies existente |

`SalesManager` importa actualmente `CartLine`, `newCartLine`, `cartTotal` y `appendCartLine` desde `./cart`; `PaymentDraft` desde `./payment-dialog`; `PublicConfiguration` desde `@/modules/recipes/configuration`. Esas interfaces deben inspeccionarse y preservarse o migrarse de forma explícita.

## 2. Alcance de la feature

### Incluido

1. Catálogo, categorías, búsqueda y tarjetas de productos siguiendo el diseño unificado.
2. Selección y edición de modificadores; cancelación sin guardar; cantidades y revisión del pedido.
3. Vista de pedido para tablet/celular, manteniendo el resumen lateral en escritorio.
4. Cobro en efectivo, crédito, débito, transferencia y pago dividido.
5. Validaciones, carga, errores recuperables, resultado incierto y confirmación de venta.
6. Refactor de las responsabilidades del POS y las optimizaciones justificadas por medición o duplicación observable.
7. Pruebas funcionales, responsive, de regresión y de rendimiento pertinentes.
8. Actualización acotada de documentación de diseño y del módulo.

### Fuera de alcance

- Rediseño global del backoffice, historial completo, compras, RRHH, recetas administrativas o inventario.
- Cambios de infraestructura, hosting, autenticación o esquema monetario general.
- Crear integraciones nuevas de Mercado Pago, posnet, impresora o facturación. Conservar y conectar las que ya existan.
- Cambiar políticas comerciales, precios, recetas, impuestos, comisiones o roles por lo que se ve en Figma.
- Reescritura total del POS, un nuevo estado global por conveniencia, migración de librería de UI o un framework genérico para todas las pantallas.
- Convertir los estados estáticos del Figma en rutas independientes o crear una implementación completa separada por dispositivo.

## 3. Referencias canónicas de Figma

Archivo: https://www.figma.com/design/C0M35OEPwFwn7aqaabqKaq

Página: **Backoffice - Toma de Pedidos** (`159:666`). No usar antiguas propuestas ni la sección de archivo técnico.

| Referencia | Nodo |
| --- | --- |
| Venta / catálogo, modificadores y pedido | `196:3981` |
| Cobro / estados responsive | `196:3982` |
| Fundamentos y componentes canónicos | `196:3983` |
| Contrato de diseño y pendientes | `200:666` |
| Catálogo desktop | `160:686` |
| Catálogo tablet / celular | `186:2136` / `186:2972` |
| Modificadores desktop / tablet / celular | `171:1768` / `186:2830` / `186:3670` |
| Revisión de pedido tablet / celular | `196:3991` / `196:4050` |
| Cobro efectivo desktop actualizado | `198:2155` |
| Diálogo efectivo desktop, panel interno actualizado | `198:2922` |
| Inicios del prototipo desktop / tablet / celular | `209:667` / `209:678` / `209:689` |
| Instrucciones y límites del prototipo | `215:11826` |

Links rápidos:

- Venta: https://www.figma.com/design/C0M35OEPwFwn7aqaabqKaq?node-id=196-3981
- Cobro: https://www.figma.com/design/C0M35OEPwFwn7aqaabqKaq?node-id=196-3982
- Prototipo desktop: https://www.figma.com/proto/C0M35OEPwFwn7aqaabqKaq/Carta-Kybo?node-id=209-667
- Prototipo tablet: https://www.figma.com/proto/C0M35OEPwFwn7aqaabqKaq/Carta-Kybo?node-id=209-678
- Prototipo celular: https://www.figma.com/proto/C0M35OEPwFwn7aqaabqKaq/Carta-Kybo?node-id=209-689

El prototipo tiene un pedido precargado, importes predefinidos y un recorrido guiado del Oreo Iced Latte. No representa cálculos reales ni define todos los estados de edición, error o impresión. Implementar datos y lógica reales; no portar la simulación del prototipo al código.

## 4. Contrato visual y responsive

- Azul POS: `#013E5E`. Naranja de acción y selección activa: `#FF8000`.
- Tarjetas de producto blanco hueso `#FFFAF0`; superficies neutras `#F3F6F8`; borde `#D5E1E8`; texto secundario `#567184`.
- Figma utiliza Barlow. El DESIGN.md existente utiliza Manrope y otra paleta. Documentar una excepción de superficie para el POS y cargar la fuente aprobada con el mecanismo existente de Next.js; no cambiar silenciosamente todo el backoffice ni los componentes globales.
- Respetar contraste, foco visible, estados deshabilitados y señales adicionales al color.
- Fotos reales sin fondo, sombra suave y logo intacto. Semicírculo derecho con franjas horizontales basadas en el producto; no un mosaico de píxeles.
- Modificadores: círculo grande de color + nombre del sabor. Chocolate marrón, mango amarillo, mora violeta, frutilla rojo; completar las opciones según su configuración real.
- “Sin perlas”: X grande azul, sin círculo gris de fondo. No aplicar ese cambio a “Sin salsa” sin necesidad de diseño.
- Copy exacto de pertenencia a receta: **“Viene incluida en la receta”**. No confundir esa condición con la selección actual.
- Tamaño táctil mínimo 44 × 44 px; acciones operativas entre 48 y 56 px según Figma.
- Referencias: 1280 × 800, 768 × 1024 y 390 × 844. Validar además 320, 360 y 1024 px y alturas reducidas.
- Catálogo desktop: tres columnas cuando el ancho lo permite y pedido a la derecha. Tablet vertical: dos columnas y acceso al pedido abajo. Celular: una columna.
- Compartir estado y lógica; usar CSS para distribución. No renderizar dos catálogos montados simultáneamente ni duplicar solicitudes por breakpoint.
- Cabecera/acción principal accesibles, contenido desplazable; no bloquear la salida cuando aparece el teclado virtual. Evitar scroll horizontal global; el desplazamiento horizontal intencional de categorías es válido.
- Último ajuste aprobado del efectivo desktop: panel de 900 × 520 centrado en 1280 × 800; columnas de 414 px y la misma altura de contenido, 266 px. Títulos alineados; confirmación fija abajo. Implementar el comportamiento adaptable, no coordenadas absolutas ni alturas que corten contenido.

## 5. Contrato funcional

### Catálogo y modificadores

- Categorías, búsqueda, productos, precios y disponibilidad provienen de los datos reales.
- Identidad visual asociada a IDs/códigos estables; jamás decidir comportamiento o color por comparar textos del nombre.
- Reutilizar metadatos persistentes si existen. Si no existen, crear un adaptador/configuración visual tipada y acotada con fallback; no imponer una migración de DB solo por una preferencia visual.
- El componente visual no busca datos ni decide precios. El contenedor/adaptador recibe configuración real y produce su modelo de presentación.
- Respetar grupos requeridos/opcionales, mínimos, máximos, selección simple/múltiple, extras, disponibilidad y valores de receta existentes.
- Mantener separados borrador de configuración y opciones confirmadas: Cancelar descarta cambios; Guardar/Agregar confirma y actualiza el pedido.
- Preservar unidades, notas, variantes, combos y semántica existente al editar una línea. Añadir un producto realmente agrega una unidad según las reglas actuales; no imitar la sustitución ficticia del prototipo.
- Cliente y localizador siguen accesibles en todos los tamaños usando los componentes y las reglas de reserva existentes.

### Cobro

- Efectivo recibido, monto aplicado y vuelto son conceptos distintos. Reutilizar `payment-math.ts` y la representación monetaria existente; no crear otro cálculo con números flotantes o redondeos dispersos.
- Pago dividido: filas compactas; Total, Asignado y Falta cubrir siempre comprensibles. Agregar otro pago propone el saldo pendiente. Editar o quitar recalcula el saldo y conserva los demás pagos.
- Número de operación/cupón de tarjeta: propuesto como opcional. Antes de cambiar validaciones, verificar si la política/configuración real lo exige y documentar cualquier incompatibilidad; no degradar validaciones del servidor por estilo.
- Transferencia: titular que transfirió y referencia/operación opcionales. El titular puede ser distinto del cliente. No obligar a crear cliente. Confirmación explícita de ingreso verificado cuando el registro es manual; no usar una imagen del comprobante como prueba automática de acreditación.
- Conservar permisos, medios habilitados, comisiones y reglas reales, aunque no aparezcan todos en el prototipo.
- Revisar caja/stock antes de entrar o confirmar; volver a validar transaccionalmente en el servidor. Evitar reservas, ventas o cobros duplicados por doble toque, reintento o carrera.
- Caja cerrada: conservar pedido y ofrecer abrir caja de acuerdo con permisos. Stock insuficiente: explicar producto, ubicación y cantidades faltantes legibles; volver al pedido o al mecanismo existente de reposición. No apilar un segundo modal para el mismo error.
- Distinguir pedido guardado, pago pendiente, venta cobrada y resultado incierto. No vaciar el pedido al comenzar una solicitud ni ante un error.
- Bloquear envíos repetidos mientras se procesa. Si no se sabe si el servidor confirmó, consultar/reconciliar la operación antes de crear otra; reutilizar la idempotencia existente y completar solo lo que falte.
- Confirmación: venta, total, medio(s), localizador y vuelto pertinentes. Nueva venta reinicia el borrador tras éxito; conservar acceso a la última venta y a la impresión existente.

Ejemplos para tests, nunca datos productivos:

| Caso | Resultado |
| --- | --- |
| 7.500 + 7.900 + 3.500 | Total 18.900 |
| Efectivo recibido 20.000 para total 18.900 | Vuelto 1.100 |
| Efectivo exacto 18.900 | Vuelto 0 |
| Efectivo recibido 50.000 | Vuelto 31.100 |
| Dividido: efectivo aplicado 10.000 + débito 8.900 | Saldo 0 |
| Aplicado 10.000, efectivo recibido 20.000, débito 8.900 | Vuelto 10.000; total aplicado 18.900 |
| Total aplicado menor a 18.900 | Mostrar saldo y no confirmar como venta completamente cobrada |

## 6. Clean code y optimización

1. Refactor incremental con tests de caracterización. No reescribir simultáneamente el manager, pagos y servidor sin una base que pruebe el comportamiento.
2. Separar presentación, coordinación del flujo, estado/borradores, reglas puras y acceso a datos. Un archivo por responsabilidad real; no fragmentar cada elemento JSX en un archivo sin beneficio.
3. Mantener `SalesManager` como coordinador. Extraer catálogo, configuración, resumen, contexto y cobro donde hoy mezclen responsabilidades. Preferir el patrón existente de features bajo `src/components/sales/`.
4. Reutilizar CartLine, PaymentDraft, PublicConfiguration y los contratos reales inspeccionados. Mantener adaptadores pequeños cuando el modelo de presentación difiera del dominio.
5. Primitivas compartidas: Button, Dialog, Input, SearchCombobox y avisos existentes. Agregar variantes acotadas cuando una necesidad real no se pueda expresar; no clonar una segunda librería UI para el POS.
6. Hooks para coordinación/efectos con una responsabilidad clara; helpers puros para cálculo y transformación. No agregar un store global ni una dependencia para evitar definir límites.
7. No cachear estado derivado innecesariamente. Memoizar únicamente cálculos o subárboles costosos medidos; evitar `useMemo`, `useCallback` y `memo` por defecto.
8. Preservar PosRequestCache, carga diferida de configuraciones/combos y distribución compartida de localizadores. Evitar fetch por tarjeta, refetch al cambiar ancho y peticiones repetidas por abrir/cerrar una opción.
9. Mantener debounce/cancelación/respuestas obsoletas si existen. No permitir que una respuesta vieja reemplace la selección actual.
10. Medir antes/después: solicitudes por recorrido, tiempos de catálogo/configuración, renders al buscar/editar y tamaño del bundle del POS. Registrar entorno y datos usados; no inventar mejoras ni umbrales de latencia.
11. Virtualización, nuevas cachés, endpoints o índices solo ante un cuello de botella probado y con una prueba que proteja la corrección.

### Unidades de presentación sugeridas

Son responsabilidades objetivo, no una orden de crear todos esos archivos si ya hay equivalentes:

| Unidad | Responsabilidad / interfaz de integración |
| --- | --- |
| ProductCard | Recibe producto/precio ya resuelto, imagen, franjas, cantidad y callback de configuración. Sin fetch ni cálculo de precio. |
| ProductCatalog / CategoryFilter | Búsqueda, filtrado y listado sobre el catálogo cargado. Consume el loader/cache existentes. |
| ModifierOption | Sabor, color, selección, pertenencia a receta y estado deshabilitado. Emite selección; no impone reglas al grupo. |
| ProductConfigurator | Orquesta PublicConfiguration y su borrador; valida restricciones antes de confirmar. |
| OrderSummary / OrderLine | Recibe líneas y callbacks de cantidad/edición/eliminación. Consume `cartTotal` y la semántica actual de CartLine. |
| PaymentMethodOption | Presenta medio habilitado/seleccionado y callback. Comparte interacción con teclado y toque. |
| CashPaymentFields / SplitPaymentRow | Presentan y editan PaymentDraft usando helpers monetarios existentes. |
| PaymentDialog | Coordina edición, validación y envío; la confirmación definitiva pertenece al flujo/servicio existente. |

## 7. Política de Superpowers

- Usar `using-superpowers` y `writing-plans` al retomar. Este documento ya fija el resultado visual; no reiniciar el diseño desde cero.
- Usar `brainstorming` únicamente para decisiones funcionales nuevas que el repositorio y este contrato no resuelvan. No pedir otra vez aprobación de lo que ya está definido.
- Antes de editar, completar el mapa concreto de archivos e interfaces a partir del checkout real. Mantener el plan en `docs/superpowers/plans/2026-11-20-ux-ui-pos-improvements.md`.
- Ejecutar con `subagent-driven-development` cuando esté disponible y resulte útil: un implementador por tarea coherente, revisión de especificación y revisión de calidad antes de avanzar. Compartir los contratos exactos y evidencia, no toda la conversación.
- Mantener en secuencia cambios que comparten estado o interfaces. Paralelizar solo trabajos independientes con propiedad de archivos clara; no hacer que varios agentes editen SalesManager al mismo tiempo.
- Aplicar `test-driven-development` para cambios de lógica y correcciones; `systematic-debugging` ante fallos; `requesting-code-review` y `verification-before-completion` para cerrar. Las decisiones rutinarias no necesitan confirmaciones repetidas.
- No fijar un modelo no disponible ni cambiar configuraciones globales de Codex como parte de la feature. El ejecutor elige recursos según herramientas reales, complejidad y costo.

## 8. Plan de ejecución por entregas

### Task 1: Base segura, mapa de responsabilidades y contrato local

**Files:** AGENTS.md, DESIGN.md, package.json y archivos reales de la sección 1 como lectura; este plan y la documentación de superficie POS existente como escritura.

**Interfaces:** consumes contratos actuales de SalesManager, CartLine, PaymentDraft y PublicConfiguration; produce un mapa de archivos existente/nuevo, firmas preservadas y baseline reproducible antes de editar lógica.

- [x] Inspeccionar estado Git, instrucciones aplicables y rama base actualizada. Preservar cambios ajenos. Crear o reutilizar `feature/ux-ui-pos-improvements`; si ya existe, revisar su estado en lugar de resetearla.
- [x] Si se requiere aislamiento, usar `using-git-worktrees`; no duplicar un worktree ya aislado. No crear una segunda implementación ni una rama con otro nombre.
- [x] Instalar con el packageManager/lockfile existentes; leer las guías locales de la versión de Next.js antes de escribir código.
- [x] Leer los contratos y tests relevantes. Completar en este plan los paths/firma exactos para las extracciones propuestas; no inventar tipos incompatibles con el checkout.
- [x] Registrar baseline de checks, capturas, peticiones del recorrido y perfilado pertinente. Separar fallas preexistentes de nuevas.
- [x] Documentar la excepción visual del POS frente a DESIGN.md sin modificar el tema global. Anotar cualquier conflicto operativo que impida implementar una decisión del diseño.
- [x] Commit acotado de documentación y caracterización si hubo cambios.

**Verification:** los scripts y pruebas seleccionadas arrancan con la configuración de test del repositorio; no se usa DB productiva. El baseline declara qué pasó, qué falló y qué no pudo ejecutarse.

### Task 2: Catálogo responsive y metadatos visuales

**Files:** `src/components/sales/cart.tsx`, `catalogue-loader.ts`, `request-cache.ts`, `touch-selection.ts`, `sales-manager.tsx`; estilos de superficie existentes. Extraer `src/components/sales/product-card.tsx` y/o `product-catalog.tsx` solo si no hay una unidad equivalente reutilizable.

**Interfaces:** consumes el catálogo real, callbacks y precios existentes; produces tarjetas/listado presentacionales sin solicitudes propias, integrados al mismo estado del pedido.

- [x] Ampliar primero `tests/pos-catalogue-loading.test.ts`, `tests/pos-request-cache.test.ts` y `tests/e2e/pos-options-cache.spec.ts` para fijar ausencia de refetch por filtros/viewport y uso de caché al reabrir opciones.
- [x] Ejecutar esas pruebas y confirmar que cualquier nuevo caso falla por el comportamiento que se va a cambiar, no por un entorno roto.
- [x] Separar la presentación del catálogo de la coordinación del manager conservando carga, cacheado y precios actuales.
- [x] Incorporar fotos aprobadas, franjas, estado activo de categorías y fallback de imagen/color. Asociar metadatos a identificadores estables; reutilizar assets exactos si ya existen.
- [x] Implementar 3/2/1 columnas según el espacio disponible; mantener el mismo pedido y evitar montajes duplicados por breakpoint.
- [x] Comprobar teclado, foco, nombres largos, productos sin foto y categorías vacías. Actualizar tests/capturas afectados sin aceptar regresiones ciegamente.
- [x] Commit de catálogo y pruebas.

**Verification:** `pnpm exec vitest run tests/pos-catalogue-loading.test.ts tests/pos-request-cache.test.ts`; ejecutar los E2E pertinentes a través del runner y preparación de datos que use el proyecto.

### Task 3: Modificadores reutilizables y borrador aislado

**Files:** `src/components/sales/product-configurator.tsx`, `combo-configurator.tsx` cuando corresponda, `touch-selection.ts`; extracción sugerida `modifier-option.tsx` dentro de sales. Tipos/reglas existentes de configuración y modificadores.

**Interfaces:** consumes PublicConfiguration y restricciones reales; produces selección confirmada compatible con el contrato actual de ProductConfigurator y CartLine. Cancelar no modifica la línea guardada.

- [x] Agregar casos de selección simple y múltiple, mínimos/máximos, defaults por producto, opción no disponible, cancelar y reabrir en `tests/e2e/pos-surface.spec.ts` y `tests/pos-configuration.integration.test.ts`.
- [x] Verificar los nuevos fallos y luego separar el borrador de presentación y las validaciones del grupo sin replicar reglas del servidor en cada opción.
- [x] Implementar círculo de 48 px, sabor, señales de selección, leyenda de receta y X de Sin perlas. Mantener grupos de múltiples opciones funcionales.
- [x] Guardar opciones actualiza precio, descripción e inventario según los contratos existentes; la UI no sustituye la configuración real por el ejemplo Chocolate/Caramelo.
- [x] Pasar pruebas y revisar las tres distribuciones, incluido scroll del grupo con acciones accesibles.
- [x] Commit de configuración y pruebas.

### Task 4: Revisión y edición del pedido

**Files:** `src/components/sales/cart-order.tsx`, `cart.tsx`, `sales-manager.tsx`, `order-controls.tsx`, `customer-picker.tsx`, `fulfillment-panel.tsx`; reutilizar el resumen actual antes de introducir otro.

**Interfaces:** consumes CartLine, cartTotal y callbacks de configuración; produces el mismo pedido editable en panel lateral o vista de pedido. No crea un segundo estado por dispositivo.

- [x] Fijar pruebas de aumentar/disminuir cantidad, eliminar, editar opciones, notas, combos, cliente/localizador y cambio de ancho sin perder el borrador en `tests/pos-order-entry.integration.test.ts`, `tests/e2e/pickup-pos.spec.ts` y `tests/e2e/touch-pos.spec.ts`.
- [x] Ejecutar los casos nuevos antes del cambio y conservar la semántica existente de append/merge de líneas.
- [x] Extraer resumen/línea por responsabilidad y conectar edición/eliminación con confirmación donde haga falta. Mantener controles en línea y áreas táctiles cómodas.
- [x] Conectar Ver pedido, Seguir agregando y Continuar al cobro. Cerrar o volver no borra el pedido.
- [x] Preservar cliente/autocomplete, localizador, cuenta/mesa y borradores al ir a historial o detalle según el comportamiento existente.
- [x] Pasar pruebas y commit de pedido/refactor.

### Task 5: Cobro y cálculos compartidos

**Files:** `src/components/sales/payment-dialog.tsx`, `payment-math.ts`, `sales-manager.tsx`; extraer secciones de efectivo, transferencia y filas de pago solo cuando reduzcan responsabilidades mezcladas. Mantener PaymentDraft compatible o migrarlo explícitamente.

**Interfaces:** consumes total real, medios habilitados y PaymentDraft; produces pagos validados y una solicitud única al flujo existente de venta. Los helpers monetarios son compartidos por todos los tamaños.

- [ ] Agregar pruebas de todos los ejemplos numéricos de la sección 5, importe insuficiente, editar/quitar pagos y cancelación del cobro. Reutilizar/ampliar `tests/e2e/payment-experience.spec.ts`, `payment-receipt.spec.ts`, `tests/helpers/payment-receipt-ui.tsx` y los tests del helper monetario que existan.
- [ ] Verificar que los casos nuevos fallen por la lógica objetivo y mantener íntegra la precisión monetaria existente.
- [ ] Separar presentación de medios, campos específicos, resumen de saldo y envío. Reutilizar payment-math; no calcular vuelto o saldo de forma distinta en móvil.
- [ ] Implementar el diálogo compacto desktop actualizado; tablet/celular deben conservar acciones accesibles y funcionar con teclado virtual.
- [ ] Implementar campos y confirmación manual de transferencia; revisar compatibilidad del cupón opcional con las reglas reales. Conservar referencias al editar pagos.
- [ ] Completar los estados que el prototipo no cubre: agregar/editar/quitar un pago, saldo restante y mensajes de validación junto al campo. Usar los mismos patrones aprobados, sin reiniciar el diseño.
- [ ] Pasar pruebas y commit de cobro.

### Task 6: Bloqueos, resiliencia y confirmación

**Files:** `sales-manager.tsx`, `stock-shortage-notice.tsx`, `replenishment-panel.tsx`, `payment-dialog.tsx`; `src/modules/sales/` y rutas únicamente si se necesita cubrir un comportamiento faltante. Preservar integraciones actuales de impresión y detalle.

**Interfaces:** consumes respuestas del servicio, permisos, caja y reserva de stock; produces estados distinguibles de edición, enviando, éxito, bloqueo, error recuperable y resultado incierto sin duplicar la operación.

- [ ] Caracterizar y agregar tests de doble toque, respuesta lenta, conflicto de stock, caja cerrada, error/reintento y resultado incierto. Reutilizar `tests/cash-sales.integration.test.ts`, `tests/data-model.concurrency.test.ts`, `tests/sales-http.test.ts`, `tests/e2e/sales.spec.ts` y pruebas de permisos existentes.
- [ ] Verificar los fallos nuevos; revisar transacciones/idempotencia existentes antes de proponer otro mecanismo.
- [ ] Mantener el borrador hasta el éxito definitivo. Conservar caja/stock como validaciones del servidor y presentar recuperación concreta sin apilar modales.
- [ ] No permitir reenvío concurrente; frente a resultado incierto, consultar la operación existente antes de crear otra. Si falta soporte servidor, implementar el mínimo contrato necesario y documentarlo.
- [ ] Mostrar venta cobrada con total, medios, localizador y vuelto pertinentes. Nueva venta limpia el estado solo después de éxito; conservar acceso a última venta e impresión existente.
- [ ] Separar fallo de impresión de fallo de cobro: un problema de impresora no reenvía la venta ni el pago.
- [ ] Pasar pruebas y commit de resiliencia.

### Task 7: Revisión global, rendimiento y entrega

**Files:** tests existentes citados, `tests/e2e/touch-pos.spec.ts`, `tests/e2e/pos-options-cache.spec.ts`, `tests/pos-locator-polling.test.ts`, `tests/pos-shared-locators.test.ts`, documentación de superficie y este plan.

**Interfaces:** consumes la implementación integrada y el baseline; produces evidencia de fidelidad visual, corrección, reutilización y rendimiento, con riesgos pendientes explícitos.

- [ ] Comparar Figma con capturas reales en 1280×800, 768×1024, 390×844 y anchos 320/360/1024. Probar altura corta, teclado, foco, scroll y nombres largos.
- [ ] Medir de nuevo peticiones, renders y tiempos bajo las mismas condiciones del baseline. Optimizar solo el cuello de botella demostrado y repetir la medición que lo confirma.
- [ ] Confirmar que no se duplicó lógica de negocio por dispositivo, que las extracciones tienen responsabilidad clara y que no aparecieron dependencias/abstracciones innecesarias.
- [ ] Ejecutar `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build` y `pnpm test:e2e` con el entorno de test documentado. Si algo está bloqueado por entorno o falla antes de la feature, reportarlo con evidencia; no afirmar que pasó.
- [ ] Aplicar revisión independiente de especificación y calidad con Superpowers; corregir hallazgos materiales y verificar los cambios afectados.
- [ ] Actualizar documentación y descripción de PR con comportamiento final, validación, comparación de rendimiento y limitaciones. Entregar la feature branch para revisión; no publicar en producción ni mergear automáticamente.

## 9. Criterios de aceptación del conjunto

- [ ] El flujo implementado se corresponde con el Figma unificado y su último ajuste del cobro.
- [ ] Productos, modificadores, revisión y cobro funcionan con datos reales en los tres tamaños, no solo con el ejemplo del prototipo.
- [ ] No hay pérdida de borrador por navegación/cambio de ancho ni operaciones duplicadas por reintentos.
- [ ] Las reglas actuales de combos, recetas, precio, impuestos, comisiones, permisos, stock y localizadores están preservadas salvo cambios deliberados y probados.
- [ ] No hay regresión demostrada de carga/caché/polling; las optimizaciones reportadas tienen medición antes/después.
- [ ] El manager tiene menor mezcla de responsabilidades y usa unidades compartidas; no existen implementaciones paralelas por viewport.
- [ ] El refactor no contamina el tema de módulos ajenos al POS.
- [ ] Las pruebas requeridas se ejecutaron o sus bloqueos están documentados de forma verificable.
- [ ] Los assets aprobados son persistentes y correctos; no se usan capturas completas de Figma como UI ni URLs temporales de exportación en producción.
- [ ] Existe resumen final del diff, validación y riesgos. Rama exacta: `feature/ux-ui-pos-improvements`.

## 10. Mensaje para pegar en el nuevo chat

Copiar el siguiente bloque y adjuntar este archivo:

```text
Vamos a implementar la mejora del POS de FranJarma/kybo-backoffice en la rama exacta feature/ux-ui-pos-improvements.

Leé completo el archivo adjunto 2026-11-20-ux-ui-pos-improvements.md. Contiene el contrato visual/funcional, el mapa real del repositorio, las referencias de Figma, el alcance y el plan por entregas.

Quiero una mejora visual Y de código: clean code, responsabilidades claras, reutilización de componentes y lógica, y optimizaciones basadas en evidencia. Aplicá Superpowers. Usá ejecución por tareas con revisión cuando esté disponible; mantené secuenciales los cambios que comparten estado o interfaces y no hagas que varios agentes editen los mismos archivos a la vez.

Primero inspeccioná Git, AGENTS.md, las guías locales de esta versión de Next.js, los componentes y los tests actuales. Creá o reutilizá la feature branch preservando cambios ajenos; actualizá el mapa de archivos y contratos del plan con lo observado. Después avanzá por las tareas, con verificaciones y commits pequeños. No reinicies el diseño ni pidas confirmación de decisiones ya fijadas en el contrato.

Figma canónico: https://www.figma.com/design/C0M35OEPwFwn7aqaabqKaq?node-id=159-666
La toma de pedidos, los modificadores, la revisión y el cobro deben respetar desktop, tablet y celular. Leé el último ajuste de efectivo desktop del nodo 198:2155. Los ejemplos del prototipo no son datos ni cálculos de producción.

Preservá las mejoras de velocidad existentes: caché, carga diferida de configuración/combos y distribución de localizadores. No agregues memoización, librerías, endpoints o migraciones sin necesidad demostrada. No despliegues en producción ni ejecutes operaciones o migraciones sobre datos reales. Entregá código probado en la feature branch, con evidencia visual, funcional y de rendimiento y los pendientes explícitos.
```

## 11. Revisión de este handoff

- Requisitos visuales, responsive, funcionamiento y calidad de código cubiertos por tareas 2–7.
- Las rutas existentes se verificaron en el árbol del repositorio. Los archivos propuestos están identificados como extracciones condicionadas a que no exista equivalente.
- Se preservan los contratos conocidos y se exige leer las firmas restantes antes de fijar extracciones; este documento no inventa la estructura interna de los archivos no leídos.
- Los cinco focos de revisión tienen pruebas y tareas responsables.
- La creación de la rama y la ejecución del código corresponden al nuevo chat; este archivo no afirma que esos pasos ya ocurrieron.

## 12. Contratos concretos del checkout (20 de noviembre de 2026)

### Base y aislamiento

- Base remota verificada: `b5946319f0f875854d52a981338157aea3368981`, árbol `a6d4cf3fd7fb636aed2017baf05d4127367ffb0f`.
- Checkout inicial: `faa5460d4e468e5ea7dc1deda068bfa57e49e115` en `codex/temporary-passwords`; main está 23 commits por delante. Se conservan sus cambios locales ajenos.
- La sesión no puede escribir en el .git original; las herramientas nativas de worktree no responden. Se preparó un checkout independiente en el directorio temporal permitido, con la rama exacta. Se verificaron por SHA los siete blobs faltantes, todos los árboles y el commit firmado; no se reconstruyó una versión aproximada.
- No hay AGENTS.md adicionales bajo src o tests. Se leyeron las guías locales Next 16.3.6 de Client/Server Components, CSS, fonts e images.
- Node instalado: 24.21.0. packageManager declarado: pnpm 10.33.2; ejecutable disponible e instalación preexistente: pnpm 9.15.1. Se conserva lockfile y dependencias; cualquier adaptación de instalación es solo de entorno.

### Contratos preservados

| Archivo | Contrato y autoridad |
| --- | --- |
| `src/components/sales/cart.tsx` | `CartLine` mantiene productId/name, quantity (1–999), price en texto decimal editable, expectedPrice, priceReason, notes y todos los expected*VersionId, expectedPricingRevision, modifiers, modifierLabels y comboChoices. `newCartLine(row: SaleLookup["rows"][number]): CartLine`; `cartTotal(lines: CartLine[]): string \| null` usa bigint. |
| `src/components/sales/touch-selection.ts` | `appendCartLine(current: CartLine[], incoming: CartLine): CartLine[]` solo une identidades físicas/configuradas idénticas, conserva notas, variantes y límite 50 líneas/999 unidades. `filterCatalogue(rows, query, category)` busca localmente sin requests. |
| `src/components/sales/cart.tsx` | `ProductPicker({channel, locked, onAdd, refresh, onCatalogueLoaded?})`; onAdd recibe fila original, onCatalogueLoaded recibe todas las filas. El loader solo depende de channel/refresh, nunca del ancho ni de filtros. |
| `src/components/sales/catalogue-loader.ts` | `createCatalogueLoader({channel,onChange,onComplete?}) => {load():Promise<void>,dispose():void}`. Conserva páginas parciales, retry desde offset pendiente, timeout 15s, AbortController y descarte al desmontar. |
| `src/components/sales/request-cache.ts` | `PosRequestCache<T>.get(key, load, now?): Promise<T>`, TTL 60s y máximo 100 entradas; comparte solicitudes en vuelo y elimina rechazos. |
| `src/components/sales/sales-manager.tsx` | Propietario único del pedido/contexto/vistas. `DraftSnapshot` incluye líneas, origin/channel/fulfillment, mesa, cliente/email, externalId, notes, localizador/modo y tabletPanel. Historial usa ocultamiento CSS; no desmontar catálogo/pedido. La precarga de configuraciones tiene dos workers y clave branch/channel/revisión/versiones/precio. |
| `src/components/sales/cart-order.tsx` | `Cart({lines,onChange,locked,allowPrice,total,children,onEdit?})`; onEdit recibe índice. Conserva editor aislado de notas/precio y Deshacer. |
| `src/modules/recipes/configuration.ts` | `PublicConfiguration`: fulfillmentVersionId, recipeVersionId, model, basePrice, catalogBasePrice?, vatRate?, pricingRevision? y groups[{id,name,min,max,options[{id,name,defaultCount,maxCount,price,available}]}]. Los IDs de options son bindings de receta, no IDs del producto. |
| `src/components/sales/product-configurator.tsx` | initialSelection?: Selection[]; onConfirm({expectedRecipeVersionId,modifiers,expectedPrice,modifierLabels,selectionSurcharge?}); onCancel(). Choices vive solo en el configurador; confirmar es el único commit a CartLine. |
| `src/components/sales/combo-configurator.tsx` | Mantener ComboSaleConfiguration y initialChoices/LineInput.comboChoices, sus versiones y el ProductConfigurator anidado. No convertir combos en productos simples. |
| `src/components/sales/payment-dialog.tsx` | `PaymentDraft = {collector:"local"\|"platform";methodId?:string;amount:string;reference:string}`. Recibido vive fuera del payload. Mantener canDiscard/onDiscard y todos los props de carga/recuperación del checkout actual. |
| `src/components/sales/payment-math.ts` | `cashChange(received:string, collection:string): {valid:boolean;change:string\|null}`; usa decimal/integer/cents. Ningún componente puede sumar el recibido al monto aplicado. |
| `src/components/inventory/shared.tsx` | `useOperation<T>(actorId,kind,onSuccess,explicitBranchId?)`: sessionStorage por actor/sucursal/tipo; persiste outcomeUncertain antes del POST y reintenta el mismo payload/requestId. Preservar descarte seguro de rechazos y validación de permisos. |
| `src/modules/sales/service.ts` | create/addOrder/pay/cancel son transaccionales. claim+fingerprint retorna replay antes de nueva caja/stock. Mantener reserveOrder, lockCashSession, movimientos únicos y enqueueOrderPrints/cancelOrderPrints. |
| `src/components/cash/status-gate.tsx` | Ya usa CashOpeningAction con CashManager lazy/openingOnly; abrir caja conserva el POS. No reemplazarlo por navegación. |
| `src/components/printing/order-printing.tsx` | LatestOrderPrinting y usePrinting tienen recuperación propia; fallo de impresión no reenvía venta ni pago. |

### Extracciones y ampliaciones acotadas

| Archivo previsto | Interfaz concreta |
| --- | --- |
| `src/components/sales/product-card.tsx` | Presentación de producto con ID, nombre, precio ya formateado, imageAssetId, franjas, cantidad, estado disabled y callback. Sin fetch ni cálculo monetario. ProductPicker conserva loader/filtros y recibe cantidades del mismo pedido. |
| `src/components/sales/pos-presentation.ts` | Adaptadores puros tipados para apariencia por productId/option key, con fallback neutro. No hay SKU ni color persistido en products; no decidir colores a partir de nombres. Las fotos siguen imageAssetId real y /api/media. |
| `src/components/sales/modifier-option.tsx` | Presenta option/selected/includedInRecipe/visual/disabled y callbacks. Grupo/controlador mantiene min/max/maxCount y simple/múltiple. `defaultCount>0` determina pertenencia a receta; precio cero no la determina. |
| `src/modules/recipes/configuration.ts` | Extensión aditiva opcional `key?:string` para option, proveniente de modifierOptions.key ya persistido. Sin migración. Binding id continúa como identidad de selección. |
| `src/components/sales/order-line.tsx` | Si la extracción reduce Cart, recibe CartLine e índice/callbacks; no crea pedido propio. |
| `src/components/sales/payment-fields.tsx` | Campos de efectivo/tarjeta/transferencia y medio, compuestos con Button/Input/Control existentes. PaymentDialog conserva sus filas y coordinación. |
| `src/components/sales/payment-math.ts` | Extender helpers puros para total aplicado/saldo y resumen de efectivo usando bigint y formatos existentes. Sin representación monetaria nueva. |
| `src/components/sales/sale-confirmation.tsx` | Venta real y resumen opcional local del vuelto; conserva apertura de última venta/impresión. Recibido/vuelto jamás se envían como ingreso. |
| `src/components/sales/pos.css` | Tokens y layouts limitados a superficie POS y sus portales. Fuente Barlow con next/font/local en la entrada de sales; no modificar tema global. |

### Decisiones operativas de integración

1. Cupón de tarjeta: obligatorio en UI y preparePayments, sin configuración opcional. Se mantiene y se documenta la excepción a Figma.
2. Transferencia: el servidor solo persiste reference (máximo 120 caracteres). Titular opcional y operación se guardarán en una referencia legible validando la longitud combinada; la confirmación de acreditación es explícita en UI y no crea cliente. No se agregarán propiedades desconocidas al esquema estricto ni una migración por presentación.
3. Guardar sin cobro: mostrador exige pago completo en servidor. Mantener los caminos existentes de cuenta/mesa y delivery pendiente; cualquier borrador local se debe rotular expresamente como tal y no presentarse como reserva de stock.
4. Caja: apertura local ya implementada; seguir revalidación transaccional. No ejecutar operaciones reales.
5. Resiliencia: falta exclusión sincrónica en submit/retry de useOperation. Se ampliará únicamente por este fallo demostrado con dos invocaciones en el mismo turno; no se creará otro sistema de idempotencia.
6. Stock: StockShortageNotice abre hoy otro Dialog desde PaymentDialog. El detalle debe mostrarse inline/desplegable.
7. Fotos dinámicas: no sustituir imágenes reales por las del pedido ilustrativo de Figma. No existe correspondencia productId→paleta aprobada en main; usar fallback neutro y un adaptador tipado por IDs hasta disponer de esa correspondencia.
8. Fuente y assets: no agregar URLs efímeras al runtime. Mantener los iconos Lucide existentes y descargar solo assets exactos cuando sean estáticos y necesarios.
9. Apariencia de modificadores: las claves persistidas verificadas de Perlas, Salsa y Helado se resuelven en `src/components/sales/modifier-presentation.ts`. La clave `229be374-c4bf-4f7c-a4f9-0cc4e5f84700` identifica la X de Sin perlas. La clave `9bf66daa-1dd6-4cfc-a5d9-e99116c46a67` identifica el círculo neutro de Sin salsa. Las claves desconocidas conservan el círculo neutro. El nombre visible se usa solo para la etiqueta.

### Baseline y verificación

- Checkout inicial faa5460: `pnpm exec vitest run tests/pos-catalogue-loading.test.ts tests/pos-request-cache.test.ts tests/touch-pos-components.test.ts tests/pos-locator-polling.test.ts tests/pos-shared-locators.test.ts`: 5 archivos / 31 casos pasaron. Esta ejecución NO se atribuye al nuevo checkout main.
- Los tests DB usan PGlite descartable y exigen `KYBO_ALLOW_TEST_MIGRATIONS=disposable-only`; no usar DATABASE_URL productiva.
- Los E2E reales se ejecutan con scripts/e2e-run.ts y DB temporal; payment-receipt.spec.ts usa además un fixture de navegador sin DB, apropiado para layout/cálculos.
- sales.spec.ts conserva selectores obsoletos de cliente/medios y “Cobrar y registrar”; fijar baseline antes de actualizarlos.
- Revisiones: inspección independiente de cobro/recuperación realizada primero en faa5460 y luego corregida expresamente contra b5946319; apertura de caja e incertidumbre previa al fetch ya estaban resueltas en main.
- Pendiente antes de editar app: checks de main, capturas/peticiones/perfil y commit de esta etapa; registrar sus resultados reales en docs/pos-ux-ui-verification.md.

