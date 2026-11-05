---
target: Kybo Operations — auditoría general UI/UX
total_score: 26
max_score: 40
na_heuristics:
p0_count: 0
p1_count: 2
target_identity: "file:C:\\Users\\franj\\.codex\\worktrees\\order-ticket-printing\\kybo-operations-next\\src\\components"
timestamp: 2026-11-03T18-28-00Z
slug: src-components
closed: true
---
# Auditoría general UI/UX de Kybo Operations

Fecha: 3 de noviembre de 2026. Código evaluado: `f1ff080`, rama `codex/production-ux`. Herramienta: Impeccable 4.3.1. Modo: Operate. Método: dos evaluaciones independientes — A `/root/uiux_a_design`, B `/root/uiux_b_evidence` — y una inspección complementaria del agente principal. La evaluación de diseño terminó antes de incorporar los resultados del detector a la síntesis.

## Diagnóstico

Kybo tiene una identidad y una base funcional reconocibles. Conviene conservar el logo, Manrope, las fotos de productos, el naranja, el azul y el navy. La mejora principal consiste en consolidar el sistema que ya existe: cada módulo agrega reglas propias y el mismo tipo de control termina teniendo distintas alturas, colores, foco o interacción.

**Resultado de la muestra: 26/40 en heurísticas de experiencia y 12/20 en calidad técnica.** Son puntuaciones internas para comparar futuras revisiones, no una certificación de accesibilidad ni un benchmark de producción. Se identifican **9 hallazgos: 0 P0, 2 P1, 6 P2 y 1 P3**. P0 impide completar una tarea; P1 afecta significativamente la accesibilidad; P2 añade fricción o inconsistencia; P3 es pulido de texto.

**Veredicto de integridad: base coherente, ejecución fragmentada.** No se justifica rehacer toda la aplicación ni reemplazar su identidad visual. Se justifica fijar roles compartidos y aplicarlos de manera consistente.

## Alcance y evidencia

Se revisaron código, CSS y componentes de `src/components` y `src/app`, con escaneo estático de Impeccable y verificación manual de sus resultados. El inventario de componentes contiene 150 archivos TSX/CSS. El detector no sustituye una auditoría de accesibilidad.

La inspección real autenticada cubrió 17 rutas: Inicio, Operación del día, Punto de venta, Comandas, Registro de producción, Caja, Horarios del equipo, Configuración de asistencia, Configuración de caja, Compras, Traslados, Catálogo y precios, Ingredientes, Clientes, Categorías, Sucursales y ubicaciones, y Login. Se abrieron formularios vacíos y se cancelaron; no se confirmaron operaciones comerciales, fichajes, cambios de configuración ni permisos.

El principal comprobó POS a 1440×1000, 1024×768, 768×1024 y 390×844; también Horarios, Operación del día y Configuración de asistencia a 390 px. En estas vistas no se encontró desbordamiento horizontal del documento. El desplazamiento horizontal contenido del calendario y de las categorías es una decisión válida, no un fallo automático.

Las mediciones de contraste provienen de colores calculados en el navegador y luminancia sRGB, no de estimaciones sobre una captura. Las capturas quedan fuera de Git, en `C:/Users/franj/.codex/visualizations/2026/10/22/01a163f9-dd3d-71b2-bd12-0d0f2ad41533/ui-ux-audit/`.

No se recorrieron todos los roles, todos los formularios, todas las transacciones ni todos sus estados de error. No se hizo una prueba formal con lector de pantalla, Safari/iOS, zoom al 200%, Lighthouse o métricas INP de producción. El cierre de caja y la recuperación transaccional se examinaron en fuente, sin generar una jornada real. Las cargas del servidor de desarrollo no se extrapolan a Vercel.

## Hallazgos priorizados

### 1. [P1] El naranja de texto del botón «Abrir caja» no tiene suficiente contraste

**Evidencia:** texto e icono `#ff8500` sobre blanco, 14 px; contraste **2,4399:1**. Se observó el mismo control persistente en varias secciones. Para texto normal el umbral AA es 4,5:1, con las excepciones que define [WCAG 1.4.3](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html). No se aplica este hallazgo al logo ni a controles deshabilitados.

**Impacto:** una acción importante pierde legibilidad con reflejos, baja visión o una pantalla de menor calidad. El naranja de marca funciona bien como relleno: navy sobre ese naranja alcanza **6,9162:1**.

**Recomendación:** separar el naranja de relleno del tono para texto/borde de un outline. Mantener navy sobre naranja en acciones primarias. Para el contorno, usar navy o un naranja más oscuro validado; por ejemplo, `#9a4b00` sobre blanco da **6,2122:1**. Es una propuesta de rol, no un cambio de marca ya aprobado.

**Ubicación:** [variante global](C:/Users/franj/.codex/worktrees/order-ticket-printing/kybo-operations-next/src/app/globals.css:208), [definición de Button](C:/Users/franj/.codex/worktrees/order-ticket-printing/kybo-operations-next/src/components/ui/button.tsx:16), [uso en cabecera](C:/Users/franj/.codex/worktrees/order-ticket-printing/kybo-operations-next/src/components/cash/header.tsx:157).

**Criterio de mejora:** todas las variantes activas de texto pequeño deben superar 4,5:1 en normal y hover; conservar una identificación inequívoca de la acción.

Comando sugerido: `$impeccable colorize`.

### 2. [P1] Caja reemplaza el foco compartido por uno demasiado tenue

**Evidencia:** el Autocomplete de Configuración de caja y el input «Fondo inicial contado» del modal de apertura muestran outline de 2 px `#80b6f0` sobre blanco: **2,1282:1**. El borde permanece `#d9e3ef`, aproximadamente **1,30:1**. El azul compartido `#0669db` alcanza **5,1836:1**.

**Impacto:** navegar con teclado es menos evidente justo en formularios monetarios. El autofocus inicial sí funciona; lo que falla es su señal visual.

**Recomendación:** usar el token común de foco también en Caja, con una señal de al menos 3:1 respecto del color adyacente según [WCAG 1.4.11](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html). No borrar el ring de un componente compartido sin una alternativa equivalente.

**Ubicación:** [sobrescrituras de campos de Caja](C:/Users/franj/.codex/worktrees/order-ticket-printing/kybo-operations-next/src/components/cash/cash.css:490), [outline local](C:/Users/franj/.codex/worktrees/order-ticket-printing/kybo-operations-next/src/components/cash/cash.css:505), [foco global](C:/Users/franj/.codex/worktrees/order-ticket-printing/kybo-operations-next/src/app/globals.css:72).

**Criterio de mejora:** se identifica claramente el campo activo con Tab y con foco programático, sin perder el autofocus ya solicitado.

Comando sugerido: `$impeccable harden` / `$impeccable colorize`.

### 3. [P2] Al cerrar algunos diálogos se pierde la posición del teclado

**Evidencia:** al cerrar el alta de Categorías con Escape o Cancelar, el foco pasa a `BODY`. El principal reprodujo el mismo resultado al cerrar el modal de apertura de Caja con Escape. No se afirma que todos los diálogos fallen: Radix aporta la base, pero estos puntos de apertura no vinculan o restauran el disparador.

**Impacto:** después de cancelar, hay que volver a encontrar el botón o la fila desde donde se abrió la ficha.

**Recomendación:** conectar el disparador mediante `DialogTrigger` o conservar su referencia y devolverle el foco al cerrar. Resolver tanto «Crear» como «Editar» de una fila y acciones de la cabecera.

**Ubicación:** [apertura de ficha](C:/Users/franj/.codex/worktrees/order-ticket-printing/kybo-operations-next/src/components/catalog-manager.tsx:922), [diálogo controlado](C:/Users/franj/.codex/worktrees/order-ticket-printing/kybo-operations-next/src/components/catalog-manager.tsx:1226), [cabecera de Caja](C:/Users/franj/.codex/worktrees/order-ticket-printing/kybo-operations-next/src/components/cash/header.tsx:157).

**Criterio de mejora:** Escape, Cancelar y la X devuelven el foco al disparador existente; si la fila desaparece, a una alternativa lógica.

Comando sugerido: `$impeccable harden`.

### 4. [P2] Las pestañas cambian de color y de comportamiento según el módulo

**Evidencia:** Producción y Compras usan subrayado naranja; fichas de catálogo usan azul; Sucursales suma fondo azul y contador; Operación del día usa botones secondary/ghost. Producción sí responde a flechas y conserva tab/panel asociado. Asistencia declara tablist/tab, pero su implementación no tiene el mismo manejo de flechas, roving tabIndex ni asociación de paneles. Los botones de secciones de Operación del día no anuncian cuál está seleccionado.

**Impacto:** un usuario aprende un patrón visual y de teclado que no se transfiere a la siguiente pantalla. Diferenciar pestañas de filtros sí tiene sentido; dar variantes distintas a la misma función, sin regla, no aporta claridad.

**Recomendación:** un componente compartido para pestañas locales con estados, teclado, foco y paneles asociados. Una variante de subrayado para secciones y otra segmentada para filtros/opciones excluyentes. Propuesta: selección y navegación azules; acción principal naranja.

**Ubicación:** [pestañas de Producción](C:/Users/franj/.codex/worktrees/order-ticket-printing/kybo-operations-next/src/components/production/production.module.css:46), [Compras](C:/Users/franj/.codex/worktrees/order-ticket-printing/kybo-operations-next/src/components/inventory/purchases-workspace.tsx:87), [catálogo](C:/Users/franj/.codex/worktrees/order-ticket-printing/kybo-operations-next/src/components/catalog-manager.tsx:76), [Asistencia](C:/Users/franj/.codex/worktrees/order-ticket-printing/kybo-operations-next/src/components/attendance/manager.tsx:358), [Operación del día](C:/Users/franj/.codex/worktrees/order-ticket-printing/kybo-operations-next/src/components/daily-operations/manager.tsx:167).

**Criterio de mejora:** misma selección reconocible y navegación por flechas/Home/End donde corresponda, foco visible y conservación de los borradores al cambiar de vista.

Comando sugerido: `$impeccable harden` / `$impeccable polish`.

### 5. [P2] La altura de las filas de Ingredientes dificulta comparar insumos

**Evidencia:** en la muestra de aproximadamente 1265×712, las acciones Editar/Duplicar/Archivar apiladas produjeron filas cercanas a 140 px; sólo entraban dos completas entre los 44 ingredientes. Los datos ocupaban mucho menos espacio que sus acciones. No es un problema de que existan 44 insumos.

**Impacto:** comparar nombres, unidades y costos exige desplazarse más y dificulta mantener la fila de referencia.

**Recomendación:** Editar visible y Duplicar/Archivar agrupados en un menú secundario rotulado, o ancho suficiente para no apilar tres botones. Definir densidad por tipo de información: Productos necesita más altura para foto y precios por canal; Ingredientes no necesita copiarla.

**Ubicación:** [acciones de catálogo](C:/Users/franj/.codex/worktrees/order-ticket-printing/kybo-operations-next/src/components/catalog-manager.tsx:856), [celda de acciones](C:/Users/franj/.codex/worktrees/order-ticket-printing/kybo-operations-next/src/components/catalog-manager.tsx:1141), [padding compartido de tabla](C:/Users/franj/.codex/worktrees/order-ticket-printing/kybo-operations-next/src/app/globals.css:240).

**Criterio de mejora:** más filas comparables en el mismo viewport, sin reducir los blancos táctiles ni ocultar la acción principal.

Comando sugerido: `$impeccable layout` / `$impeccable distill`.

### 6. [P2] El alta de producto acumula avisos y aleja Guardar

**Evidencia:** la ficha nueva ocupa casi toda la altura, muestra decisiones de stock, foto, IVA y tres canales de precio, repite la explicación de IVA y varias vistas «Pendiente» antes de tener datos. Cancelar/Guardar quedan al final del contenido desplazable.

**Impacto:** se relee información equivalente y se pierde de vista cómo terminar. Los campos aún no completados parecen problemas antes de empezar.

**Recomendación:** una explicación de IVA común, precios y ayudas revelados al habilitar cada canal, resumen de lo necesario para el primer guardado y pie de acciones accesible dentro de la ficha. Mantener las comprobaciones de precio y el bloqueo de receta/costeo hasta guardar el producto.

**Ubicación:** [contenedor de ficha](C:/Users/franj/.codex/worktrees/order-ticket-printing/kybo-operations-next/src/components/catalog-manager.tsx:1234), [explicación y canales](C:/Users/franj/.codex/worktrees/order-ticket-printing/kybo-operations-next/src/components/catalog-manager.tsx:1756), [pie de acciones](C:/Users/franj/.codex/worktrees/order-ticket-printing/kybo-operations-next/src/components/catalog-manager.tsx:1810), [avisos por canal](C:/Users/franj/.codex/worktrees/order-ticket-printing/kybo-operations-next/src/components/products/price-preview.tsx:29).

**Criterio de mejora:** se entiende qué falta para crear y se llega a Guardar sin atravesar explicaciones repetidas; la aparición del teclado no oculta la salida del formulario.

Comando sugerido: `$impeccable clarify` / `$impeccable distill`.

### 7. [P2] Los blancos táctiles auxiliares no siguen el buen estándar del POS

**Evidencia:** Editar dirección midió 65,8×28 px, cierre de ficha 32×32 px, acciones pequeñas administrativas 34 px y 40 px en móvil; los botones de agregar horario miden 36 px de alto. El POS, en cambio, conserva 48 px en los controles operativos medidos. Inputs nativos, casillas y toggles con una etiqueta grande no se consideran defectuosos sólo porque su rectángulo interno sea pequeño.

**Impacto:** más precisión para editar, cerrar o cambiar de sección desde una tablet. Puede arreglarse sin agrandar todos los iconos ni todas las filas.

**Recomendación:** perfiles de densidad explícitos: controles operativos de 48 px, blancos auxiliares táctiles de al menos 44 px y variante compacta sólo cuando el contexto la justifica. WCAG AA 2.5.8 usa [24 px con excepciones](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html); [44 px corresponde al criterio mejorado AAA](https://www.w3.org/WAI/WCAG22/Understanding/target-size-enhanced.html). Aquí 44–48 px es la recomendación ergonómica para el local, no una afirmación de fallo AA de todo botón de 32 px.

**Ubicación:** [Editar dirección](C:/Users/franj/.codex/worktrees/order-ticket-printing/kybo-operations-next/src/components/branches/branches.css:943), [tamaños globales](C:/Users/franj/.codex/worktrees/order-ticket-printing/kybo-operations-next/src/app/globals.css:194), [cierre de diálogo](C:/Users/franj/.codex/worktrees/order-ticket-printing/kybo-operations-next/src/app/globals.css:266), [horarios](C:/Users/franj/.codex/worktrees/order-ticket-printing/kybo-operations-next/src/components/attendance/attendance.css:1108).

Comando sugerido: `$impeccable adapt`.

### 8. [P2] Las reglas locales de CSS debilitan el contrato de los componentes

**Evidencia:** la paleta está definida, pero Caja vuelve a declarar colores, tipografía y foco. Producción, Caja y páginas generales tienen escalas y anchos propios, sin perfiles documentados. Además, Operación del día declara `min-h-12` —48 px— en botones que el navegador calcula a 42 px por la regla global de `[data-slot="button"]`. Esto demuestra un desacuerdo entre el componente solicitado y el resultado final, no sólo diversidad legítima de densidad.

**Impacto:** un ajuste aparentemente común requiere excepciones por módulo y puede cambiar el aspecto o la interacción de otra pantalla. Los problemas de foco y tamaños son consecuencias concretas de esta fragmentación.

**Recomendación:** documentar tokens semánticos y hacer que Button, campos, pestañas, paneles y diálogos sean la autoridad de sus variantes. Revisar las sobrescrituras globales y usar capas de CSS compatibles con las utilidades. Mantener perfiles legítimos: caja/administración, POS táctil y pantalla pública no necesitan idéntica densidad.

**Ubicación:** [tokens actuales](C:/Users/franj/.codex/worktrees/order-ticket-printing/kybo-operations-next/src/app/globals.css:2), [sobrescrituras de Button](C:/Users/franj/.codex/worktrees/order-ticket-printing/kybo-operations-next/src/app/globals.css:194), [altura solicitada en Operación](C:/Users/franj/.codex/worktrees/order-ticket-printing/kybo-operations-next/src/components/daily-operations/manager.tsx:130), [estilos propios de Caja](C:/Users/franj/.codex/worktrees/order-ticket-printing/kybo-operations-next/src/components/cash/cash.css:12).

**Criterio de mejora:** tamaños, foco, color y espaciado de un componente coinciden con su variante declarada; las excepciones quedan justificadas por el trabajo que se realiza.

Comando sugerido: `$impeccable document`.

### 9. [P3] Hay textos genéricos o técnicos que conviene normalizar

**Evidencia:** «Nuevo categoría» en el catálogo; un `sr-only` en Operación del día anuncia «Sesión de» seguido de un UUID. Este último no aparece visualmente: afecta al contenido que recibe un lector de pantalla.

**Recomendación:** acciones con verbo común —«Crear categoría», «Crear cliente»— y contexto de sesión humano sólo donde aporte información. No anunciar identificadores internos de implementación.

**Ubicación:** [crear entidad](C:/Users/franj/.codex/worktrees/order-ticket-printing/kybo-operations-next/src/components/catalog-manager.tsx:924), [título de la ficha](C:/Users/franj/.codex/worktrees/order-ticket-printing/kybo-operations-next/src/components/catalog-manager.tsx:1250), [UUID para lector de pantalla](C:/Users/franj/.codex/worktrees/order-ticket-printing/kybo-operations-next/src/components/daily-operations/manager.tsx:372).

Comando sugerido: `$impeccable clarify`.

## Norma visual propuesta para la siguiente etapa

Estas son recomendaciones a acordar e implementar después de la auditoría; no se modificó la interfaz.

| Área | Norma propuesta |
|---|---|
| Acción principal | Naranja Kybo relleno y texto navy. Una acción dominante por contexto; crear/confirmar/finalizar deben distinguirse de actualizar o navegar. |
| Acciones secundarias | Contorno o fondo neutro. Si se mantiene un outline naranja, usar una tinta accesible en texto, icono y borde. |
| Pestañas y selección | Azul como selección de secciones, indicador consistente y estado programático. Cápsulas para filtros; subrayado para secciones. |
| Estados | Verde completado, ámbar atención, rojo error/destrucción. Acompañar color con texto o icono; no usar rojo para una utilidad corriente. |
| Foco | Azul compartido, visible en todos los controles y superficies. Conservar autofocus, orden lógico y retorno al disparador. |
| Iconografía | Mantener Lucide y los iconos de negocio pertinentes. Definir 16 px para acciones compactas y 20 px para navegación; el blanco pulsable es independiente del tamaño del dibujo. Iconos ambiguos necesitan rótulo o nombre accesible. |
| Espaciado y márgenes | Escala compartida 4/8/12/16/24/32; grupos y acciones relacionados con separaciones previsibles. Propuesta de gutters: 24 px en administración y 16 px en móvil, con perfil táctil propio para POS. No hacer todas las tablas igualmente altas. |
| Tipografía y jerarquía | Conservar Manrope. Normalizar título, sección, etiqueta y ayuda por función; evitar que datos operativos dependan de textos de 10–11 px. Mantener cifras monetarias alineadas y tabulares. |
| Formularios | Autocomplete compartido para relaciones; etiquetas visibles, requerido/opcional coherente, error cerca del campo y acción final alcanzable. Evitar búsqueda más select y modales adicionales en la toma de pedidos. |
| Capas | Paneles para agrupar, no para decorar cada dato. Diálogo o drawer según la tarea, con encabezado, cierre y pie previsibles. |

La pantalla pública mantiene su perfil de lectura a distancia; se alinean la marca y los significados de color, no su densidad con la administración.

## Lo que conviene conservar

- Logo, Manrope y combinación navy/naranja/azul. Navy sobre naranja, azul sobre blanco y el gris secundario actual tienen contraste adecuado en las combinaciones medidas; no hace falta oscurecer todo por sistema.
- Autocomplete compartido, idioma concreto y controles en línea. El POS tiene objetivos táctiles de 48 px y refluye sin desbordamiento de documento en las cuatro dimensiones comprobadas.
- Producción usa pestañas con flechas y paneles asociados; sus borradores y revisión antes de guardar tienen pruebas de regresión. Sirve como base de contrato de interacción, no como obligación de copiar todo su aspecto.
- Sucursales agrupa Ubicaciones, Equipo y Productos; Compras une necesidades y pedidos; Traslados conserva origen, motivo y lista en un contexto. Las fotos y unidades ayudan a reconocer lo que se está gestionando.
- Botones y enlaces del sidebar tienen rótulos y estado actual. El autofocus solicitado en apertura de Caja funciona; hay que mejorar el aspecto del foco y su retorno al cerrar, no quitarlo.

## Puntuaciones de la muestra

| Heurística | /4 |
|---|---:|
| Visibilidad del estado | 3 |
| Correspondencia con el trabajo real | 4 |
| Control y libertad | 3 |
| Consistencia y estándares | 2 |
| Prevención de errores | 3 |
| Reconocimiento antes que recuerdo | 3 |
| Flexibilidad y eficiencia | 2 |
| Jerarquía y diseño sin ruido | 2 |
| Recuperación de errores | 2 |
| Ayuda contextual | 2 |
| **Total** | **26/40** |

| Calidad técnica | /4 | Alcance |
|---|---:|---|
| Accesibilidad | 2 | Dos contrastes y retorno de foco comprobados; no es certificación completa. |
| Rendimiento | 3, provisional | Revisión de carga diferida y polling; sin benchmark de producción. |
| Adaptación responsive | 3 | Reflujo comprobado en la muestra; quedan blancos táctiles auxiliares por ajustar. |
| Tokens y temas | 2 | Base existente, sobrescrituras y duplicación entre módulos. No se exige un modo oscuro que el producto no promete. |
| Integridad del sistema | 2 | Producto reconocible, contratos de componentes inconsistentes. |
| **Total** | **12/20** | **Orientativo y limitado al alcance descrito.** |

## Carga cognitiva y personas

La muestra tiene buena agrupación, rótulos y memoria contextual. Foco principal y jerarquía son razonables; la revelación progresiva funciona en varias secciones. Las dos principales dificultades de carga cognitiva son la ficha de producto con decisiones/avisos simultáneos y el desplazamiento innecesario al comparar ingredientes. Una lista legítima de muchos productos no es por sí misma un defecto. El menú largo de administración debe distinguirse del menú limitado del personal antes de proponer una reducción.

- **Encargado habitual:** compara insumos y configura productos; pierde continuidad por filas altas y pie lejano. Necesita densidad útil y rutas rápidas a editar/guardar.
- **Personal de PC/tablet:** necesita identificar acciones, ver el pedido y tocar con precisión durante el turno. Conviene extender el estándar táctil del POS a las acciones auxiliares que usa en otras pantallas.
- **Usuario de teclado o baja visión:** encuentra texto de contorno tenue, foco atenuado en Caja y pérdida de posición al cerrar una ficha. Es la prioridad de accesibilidad de esta auditoría.

La entrada al sistema es reconocible y hay ayudas útiles. Los valles de experiencia aparecen en formularios largos y cargas con regiones poco informativas. No se califican finales transaccionales no ejecutados ni se atribuyen todos los problemas a cada perfil sin probar su sesión.

## Resultado del detector y falsos positivos

El detector se ejecutó una vez. Entregó seis advertencias de estilo, no seis fallos de accesibilidad: cuatro `side-tab` y dos `border-accent-on-rounded`. El proceso devolvió 0 aunque había advertencias, por lo que se usó el JSON y no el código de salida para contarlas.

- Dos falsos positivos: el marcador de grupo activo del sidebar y el subrayado de una pestaña con radio sólo al recibir foco.
- Tres usos contextuales intencionales: el borde del turno de calendario, una advertencia útil de necesidades de compra y un resultado de plazo/margen.
- Un candidato estético menor: el borde superior azul del panel de planificación de Producción. No se demostró perjuicio y no se suma a los nueve hallazgos.

No se recomienda eliminar estos recursos automáticamente. Las prioridades de contraste, foco, densidad y coherencia provienen de código, navegador y evaluación de uso, no de contar advertencias.

## Orden de mejora recomendado

1. **Base compartida:** documentar roles de color, variantes y densidades; corregir contraste y foco, retorno de diálogos y contrato de pestañas. Herramientas: `$impeccable document`, `$impeccable colorize`, `$impeccable harden`.
2. **Aplicación por contexto operativo:** POS, Caja, Producción y Operación del día; conservar controles en línea, borradores, revisión, idempotencia, alertas y tamaños táctiles. Herramientas: `$impeccable adapt`, `$impeccable layout`.
3. **Administración y contenido:** densidad de Ingredientes, ficha de Producto, secundarios, ayudas y textos. Herramientas: `$impeccable distill`, `$impeccable clarify`.
4. **Verificación y cierre:** repetir las mediciones y recorridos de teclado/móvil sobre el cambio autorizado; comparar la auditoría y terminar con `$impeccable polish`.

Puede ejecutarse por etapas o en el orden que se elija. Esta auditoría no implementó cambios ni hizo commit/push.
