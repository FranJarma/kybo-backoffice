---
p1_count: 2
target: Recorridos del personal — POS, Comandas, Producción y Caja
p0_count: 0
total_score: 24
na_heuristics:
max_score: 40
target_identity: "file:C:\\Users\\franj\\.codex\\worktrees\\order-ticket-printing\\kybo-operations-next\\src\\components\\sales\\sales-manager.tsx"
target_fingerprint: "sha256:c7796ec356fbda4b63579c01e4f1904eef865b1eccbd1ae2c70a8fff33455ce7"
target_path: "C:\\Users\\franj\\.codex\\worktrees\\order-ticket-printing\\kybo-operations-next\\src\\components\\sales\\sales-manager.tsx"
timestamp: 2026-11-03T20-03-04Z
slug: src-components-sales-sales-manager-tsx
---
# Recorridos del personal: POS, Comandas, Producción y Caja

Revisión con Impeccable: dos evaluaciones independientes, contrastadas después con pruebas de recorridos. Rama `codex/ui-consistency`, referencia `5326cfe`. Evaluación de la experiencia actual; no se aplicaron correcciones ni se hizo commit o push.

La identidad de Kybo y los controles compartidos están bien encaminados. La mayor oportunidad está en mantener el trabajo al cambiar de tarea y ofrecer acciones compatibles con los permisos. Conviene resolver esos puntos antes del siguiente pulido visual.

## Lo que funciona

- POS conserva cliente y localizador en línea, usa el Autocomplete compartido y tiene controles operativos de 48 px. Las selecciones se distinguen por texto, borde y color.
- Comandas y Mis tareas informan actualización y protegen acciones con datos desactualizados. Mis tareas consulta cada cinco segundos y también al recuperar foco o conexión.
- Caja separa efectivo y tarjetas, compara importes y comprobantes y organiza el cierre en tres pasos. En celular el efectivo esperado queda junto al campo contado, que recibe el foco.

## Cinco prioridades

### 1. [P1] Comandas ofrece una entrega que puede bloquear al personal

**Confirmado en navegador con una cuenta ficticia de personal.** Un pedido listo muestra `Entregar`. Al pulsarlo, el servidor responde que la entrega se registra desde el puesto del local; la interfaz trata ese rechazo como resultado incierto. Quedan deshabilitados tanto `Entregar` como `Empezar`, y el bloqueo sobrevive a la recarga. La protección de permisos del servidor funciona.

**Mejora:** exponer capacidades explícitas y reservar Entregar para los actores autorizados. Para un rechazo definitivo, permitir recuperar el módulo conservando la seguridad de los reintentos realmente inciertos. No ampliar permisos para ocultar el problema. Comando sugerido: `$impeccable harden`.

Fuentes: `src/components/preparation/card.tsx:213`, `src/modules/staff-work/access.ts:83`, `src/components/inventory/shared.tsx:284`. Evidencia: [Comandas bloqueada](C:/Users/franj/.codex/visualizations/2026/10/22/01a163f9-dd3d-71b2-bd12-0d0f2ad41533/staff-journeys/comandas-permiso-bloqueado.png).

### 2. [P1] Abrir Caja desde el aviso del POS pierde el pedido en curso

**Confirmado en navegador sin guardar una venta.** Se agregó una Pepsi a un borrador: 1 unidad, $1.800. El enlace Abrir caja del aviso llevó a Caja; al volver, el pedido tenía 0 unidades y $0. El botón del header ya permite abrir la caja en contexto, por lo que dos acciones equivalentes tienen consecuencias distintas.

**Mejora:** usar la apertura contextual también desde el aviso y proteger el borrador al salir a otra tarea operativa. Comando sugerido: `$impeccable harden`.

Fuentes: `src/components/cash/status-gate.tsx:59`, `src/components/sales/sales-manager.tsx:140`, `src/components/cash/header.tsx:166`.

### 3. [P2] Guardar y salir del cierre no guarda al cambiar de módulo

**Confirmado en navegador con una caja descartable.** Se ingresaron $23.500, se avanzó a Posnet y se salió. Dentro de Caja apareció Continuar cierre. Tras ir a Ventas y volver, apareció Cerrar caja y el conteo estaba vacío. El borrador sólo vive en la memoria de la página.

**Mejora:** restaurar un borrador vinculado a persona, sucursal y jornada, validando que siga abierta. Guardar referencias de comprobantes, sin almacenar los archivos de las fotos en el navegador. Comando sugerido: `$impeccable harden`.

Fuentes: `src/components/cash/manager.tsx:110`, `src/components/cash/close-dialog.tsx:401`.

### 4. [P2] El diagnóstico de un error de cobro puede desaparecer

**Confirmado por código; no se provocó un cobro fallido real.** Para errores ordinarios, la notificación dura ocho segundos, pero el formulario sigue diciendo Revisá el aviso antes de volver a confirmar. Una interrupción deja a la operadora sin la explicación. Los errores de stock tienen un tratamiento especial y no se generaliza este problema a ellos.

**Mejora:** mantener el error concreto y su acción de recuperación dentro del formulario hasta resolverlo. Comandos sugeridos: `$impeccable harden`, `$impeccable clarify`.

Fuentes: `src/components/sales/payment-dialog.tsx:501`, `src/components/ui/operation-alert.tsx:42`.

### 5. [P2] Producción no permite informar una diferencia desde la tarea personal

**Interfaz comprobada con una producción descartable; política confirmada en servidor.** Terminar producción registra la cantidad prevista y pide avisar al encargado si hubo diferencias. No hay una acción para informar cuánto se obtuvo o dejar la tarea pendiente de revisión. Es la política actual, no un permiso que se deba ampliar automáticamente.

**Mejora propuesta:** ofrecer Terminar según lo previsto e Informar diferencia al encargado, sin permitir ajustes directos de inventario al personal. La segunda vía requiere decidir el comportamiento con el negocio. Comandos sugeridos: `$impeccable clarify` y, una vez acordada la excepción, `$impeccable harden`.

Fuentes: `src/components/staff-work/cards.tsx:206`, `src/modules/production/orders.ts:254`. [Tarjeta de producción personal](C:/Users/franj/.codex/visualizations/2026/10/22/01a163f9-dd3d-71b2-bd12-0d0f2ad41533/staff-journeys/produccion-personal-previsto.png).

## Observaciones para el siguiente pase

- **Ayuda contradictoria:** Comandas dice que registrar preparación no descuenta insumos; marcar listo sí consume las reservas. Corregir la explicación y compartirla con POS (`preparation/board.tsx:507`, `preparation/service.ts:127`, `fulfillment/service.ts:171`).
- **Espacio en tablet:** a 1024×768 el primer producto empieza aproximadamente en y=606. Una sola fila queda visible bajo la configuración. Compactar encabezados y espacios conservando controles táctiles y cliente/localizador en línea. [Evidencia POS tablet](C:/Users/franj/.codex/visualizations/2026/10/22/01a163f9-dd3d-71b2-bd12-0d0f2ad41533/staff-journeys/pos-tablet.png).
- **Legibilidad:** origen, estación y algunos datos de Caja siguen en 10–11 px. Llevar los datos operativos necesarios a 12–14 px; reducir repetición antes que el tamaño.
- **Modificadores:** una línea con varias bebidas muestra la cantidad de producto y `2 × adicional` sin aclarar si es por unidad. Expresar por bebida o total. Riesgo de interpretación observado en código; no se comprobó una preparación incorrecta.
- **Actualización de Producción:** `/kitchen/production` exige Actualizar para descubrir cambios externos. `/staff/work?tab=production` sí tiene actualización automática. No tratar ambos recorridos como si fallaran igual.

Después de las correcciones funcionales, aplicar `$impeccable adapt`, `$impeccable typeset` y cerrar con `$impeccable polish`.

## Personas, carga y continuidad

- **Operadora de mostrador en hora pico:** perder el pedido al resolver Caja cerrada obliga a repetir la toma. El POS ofrece grupos claros, pero usa demasiada altura antes de la carta en tablet.
- **Personal nuevo en Barra/Cocina:** Entregar parece una siguiente acción válida y termina bloqueando el circuito; la ayuda de inventario contradice la acción real. Las cantidades de modificadores requieren interpretación.
- **Encargada interrumpida durante el cierre:** Guardar y salir promete continuidad que no existe tras cambiar de módulo. El conteo y la conciliación visual son claros; la recuperación es el punto débil.

Los valles de confianza se concentran en los rechazos y las interrupciones. Conservar el trabajo y explicar qué cambió reduce más esfuerzo que agregar nuevos paneles o confirmaciones. No se observó un exceso de opciones equivalentes en las acciones de tarea; la densidad del POS es principalmente vertical.

## Puntaje del alcance

Juicio heurístico de los cuatro recorridos, no certificación. Es el primer registro de este alcance y no se compara con la auditoría general anterior.

| Heurística | /4 |
| --- | ---: |
| Visibilidad del estado | 3 |
| Correspondencia con el trabajo real | 3 |
| Control y libertad | 2 |
| Consistencia | 2 |
| Prevención de errores | 2 |
| Reconocimiento frente a recuerdo | 3 |
| Flexibilidad y eficiencia | 3 |
| Diseño y simplicidad | 3 |
| Recuperación de errores | 1 |
| Ayuda y documentación | 2 |
| **Total** | **24/40** |

Salud técnica: accesibilidad 3/4, rendimiento 3/4, adaptación 3/4, tokens 2/4 e integridad 2/4: **13/20**. La prioridad es continuidad y recuperación.

## Evidencia y límites

Se inspeccionaron pantallas reales como administrador y se probaron acciones con personal ficticio en una base nueva, descartable y en memoria. La aplicación real de localhost:3000, sus cuentas, stock y caja no se modificaron. Los cierres sólo se recorrieron como formularios; no se confirmó el cierre ni se cargaron fotos. Hubo revisión de escritorio, POS tablet y conteo móvil; no se hizo un ensayo con personal real, lector de pantalla, teclado virtual o biometría.

El detector se ejecutó una vez: 200 avisos (199 advisory, 1 warning). Incluye 105 de tipografía, 60 de color y 34 de radios. Se revisaron en contexto; no equivalen a 200 defectos. El warning restante es un borde de sección y no demuestra daño operativo. Los pares base de contraste medidos superan 4,5:1, sin certificar todas las combinaciones. No se midió latencia de cobro en producción ni se hicieron pruebas de carga.

## Decisiones para continuar

1. ¿Qué alcance hacemos primero: las tres prioridades de bloqueo y borradores (recomendado), o las cinco prioridades?
2. Ante diferencias en producción, ¿el personal informa cantidad y motivo para revisión del encargado (recomendado), o mantenemos el aviso fuera del sistema y aclaramos el botón?

## Avance aprobado e implementado — 3 de noviembre de 2026

Las decisiones anteriores ya fueron respondidas: aplicar las cinco prioridades y permitir informar diferencias para revisión del encargado, sin ajustes de inventario directos por parte del personal. La primera etapa incorporó apertura de Caja en contexto, recuperación de borradores y rechazos, permisos de entrega y avisos persistentes.

El segundo pase, en la misma rama y sin commit ni push, agregó:

- **POS:** encabezado y navegación en una fila, herramientas agrupadas y configuración del pedido a todo el ancho. Cliente con Autocomplete y localizador continúan en línea. En la vista real de 1024×768, el primer producto comienza aproximadamente en y=491 frente a y=606 del relevamiento; los controles operativos conservan 48 px.
- **Comandas:** productos y cantidades con mayor jerarquía, notas del pedido diferenciadas y modificadores compartidos entre tablero, detalle y celular. Una selección de dos adicionales para tres productos muestra «2 por unidad · 6 en total».
- **Producción en PC:** consultas automáticas cada 10 segundos para órdenes activas y cada 30 para historial; se pausan en vistas ocultas. Las diferencias pendientes tienen estado y acceso de revisión visibles. Si una orden cambia mientras se edita, se conserva el borrador y se bloquea el envío hasta revisar la nueva versión. Los errores de conexión conservan datos y no se presentan como una cola vacía.

Verificación de este segundo pase: 16 pruebas de navegador aisladas, 17 pruebas de componentes y recuperación, revisión independiente sin hallazgos pendientes, ESLint y compilación con configuración de prueba sin conexión a Neon. Además se inspeccionaron POS y Producción reales en localhost:3000 sin registrar operaciones. Las pruebas incluyen borradores durante actualizaciones, órdenes que salen de un filtro, retorno a vistas, fallos iniciales y modificadores en 390 y 1440 px.

Los puntajes de este documento describen la auditoría inicial; no se recalcularon. Sigue pendiente validar los recorridos durante un turno real con el equipo. No se certificaron lector de pantalla, teclado virtual, todas las combinaciones de contraste ni latencia bajo carga.
